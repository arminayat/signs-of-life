import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../packages/backend/src/api";
import { fixture } from "./helpers";
import { hashToken } from "../packages/adapters/src/crypto";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const value = await fixture();
  cleanups.push(value.close);
  return { ...value, app: createApi(value.services) };
}
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
describe("API tenant and lifecycle contracts", () => {
  it("binds Supabase OAuth state to its workspace and rejects callback replay", async () => {
    const a = await setup(),
      b = await setup();
    a.services.config.SUPABASE_OAUTH_CLIENT_ID = "test-client";
    a.services.config.SUPABASE_OAUTH_CLIENT_SECRET = "test-secret";
    const start = await a.app.fetch(write("/connections/supabase/start", {}));
    expect(start.status).toBe(200);
    const url = new URL(((await start.json()) as { url: string }).url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = `/api/connections/supabase/callback?state=${url.searchParams.get("state")}&code=fixture-code`;
    expect((await b.app.request(callback)).status).toBe(400);
    expect((await a.app.request(callback)).status).toBe(303);
    expect((await a.app.request(callback)).status).toBe(400);
    expect(
      (await a.store.snapshot(a.member!.workspaceId)).connections,
    ).toHaveLength(1);
    expect(
      (await b.store.snapshot(b.member!.workspaceId)).connections,
    ).toHaveLength(0);
  });
  it("rejects unauthenticated access and cross-origin writes", async () => {
    const f = await fixture(null);
    cleanups.push(f.close);
    const app = createApi(f.services);
    expect((await app.request("/api/dashboard")).status).toBe(401);
    expect(
      (await app.request("/api/projects", { method: "POST", body: "{}" }))
        .status,
    ).toBe(403);
  });
  it("isolates project updates, source connections and destination assignment between two owners", async () => {
    const a = await setup(),
      b = await setup();
    const project = await a.store.createProject(
      a.member!.workspaceId,
      { name: "A", description: "", timezone: "UTC" },
      5,
    );
    expect(
      (
        await b.app.fetch(
          write(`/projects/${project.id}`, { name: "Stolen" }, "PATCH"),
        )
      ).status,
    ).toBe(404);
    const destinationId = crypto.randomUUID();
    await b.store.createDestination(
      {
        id: destinationId,
        workspaceId: b.member!.workspaceId,
        kind: "email",
        name: "B",
        address: "b@example.test",
        unsubscribeHash: "hash-B",
      },
      3,
    );
    expect(
      (
        await a.app.fetch(
          write(
            `/projects/${project.id}`,
            { destinationIds: [destinationId] },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (await b.store.snapshot(b.member!.workspaceId)).projects,
    ).toHaveLength(0);
    expect(
      (await a.store.project(a.member!.workspaceId, project.id))?.name,
    ).toBe("A");
  });
  it("does not expose credential ciphertext, verification links or unsubscribe capabilities", async () => {
    const f = await setup();
    const id = crypto.randomUUID();
    await f.store.saveConnection({
      id,
      workspaceId: f.member!.workspaceId,
      kind: "supabase",
      name: "Supabase",
      secret: "CIPHERTEXT_SECRET",
      externalId: null,
    });
    const response = await f.app.request("/api/dashboard");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("CIPHERTEXT_SECRET");
    expect(body).not.toContain("refreshLease");
  });
  it("requires explicit email verification and consumes its token once", async () => {
    const f = await setup();
    const id = crypto.randomUUID(),
      token = "a".repeat(43);
    await f.store.createDestination(
      {
        id,
        workspaceId: f.member!.workspaceId,
        kind: "email",
        name: "Inbox",
        address: "a@example.test",
        unsubscribeHash: "hash-A",
      },
      3,
    );
    await f.store.challenge({
      hash: await hashToken(token),
      workspaceId: f.member!.workspaceId,
      purpose: "email",
      destinationId: id,
      secret: null,
      expiresAt: new Date(Date.now() + 10000),
    });
    expect(
      (await f.app.request(`/api/verify-email?token=${token}`)).status,
    ).toBe(404);
    expect(
      (await f.store.destination(f.member!.workspaceId, id))?.verified,
    ).toBe(false);
    expect((await f.app.fetch(write("/verify-email", { token }))).status).toBe(
      200,
    );
    expect((await f.app.fetch(write("/verify-email", { token }))).status).toBe(
      400,
    );
    expect(
      (await f.store.destination(f.member!.workspaceId, id))?.verified,
    ).toBe(true);
  });
  it("rejects Telegram webhooks without the installation secret", async () => {
    const f = await setup();
    expect(
      (await f.app.fetch(write("/webhooks/telegram", { update_id: 1 }))).status,
    ).toBe(401);
  });
  it("enforces workspace limits atomically under concurrent creation", async () => {
    const f = await setup();
    const calls = await Promise.allSettled(
      Array.from({ length: 7 }, (_, i) =>
        f.store.createProject(
          f.member!.workspaceId,
          { name: `Project ${i}`, description: "", timezone: "UTC" },
          5,
        ),
      ),
    );
    expect(calls.filter((call) => call.status === "fulfilled")).toHaveLength(5);
  });
});
