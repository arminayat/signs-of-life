import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import { createApi } from "../packages/backend/src/api";
import { runOne } from "../packages/backend/src/runner";
import { hashToken } from "../packages/adapters/src/crypto";
import { monitoringCredentials } from "../packages/backend/src/monitoring-access";
import * as t from "../packages/db/src/schema";
import * as m from "../packages/db/src/schema-monitoring";
import type { Observation } from "../packages/core/src/monitoring";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "Monitor", description: "", timezone: "Europe/Berlin" },
    5,
  );
  const connectionId = crypto.randomUUID();
  await f.store.saveConnection({
    id: connectionId,
    workspaceId,
    projectId: project.id,
    name: "Clerk",
    kind: "clerk",
    secret: await f.services.secrets.seal(
      { apiKey: "sk_test_fixture" },
      connectionId,
    ),
    externalId: "ins_1",
  });
  const source = await f.store.createSource(
    {
      workspaceId,
      projectId: project.id,
      connectionId,
      kind: "clerk",
      externalId: "ins_1",
      name: "Accounts",
      environment: "sandbox",
    },
    25,
  );
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId,
      name: "Test",
      kind: "telegram",
      address: "123",
      unsubscribeHash: crypto.randomUUID(),
    },
    3,
  );
  await f.store.updateDestination(workspaceId, destinationId, {
    verified: true,
  });
  await f.store.updateProject(workspaceId, project.id, {}, [destinationId]);
  return { ...f, workspaceId, project, connectionId, source };
}
it("commits silent imports, distinct live checkpoints, overlap dedup and notification defaults", async () => {
  const f = await setup();
  const before = new Date(f.source.baseline.getTime() - 3600_000).toISOString(),
    after = new Date(f.source.baseline.getTime() + 1).toISOString();
  const event: Observation = {
    id: "historical",
    resourceId: "ins_1",
    kind: "signup",
    occurredAt: before,
    environment: "sandbox",
  };
  await f.store.saveMonitorPage(
    f.source,
    [event],
    { historyCursor: { page: "2" } },
    true,
  );
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(0);
  await f.store.saveMonitorPage(
    f.source,
    [{ ...event, id: "live", occurredAt: after }],
    { liveCursor: { offset: "200" } },
    false,
  );
  await f.store.saveMonitorPage(
    f.source,
    [{ ...event, id: "live", occurredAt: after }],
    {},
    false,
  );
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(1);
  const state = await f.store.monitorState(f.source.id);
  expect(state?.historyCursor).toEqual({ page: "2" });
  expect(state?.liveCursor).toEqual({ offset: "200" });
  expect(state?.notifyAfter).toBe(f.source.baseline.toISOString());
  await f.store.saveMonitorPage(
    f.source,
    [
      { ...event, id: "refund", kind: "refund", occurredAt: after },
      {
        ...event,
        id: "other-env",
        occurredAt: after,
        environment: "production",
      },
    ],
    {},
    false,
  );
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(1);
});
it("matches only verified references, keeps provenance and separates unresolved overlaps and environments", async () => {
  const f = await setup();
  const second = await f.store.createSource(
    {
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      connectionId: f.connectionId,
      kind: "clerk",
      name: "Other",
      externalId: "second",
      environment: "sandbox",
    },
    25,
  );
  const base: Observation = {
    id: "one",
    resourceId: f.source.externalId,
    environment: "sandbox",
    kind: "payment",
    occurredAt: new Date().toISOString(),
    amount: "10.00",
    currency: "USD",
    reference: {
      provider: "stripe",
      account: "acct_verified",
      object: "in_verified",
      action: "payment",
    },
  };
  await f.store.saveMonitorPage(f.source, [base], {}, false);
  await f.store.saveMonitorPage(
    second,
    [{ ...base, id: "two", resourceId: "second" }],
    {},
    false,
  );
  const snapshot = await f.store.snapshot(f.workspaceId);
  expect(snapshot.deliveries).toHaveLength(1);
  const observations = await f.db
    .select()
    .from(m.monitorObservations)
    .where(
      eq(
        m.monitorObservations.eventId,
        (
          await f.db
            .select()
            .from(m.monitorEvents)
            .where(eq(m.monitorEvents.projectId, f.project.id))
        )[0].id,
      ),
    );
  expect(observations).toHaveLength(2);
  await f.store.saveMonitorPage(
    second,
    [{ ...base, id: "unmatched", resourceId: "second", reference: undefined }],
    {},
    false,
  );
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(2);
});
it("durably queues only normalized webhook fields and deduplicates webhook retries", async () => {
  const f = await setup(),
    connection = (await f.store.connection(f.workspaceId, f.connectionId))!;
  const event: Observation = {
    id: "event",
    resourceId: "ins_1",
    kind: "payment",
    environment: "sandbox",
    occurredAt: new Date().toISOString(),
  };
  for (let i = 0; i < 2; i++)
    await f.store.acceptMonitorWebhook(connection, [event]);
  const inboxes = await f.db
    .select()
    .from(m.monitorInbox)
    .where(eq(m.monitorInbox.connectionId, connection.id));
  expect(inboxes).toHaveLength(2);
  for (const inbox of inboxes) {
    const [job] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `webhook:${inbox.id}`));
    await runOne(f.services, job.id);
  }
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(1);
  expect(
    await f.store.monitorInbox(f.workspaceId, inboxes[0].id),
  ).toBeUndefined();
});
it("poll jobs resume a page after restart and strip unwanted user profile fields", async () => {
  const f = await setup();
  f.services.http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        Array.from({ length: 200 }, (_, i) => ({
          id: `user${i}`,
          created_at: Date.now() - 3600_000,
          email: "private@example.test",
          name: "Private",
        })),
      ),
    )
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "last",
          created_at: Date.now() - 3600_000,
          email: "private@example.test",
        },
      ]),
    );
  const [job] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `monitor:${f.source.id}:true`));
  await runOne(f.services, job.id);
  expect((await f.store.monitorState(f.source.id))?.historyDone).toBe(false);
  await f.db
    .update(t.jobs)
    .set({ dueAt: new Date(0) })
    .where(eq(t.jobs.id, job.id));
  await f.db
    .delete(m.providerBudgets)
    .where(eq(m.providerBudgets.connectionId, f.connectionId));
  await runOne(f.services, job.id);
  expect((await f.store.monitorState(f.source.id))?.historyDone).toBe(true);
  const events = await f.db
    .select()
    .from(m.monitorEvents)
    .where(eq(m.monitorEvents.projectId, f.project.id));
  expect(events).toHaveLength(201);
  expect(JSON.stringify(events)).not.toMatch(/private@example|Private|user0/);
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(0);
});
it("scopes metric reads and dashboard edits to the authenticated workspace", async () => {
  const f = await setup(),
    other = await fixture();
  cleanups.push(other.close);
  const query = {
    metric: "signup",
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    filters: {},
  };
  const metric = await f.store.requestMetric(
    f.source,
    query,
    await hashToken(JSON.stringify(query)),
  );
  const api = createApi(other.services);
  expect((await api.request(`/api/monitor/metrics/${metric.id}`)).status).toBe(
    404,
  );
  expect(
    (
      await api.request(`/api/projects/${f.project.id}/views`, {
        method: "PUT",
        headers: {
          origin: other.services.config.PUBLIC_URL,
          "Content-Type": "application/json",
        },
        body: "[]",
      })
    ).status,
  ).toBe(404);
});
it("serializes OAuth refresh and returns shared refreshed credentials", async () => {
  const f = await setup();
  const id = crypto.randomUUID();
  f.services.config.GA4_OAUTH_CLIENT_ID = "client";
  f.services.config.GA4_OAUTH_CLIENT_SECRET = "secret";
  await f.store.saveConnection({
    id,
    workspaceId: f.workspaceId,
    projectId: f.project.id,
    kind: "ga4",
    name: "GA4",
    externalId: "123",
    secret: await f.services.secrets.seal(
      { authMethod: "oauth", refreshToken: "refresh", expiresAt: "0" },
      id,
    ),
  });
  const connection = (await f.store.connection(f.workspaceId, id))!;
  f.services.http = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      access_token: "fresh",
      refresh_token: "rotated",
      expires_in: 3600,
    }),
  );
  const outcomes = await Promise.allSettled([
    monitoringCredentials(f.services, connection),
    monitoringCredentials(f.services, connection),
  ]);
  expect(outcomes.some((v) => v.status === "fulfilled")).toBe(true);
  expect(f.services.http).toHaveBeenCalledTimes(1);
  expect(
    (await monitoringCredentials(f.services, connection)).accessToken,
  ).toBe("fresh");
  expect(f.services.http).toHaveBeenCalledTimes(1);
});
it("a muted first source does not suppress an enabled verified match", async () => {
  const f = await setup();
  const second = await f.store.createSource(
    {
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      connectionId: f.connectionId,
      kind: "clerk",
      name: "Other",
      externalId: "second",
      environment: "sandbox",
    },
    25,
  );
  await f.store.monitorPreferences(f.source.id, []);
  const event: Observation = {
    id: "first",
    resourceId: f.source.externalId,
    environment: "sandbox",
    kind: "payment",
    occurredAt: new Date().toISOString(),
    reference: {
      provider: "stripe",
      account: "acct_1",
      object: "in_1",
      action: "payment",
    },
  };
  await f.store.saveMonitorPage(f.source, [event], {}, false);
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(0);
  await f.store.saveMonitorPage(
    second,
    [{ ...event, id: "second", resourceId: "second" }],
    {},
    false,
  );
  await f.store.saveMonitorPage(
    second,
    [{ ...event, id: "second", resourceId: "second" }],
    {},
    false,
  );
  expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(1);
});
