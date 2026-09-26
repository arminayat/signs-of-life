import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import { createApi } from "../packages/backend/src/api";
import { monitoringCredentials } from "../packages/backend/src/monitoring-access";
import { verifiedMatches } from "../packages/backend/src/monitoring-matches";
import { runOne } from "../packages/backend/src/runner";
import type { Observation } from "../packages/core/src/monitoring";
import * as t from "../packages/db/src/schema";
import * as m from "../packages/db/src/schema-monitoring";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function setup() {
  const f = await fixture();
  closers.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "Security fixture", description: "", timezone: "UTC" },
    25,
  );
  const id = crypto.randomUUID();
  await f.store.saveConnection({
    id,
    workspaceId,
    projectId: project.id,
    name: "Stripe",
    kind: "stripe",
    externalId: "acct_1",
    secret: await f.services.secrets.seal(
      { apiKey: "rk_test_fixture", accountId: "acct_1" },
      id,
    ),
  });
  const source = await f.store.createSource(
    {
      workspaceId,
      projectId: project.id,
      connectionId: id,
      kind: "stripe",
      externalId: "acct_1",
      name: "Account",
      environment: "sandbox",
    },
    25,
  );
  return { ...f, workspaceId, project, id, source };
}
it("binds OAuth state to workspace and consumes callbacks once", async () => {
  const f = await setup(),
    other = await fixture();
  closers.push(other.close);
  f.services.config.STRIPE_OAUTH_CLIENT_ID = "ca_fixture";
  f.services.config.STRIPE_OAUTH_CLIENT_SECRET = "developer_fixture";
  const api = createApi(f.services);
  const response = await api.request("/api/monitor/connections/stripe/start", {
    method: "POST",
    headers: {
      origin: f.services.config.PUBLIC_URL,
      "content-type": "application/json",
    },
    body: JSON.stringify({ projectId: f.project.id }),
  });
  expect(response.status).toBe(200);
  const state = new URL(
    ((await response.json()) as { url: string }).url,
  ).searchParams.get("state");
  const callback = `/api/monitor/connections/stripe/callback?state=${state}&code=fixture`;
  expect((await createApi(other.services).request(callback)).status).toBe(400);
  f.services.http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "access",
        refresh_token: "refresh",
        livemode: false,
      }),
    )
    .mockResolvedValueOnce(Response.json({ id: "acct_2" }));
  expect((await api.request(callback)).status).toBe(303);
  expect((await api.request(callback)).status).toBe(400);
  expect(f.services.http).toHaveBeenCalledTimes(2);
});
it("does not restore credentials after disconnect races with OAuth refresh", async () => {
  const f = await setup();
  f.services.config.STRIPE_OAUTH_CLIENT_ID = "client";
  f.services.config.STRIPE_OAUTH_CLIENT_SECRET = "developer";
  await f.store.updateConnection(f.id, {
    secret: await f.services.secrets.seal(
      { authMethod: "oauth", refreshToken: "old", expiresAt: "0" },
      f.id,
    ),
  });
  const connection = (await f.store.connection(f.workspaceId, f.id))!;
  let finish!: (response: Response) => void;
  f.services.http = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const refreshing = monitoringCredentials(f.services, connection);
  const rejected = expect(refreshing).rejects.toMatchObject({
    code: "connection_changed_during_refresh",
  });
  await vi.waitFor(() => expect(f.services.http).toHaveBeenCalledTimes(1));
  await f.store.disconnect(f.workspaceId, f.id);
  finish(Response.json({ access_token: "new", refresh_token: "new-refresh" }));
  await rejected;
  await f.store.updateConnection(f.id, {
    status: "connected",
    lastError: null,
    secret: "stale-worker-secret",
  });
  expect(await f.store.refreshLock(f.id, new Date(Date.now() + 60_000))).toBe(
    false,
  );
  expect(await f.store.connection(f.workspaceId, f.id)).toMatchObject({
    active: false,
    secret: "",
    status: "disconnected",
  });
});
it("rejects a stale collector lease before committing cursor or notifications", async () => {
  const f = await setup();
  const [row] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `monitor:${f.source.id}:true`));
  const job = (await f.store.claim(row.id))!;
  await f.db
    .update(t.jobs)
    .set({ leaseToken: crypto.randomUUID() })
    .where(eq(t.jobs.id, job.id));
  await expect(
    f.store.saveMonitorPage(f.source, [], { historyDone: true }, true, job),
  ).rejects.toMatchObject({ code: "job_lease_lost" });
  expect((await f.store.monitorState(f.source.id))?.historyDone).toBe(false);
});
it("does not let an expired worker overwrite the next worker's health", async () => {
  const f = await setup();
  const [job] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `monitor:${f.source.id}:true`));
  f.services.http = vi.fn<typeof fetch>().mockImplementation(async () => {
    await f.db
      .update(t.jobs)
      .set({ leaseToken: crypto.randomUUID() })
      .where(eq(t.jobs.id, job.id));
    await f.store.sourceError(f.source.id, "newer_worker_error");
    await f.store.monitorError(f.source.id, true, "newer_worker_error");
    return Response.json({ data: [], has_more: false });
  });
  await runOne(f.services, job.id);
  expect((await f.store.source(f.workspaceId, f.source.id))?.lastError).toBe(
    "newer_worker_error",
  );
  expect((await f.store.monitorState(f.source.id))?.historyError).toBe(
    "newer_worker_error",
  );
});
it("verifies Stripe account and environment for cross-provider matches in either arrival order", async () => {
  const f = await setup();
  const event: Observation = {
    id: "rc-event",
    kind: "renewal",
    resourceId: "rc-app",
    environment: "sandbox",
    occurredAt: new Date().toISOString(),
    candidate: { provider: "stripe", object: "in_fixture" },
  };
  f.services.http = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      id: "in_fixture",
      paid: true,
      billing_reason: "subscription_cycle",
      livemode: false,
      created: Date.now() / 1000,
      amount_paid: 1000,
      currency: "usd",
      email: "never-store@example.test",
    }),
  );
  const [matched] = await verifiedMatches(f.services, f.source, [event]);
  expect(matched.reference).toEqual({
    provider: "stripe",
    account: "acct_1",
    object: "in_fixture",
    action: "renewal",
  });
  expect(JSON.stringify(matched)).not.toContain("never-store");
  expect(
    (
      await verifiedMatches(f.services, f.source, [
        { ...event, environment: "production" },
      ])
    )[0].reference,
  ).toBeUndefined();
  f.services.http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({}, { status: 404 }));
  expect(
    (await verifiedMatches(f.services, f.source, [event]))[0].reference,
  ).toBeUndefined();
});
it("retains stalled dedup identities while removing old monetary details and expired metric queries", async () => {
  const f = await setup();
  const old = new Date(Date.now() - 400 * 86400_000).toISOString();
  await f.store.saveMonitorPage(
    f.source,
    [
      {
        id: "old",
        resourceId: "acct_1",
        environment: "sandbox",
        kind: "payment",
        occurredAt: old,
        amount: "1.00",
        currency: "USD",
      },
    ],
    {},
    true,
  );
  const query = {
    metric: "payment",
    from: old.slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    filters: {},
  };
  const metric = await f.store.requestMetric(f.source, query, "old-query");
  await f.store.cleanup();
  let events = await f.db
    .select()
    .from(m.monitorEvents)
    .where(eq(m.monitorEvents.projectId, f.project.id));
  expect(events).toHaveLength(1);
  expect(events[0].amount).toBeNull();
  expect(await f.store.metricRequest(f.workspaceId, metric.id)).toBeUndefined();
  await f.store.saveMonitorPage(
    f.source,
    [],
    { historyDone: true, liveFrom: new Date().toISOString() },
    true,
  );
  await f.store.cleanup();
  events = await f.db
    .select()
    .from(m.monitorEvents)
    .where(eq(m.monitorEvents.projectId, f.project.id));
  expect(events).toHaveLength(0);
});
it("Apple reconnect resumes the terminated job without resetting source history", async () => {
  const f = await setup(),
    id = crypto.randomUUID();
  await f.store.saveConnection({
    id,
    workspaceId: f.workspaceId,
    projectId: f.project.id,
    name: "Apple",
    kind: "apple",
    externalId: "12345",
    secret: "fixture",
  });
  const source = await f.store.createSource(
    {
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      connectionId: id,
      kind: "apple",
      externalId: "123456789",
      name: "App",
    },
    25,
  );
  await f.store.disconnect(f.workspaceId, id);
  await f.db
    .update(t.jobs)
    .set({
      status: "failed",
      lastError: "connection_not_found_or_disconnected",
    })
    .where(eq(t.jobs.key, `apple:${id}`));
  const response = await createApi(f.services).request(
    "/api/connections/apple",
    {
      method: "POST",
      headers: {
        origin: f.services.config.PUBLIC_URL,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: f.project.id,
        connectionId: id,
        issuerId: crypto.randomUUID(),
        keyId: "ABCDEFGHIJ",
        privateKey: "fixture-only-".repeat(20),
        vendorNumber: "12345",
      }),
    },
  );
  expect(response.status).toBe(201);
  const [job] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `apple:${id}`));
  expect(job.status).toBe("pending");
  expect((await f.store.source(f.workspaceId, source.id))?.baseline).toEqual(
    source.baseline,
  );
});
it("allows production and sandbox resources without merging their observations", async () => {
  const f = await setup();
  const production = await f.store.createSource(
    {
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      connectionId: f.id,
      kind: "stripe",
      externalId: "acct_1",
      name: "Production",
      environment: "production",
    },
    25,
  );
  const event: Observation = {
    id: "same-object",
    resourceId: "acct_1",
    environment: "sandbox",
    kind: "payment",
    occurredAt: new Date().toISOString(),
    reference: {
      provider: "stripe",
      account: "acct_1",
      object: "ch_1",
      action: "payment",
    },
  };
  await f.store.saveMonitorPage(f.source, [event], {}, false);
  await f.store.saveMonitorPage(
    production,
    [{ ...event, environment: "production" }],
    {},
    false,
  );
  expect(
    await f.db
      .select()
      .from(m.monitorEvents)
      .where(eq(m.monitorEvents.projectId, f.project.id)),
  ).toHaveLength(2);
});
it("retains daily series independently and never recreates a period-unique total", async () => {
  const f = await setup();
  const date = new Date().toISOString().slice(0, 10);
  const query = { metric: "activeUsers", from: date, to: date, filters: {} };
  const request = await f.store.requestMetric(f.source, query, "series-test");
  await f.store.saveMetric(
    request.id,
    {
      shape: "series",
      unit: "count",
      timezone: "UTC",
      definition: "Provider active users",
      status: "available",
      summary: "8",
      points: [{ label: date, value: "10" }],
      fetchedAt: new Date().toISOString(),
    },
    null,
  );
  await f.db
    .delete(m.monitorMetrics)
    .where(eq(m.monitorMetrics.id, request.id));
  const retained = await f.store.retainedSeries(f.source.id, query);
  expect(retained).toMatchObject({
    status: "partial",
    points: [{ label: date, value: "10" }],
  });
  expect(retained?.summary).toBeUndefined();
});
