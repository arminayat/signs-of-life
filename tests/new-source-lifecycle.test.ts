import { afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { decodeJwt, exportPKCS8, generateKeyPair } from "jose";
import { and, eq } from "drizzle-orm";
import { fixture } from "./helpers";
import { createApi } from "../packages/backend/src/api";
import { runOne } from "../packages/backend/src/runner";
import { monitoringCredentials } from "../packages/backend/src/monitoring-access";
import { machineToken } from "../packages/adapters/src/monitoring/oauth";
import { lemonPayment } from "../packages/adapters/src/monitoring/lemon-squeezy-normalize";
import * as t from "../packages/db/src/schema";
import * as m from "../packages/db/src/schema-monitoring";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    {
      name: "Integration fixture",
      description: "",
      timezone: "UTC",
    },
    10,
  );
  const api = createApi(f.services);
  const post = (path: string, body: unknown) =>
    api.request(`/api${path}`, {
      method: "POST",
      headers: {
        origin: f.services.config.PUBLIC_URL,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return { ...f, workspaceId, project, api, post };
}
async function serviceAccount() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return JSON.stringify({
    type: "service_account",
    client_email: "fixture@fixture.iam.gserviceaccount.com",
    private_key: await exportPKCS8(privateKey),
    token_uri: "https://untrusted.example.test/must-not-be-used",
  });
}

it("uses a fixed Google token endpoint and read-only Storage scope, and reuses fresh tokens", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ access_token: "fixture-token", expires_in: 3600 }),
    );
  const credentials = {
    serviceAccount: await serviceAccount(),
    bucket: "pubsite_prod_rev_fixture",
  };
  const token = await machineToken(http, "google-play", credentials);
  expect(String(http.mock.calls[0][0])).toBe(
    "https://oauth2.googleapis.com/token",
  );
  const assertion = new URLSearchParams(
    String(http.mock.calls[0][1]?.body),
  ).get("assertion")!;
  expect(decodeJwt(assertion)).toMatchObject({
    scope: "https://www.googleapis.com/auth/devstorage.read_only",
    aud: "https://oauth2.googleapis.com/token",
  });
  expect(await machineToken(http, "google-play", token)).toBe(token);
  expect(http).toHaveBeenCalledTimes(1);
  await expect(
    machineToken(http, "google-play", { serviceAccount: "not-json" }),
  ).rejects.toMatchObject({ code: "invalid_service_account" });
});

it("connects Google Play, selects an app, collects a report and refreshes its encrypted credentials", async () => {
  const f = await setup();
  const day = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
  const report = `Date,Package Name,Country,Daily Device Installs,Daily Device Uninstalls\n${day},com.example.app,US,7,2\n`;
  f.services.http = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const target = new URL(String(input));
    if (target.hostname === "oauth2.googleapis.com")
      return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    if (target.searchParams.get("alt") === "media")
      return new Response(Buffer.from("\ufeff" + report, "utf16le"));
    return Response.json({
      items: [
        {
          name: `stats/installs/installs_com.example.app_${day.slice(0, 7).replace("-", "")}_country.csv`,
        },
      ],
    });
  });
  const response = await f.post(
    "/monitor/connections/google-play/credentials",
    {
      projectId: f.project.id,
      credentials: {
        serviceAccount: await serviceAccount(),
        bucket: "pubsite_prod_rev_fixture",
      },
    },
  );
  expect(response.status).toBe(201);
  const { id: connectionId } = (await response.json()) as { id: string };
  const selected = await f.post("/sources", {
    projectId: f.project.id,
    connectionId,
    externalId: "com.example.app",
    name: "Android app",
  });
  expect(selected.status).toBe(201);
  const source = (await selected.json()) as { id: string };
  const views = (await f.store.monitoringSnapshot(f.workspaceId, f.project.id))
    .views;
  expect(views).toContainEqual(
    expect.objectContaining({ sourceId: source.id, metric: "native:installs" }),
  );
  const requested = await f.post(`/sources/${source.id}/metric-queries`, {
    metric: "native:installs",
    from: day,
    to: day,
  });
  expect(requested.status).toBe(202);
  const metric = (await requested.json()) as { id: string };
  const jobs = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.workspaceId, f.workspaceId));
  const job = jobs.find(
    (j) =>
      j.payload.kind === "monitor.metric" && j.payload.metricId === metric.id,
  )!;
  expect(job).toBeDefined();
  await runOne(f.services, job.id);
  expect(
    (await f.store.metricRequest(f.workspaceId, metric.id))?.result,
  ).toMatchObject({
    summary: "7",
    status: "available",
    points: [{ label: day, value: "7" }],
  });
  const connection = (await f.store.connection(f.workspaceId, connectionId))!;
  const credentials = await f.services.secrets.open<Record<string, string>>(
    connection.secret,
    connectionId,
  );
  await f.store.updateConnection(connectionId, {
    secret: await f.services.secrets.seal(
      { ...credentials, expiresAt: "0" },
      connectionId,
    ),
  });
  const expired = (await f.store.connection(f.workspaceId, connectionId))!;
  expect(await monitoringCredentials(f.services, expired)).toMatchObject({
    accessToken: "fixture-token",
  });
  expect(
    (await f.store.connection(f.workspaceId, connectionId))?.secret,
  ).not.toBe(expired.secret);
  const dashboard = JSON.stringify(await f.store.snapshot(f.workspaceId));
  expect(dashboard).not.toContain("fixture-token");
  expect(dashboard).not.toContain("PRIVATE KEY");
  const other = await setup();
  expect(
    (await other.api.request(`/api/sources/${source.id}/metrics`)).status,
  ).toBe(404);
});

it("connects Lemon Squeezy and processes signed payment webhooks once through durable jobs", async () => {
  const f = await setup();
  f.services.http = async () =>
    Response.json({
      data: [
        { type: "stores", id: "1", attributes: { name: "Fixture store" } },
      ],
      links: { next: null },
    });
  const webhookSecret = "fixture-signing-secret-for-test-only";
  const response = await f.post(
    "/monitor/connections/lemon-squeezy/credentials",
    {
      projectId: f.project.id,
      credentials: {
        apiKey: "fixture-key",
        environment: "production",
        webhookSecret,
      },
    },
  );
  expect(response.status).toBe(201);
  const { id: connectionId } = (await response.json()) as { id: string };
  const selected = await f.post("/sources", {
    projectId: f.project.id,
    connectionId,
    externalId: "1",
    name: "Store",
  });
  expect(selected.status).toBe(201);
  const { id: sourceId } = (await selected.json()) as { id: string };
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId: f.workspaceId,
      name: "Fixture",
      kind: "telegram",
      address: "123",
      unsubscribeHash: crypto.randomUUID(),
    },
    10,
  );
  await f.store.updateDestination(f.workspaceId, destinationId, {
    verified: true,
  });
  await f.store.updateProject(f.workspaceId, f.project.id, {}, [destinationId]);
  const raw = JSON.stringify({
    meta: { event_name: "order_created" },
    data: {
      type: "orders",
      id: "123",
      attributes: {
        store_id: 1,
        test_mode: false,
        status: "paid",
        total: 1250,
        currency: "USD",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_email: "must-not-persist@example.test",
      },
    },
  });
  const signature = createHmac("sha256", webhookSecret)
    .update(raw)
    .digest("hex");
  const send = (body: string) =>
    f.api.request(`/api/webhooks/monitor/${connectionId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": signature },
      body,
    });
  expect((await send(raw + " ")).status).toBe(401);
  expect((await send(raw)).status).toBe(202);
  expect((await send(raw)).status).toBe(202);
  const jobs = await f.db
    .select()
    .from(t.jobs)
    .where(
      and(eq(t.jobs.workspaceId, f.workspaceId), eq(t.jobs.status, "pending")),
    );
  for (const job of jobs.filter((j) => j.payload.kind === "monitor.webhook"))
    await runOne(f.services, job.id);
  const snapshot = await f.store.snapshot(f.workspaceId);
  expect(snapshot.deliveries).toHaveLength(1);
  expect(snapshot.deliveries[0].notification.text).toContain("12.50 USD");
  expect(
    JSON.stringify(
      await f.store.monitoringSnapshot(f.workspaceId, f.project.id),
    ),
  ).not.toContain("must-not-persist");
  // API history may see a paid invoice with its original, pre-connection
  // creation date before the signed recovery callback reaches our inbox.
  const source = (await f.store.source(f.workspaceId, sourceId))!;
  await f.store.monitorPreferences(sourceId, ["payment", "renewal"]);
  const recoveredAt = new Date(source.baseline.getTime() + 1000).toISOString();
  const invoice = {
    type: "subscription-invoices",
    id: "456",
    attributes: {
      store_id: 1,
      test_mode: false,
      status: "paid",
      total: 1250,
      currency: "USD",
      billing_reason: "renewal",
      created_at: new Date(source.baseline.getTime() - 86400_000).toISOString(),
      updated_at: recoveredAt,
    },
  };
  const imported = lemonPayment(invoice, "subscription-invoices");
  await f.store.saveMonitorPage(source, imported, {}, true);
  for (const eventName of [
    "subscription_payment_recovered",
    "subscription_payment_success",
    "subscription_payment_recovered",
  ]) {
    const body = JSON.stringify({
      meta: { event_name: eventName },
      data: invoice,
    });
    expect(
      (
        await f.api.request(`/api/webhooks/monitor/${connectionId}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-signature": createHmac("sha256", webhookSecret)
              .update(body)
              .digest("hex"),
          },
          body,
        })
      ).status,
    ).toBe(202);
    const pending = await f.db
      .select()
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, f.workspaceId),
          eq(t.jobs.status, "pending"),
        ),
      );
    for (const job of pending.filter(
      (j) => j.payload.kind === "monitor.webhook",
    ))
      await runOne(f.services, job.id);
  }
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(2);
  await f.store.saveMonitorPage(source, imported, {}, false);
  const canonical = await f.db
    .select()
    .from(m.monitorEvents)
    .where(eq(m.monitorEvents.projectId, f.project.id));
  expect(canonical.filter((event) => event.kind === "renewal")).toEqual([
    expect.objectContaining({
      occurredAt: new Date(recoveredAt),
      notified: true,
    }),
  ]);
  expect(
    (
      await f.post("/monitor/connections/lemon-squeezy/credentials", {
        projectId: f.project.id,
        credentials: { apiKey: "fixture", environment: "invalid" },
      })
    ).status,
  ).toBe(400);
});
