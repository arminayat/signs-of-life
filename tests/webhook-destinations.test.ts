import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import { createApi } from "../packages/backend/src/api";
import { runOne } from "../packages/backend/src/runner";
import { webhookChannel } from "../packages/adapters/src/webhook-channels";
import { hashToken } from "../packages/adapters/src/crypto";
import * as cryptoHelpers from "../packages/adapters/src/crypto";
import * as t from "../packages/db/src/schema";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanups.splice(0)) await close();
});
function write(path: string, body: unknown, method = "POST") {
  return new Request(`http://localhost:5173/api${path}`, {
    method,
    headers: {
      origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  // Recipient throttles intentionally outlive workspace cleanup.
  const token = crypto.randomUUID().replaceAll("-", "");
  const urls = {
    slack: `https://hooks.slack.com/services/TTEST/BTEST/fixture${token}`,
    discord: `https://discord.com/api/webhooks/123456789/fixture_${token}`,
  };
  const http = vi.fn<typeof fetch>(async (input) =>
    String(input).includes("discord.com")
      ? Response.json({ id: "987654321" })
      : new Response("ok"),
  );
  f.services.channels.slack = webhookChannel("slack", http);
  f.services.channels.discord = webhookChannel("discord", http);
  const app = createApi(f.services);
  const workspaceId = f.member!.workspaceId;
  async function deliver(id: string) {
    const [job] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `delivery:${id}`));
    await runOne(f.services, job.id);
    return f.store.delivery(workspaceId, id);
  }
  async function create(kind: "slack" | "discord") {
    const response = await app.fetch(
      write("/destinations", {
        name: "Product updates",
        kind,
        webhookUrl: urls[kind],
      }),
    );
    expect(response.status).toBe(201);
    const result = (await response.json()) as {
      id: string;
      codeRequired: boolean;
    };
    expect(result.codeRequired).toBe(true);
    return result.id;
  }
  return { ...f, app, workspaceId, http, deliver, create, urls };
}

describe("Slack and Discord destination lifecycle", () => {
  it.each(["slack", "discord"] as const)(
    "encrypts and verifies %s before delivery and routing",
    async (kind) => {
      const f = await setup();
      const id = await f.create(kind);
      const stored = (await f.store.destination(f.workspaceId, id))!;
      expect(stored.verified).toBe(false);
      expect(stored.address).toBe(
        kind === "slack" ? "Slack channel" : "Discord channel",
      );
      expect(stored.secret).not.toContain(f.urls[kind]);
      expect(await f.services.secrets.open(stored.secret!, id)).toEqual({
        url: f.urls[kind],
      });
      const config = (await (await f.app.request("/api/config")).json()) as {
        channels: Record<string, boolean>;
      };
      expect(config.channels[kind]).toBe(true);
      const project = await f.store.createProject(
        f.workspaceId,
        { name: "Product", timezone: "UTC", description: "" },
        5,
      );
      await f.store.updateProject(f.workspaceId, project.id, {}, [id]);
      await f.store.fanout(project, "before-verification", {
        title: "No send",
        text: "Not verified",
      });
      let snapshot = await f.store.snapshot(f.workspaceId);
      expect(snapshot.deliveries).toHaveLength(1);
      expect(
        (await f.app.fetch(write(`/destinations/${id}/test`, {}))).status,
      ).toBe(400);
      const result = await f.deliver(snapshot.deliveries[0].id);
      expect(result?.status).toBe("accepted");
      const [url, request] = f.http.mock.calls[0];
      expect(String(url)).toBe(
        f.urls[kind] + (kind === "discord" ? "?wait=true" : ""),
      );
      const body = JSON.parse(String(request?.body));
      const text = kind === "slack" ? body.text : body.content;
      const displayCode = text.split("\n\n")[2];
      const code = kind === "discord" ? displayCode.slice(1, -1) : displayCode;
      expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);
      const dashboard = await (await f.app.request("/api/dashboard")).text();
      expect(dashboard).not.toContain(code);
      expect(dashboard).not.toContain(f.urls[kind]);
      expect(dashboard).not.toContain(stored.secret!);
      expect(dashboard).not.toContain('"secret"');
      expect(
        (await f.app.fetch(write(`/destinations/${id}/confirm`, { code })))
          .status,
      ).toBe(200);
      expect(
        (await f.app.fetch(write(`/destinations/${id}/confirm`, { code })))
          .status,
      ).toBe(404);
      expect((await f.store.destination(f.workspaceId, id))?.verified).toBe(
        true,
      );
      expect(
        (await f.app.fetch(write(`/destinations/${id}/test`, {}))).status,
      ).toBe(202);
      snapshot = await f.store.snapshot(f.workspaceId);
      const test = snapshot.deliveries.find(
        (d) => d.purpose !== "verification",
      )!;
      expect((await f.deliver(test.id))?.status).toBe("accepted");
      await f.store.fanout(project, "after-verification", {
        title: "New account",
        text: "A signup",
      });
      expect(
        (await f.store.snapshot(f.workspaceId)).deliveries.some(
          (d) => d.projectId === project.id,
        ),
      ).toBe(true);
      await f.app.fetch(
        write(`/destinations/${id}`, { enabled: false }, "PATCH"),
      );
      expect(
        (await f.app.fetch(write(`/destinations/${id}/test`, {}))).status,
      ).toBe(400);
    },
  );

  it("binds codes to their destination and workspace without consuming a different code", async () => {
    const a = await setup(),
      b = await setup();
    const first = await a.create("slack"),
      second = await a.create("slack"),
      outsider = await b.create("slack");
    const code = "fixture-confirm-code";
    await a.store.challenge({
      hash: await hashToken(code),
      workspaceId: a.workspaceId,
      destinationId: first,
      purpose: `webhook:slack:${first}`,
      secret: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(
      (await a.app.fetch(write(`/destinations/${second}/confirm`, { code })))
        .status,
    ).toBe(400);
    expect(
      (await b.app.fetch(write(`/destinations/${first}/confirm`, { code })))
        .status,
    ).toBe(404);
    expect(
      (await b.app.fetch(write(`/destinations/${outsider}/confirm`, { code })))
        .status,
    ).toBe(400);
    expect(
      (await a.app.fetch(write(`/destinations/${first}/confirm`, { code })))
        .status,
    ).toBe(200);
    expect(a.http).not.toHaveBeenCalled();
    const expired = "expired-code";
    await a.store.challenge({
      hash: await hashToken(expired),
      workspaceId: a.workspaceId,
      destinationId: second,
      purpose: `webhook:slack:${second}`,
      secret: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      (
        await a.app.fetch(
          write(`/destinations/${second}/confirm`, { code: expired }),
        )
      ).status,
    ).toBe(400);
    for (let i = 0; i < 8; i++)
      expect(
        (
          await a.app.fetch(
            write(`/destinations/${second}/confirm`, { code: "wrong" }),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await a.app.fetch(
          write(`/destinations/${second}/confirm`, { code: "wrong" }),
        )
      ).status,
    ).toBe(429);
  });

  it("preserves Markdown-sensitive Discord code characters for confirmation", async () => {
    const f = await setup();
    const code = "_abcdefghij_";
    vi.spyOn(cryptoHelpers, "randomToken").mockReturnValueOnce(
      code + "x".repeat(31),
    );
    const id = await f.create("discord");
    const verification = (await f.store.snapshot(f.workspaceId)).deliveries[0];
    expect((await f.deliver(verification.id))?.status).toBe("accepted");
    const body = JSON.parse(String(f.http.mock.calls[0][1]?.body));
    expect(body.content).toContain(`\n\n\`${code}\`\n\n`);
    expect(
      (await f.app.fetch(write(`/destinations/${id}/confirm`, { code })))
        .status,
    ).toBe(200);
  });

  it.each(["slack", "discord"] as const)(
    "never repeats an interrupted or ambiguous %s send",
    async (kind) => {
      const f = await setup();
      const id = await f.create(kind);
      const verification = (await f.store.snapshot(f.workspaceId))
        .deliveries[0];
      await f.store.updateDelivery(verification.id, {
        status: "sending",
        attempts: 1,
        startedAt: new Date(),
      });
      expect((await f.deliver(verification.id))?.status).toBe("uncertain");
      expect(f.http).not.toHaveBeenCalled();
      await f.store.updateDestination(f.workspaceId, id, { verified: true });
      await f.app.fetch(write(`/destinations/${id}/test`, {}));
      const test = (await f.store.snapshot(f.workspaceId)).deliveries.find(
        (d) => d.purpose !== "verification",
      )!;
      f.http.mockResolvedValue(new Response("service error", { status: 503 }));
      expect((await f.deliver(test.id))?.status).toBe("uncertain");
      expect(f.http).toHaveBeenCalledTimes(1);
      await f.deliver(test.id);
      expect(f.http).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects untrusted URLs without storing them or sending HTTP requests", async () => {
    const f = await setup();
    const response = await f.app.fetch(
      write("/destinations", {
        kind: "slack",
        name: "Invalid",
        webhookUrl: "https://127.0.0.1/secrets",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("127.0.0.1");
    expect((await f.store.snapshot(f.workspaceId)).destinations).toHaveLength(
      0,
    );
    expect(f.http).not.toHaveBeenCalled();
  });
});
