import { readFile } from "node:fs/promises";
import { requiredMigrationTimestamp } from "../packages/db/src/schema-version";
import { postgresStore } from "../packages/db/src/store";
import type { Database } from "../packages/db/src/client";
import { afterEach, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { fixture } from "./helpers";
import type { Job } from "../packages/core/src/store";
import type { MetricResult } from "../packages/core/src/monitoring";
import * as t from "../packages/db/src/schema";
import * as m from "../packages/db/src/schema-monitoring";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function setup(kind: "supabase" | "clerk" | "apple" = "supabase") {
  const f = await fixture();
  closers.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "Reliability", description: "", timezone: "UTC" },
    5,
  );
  const connectionId = crypto.randomUUID();
  await f.store.saveConnection({
    id: connectionId,
    workspaceId,
    projectId: project.id,
    name: "Fixture",
    kind,
    secret: "test-only",
    externalId: null,
  });
  const source = await f.store.createSource(
    {
      workspaceId,
      projectId: project.id,
      connectionId,
      kind,
      externalId: "fixture",
      name: "Fixture",
      environment: "production",
    },
    10,
  );
  return { ...f, workspaceId, project, source, connectionId };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function lease(f: Setup) {
  const key = `test-lease:${crypto.randomUUID()}`;
  await f.store.enqueue(f.workspaceId, key, {
    kind: "supabase.collect",
    sourceId: f.source.id,
  });
  const [row] = await f.db.select().from(t.jobs).where(eq(t.jobs.key, key));
  return (await f.store.claim(row.id))!;
}
async function replaceLease(f: Setup, old: Job) {
  await f.db
    .update(t.jobs)
    .set({ leaseUntil: new Date(0) })
    .where(eq(t.jobs.id, old.id));
  return (await f.store.claim(old.id))!;
}
it("rejects stale account, report and health writes and ignores disconnected responses", async () => {
  const f = await setup();
  const old = await lease(f),
    current = await replaceLease(f, old);
  const cursor = { at: new Date().toISOString(), id: "current" };
  const store = f.services.store;
  await store.recordAccounts(f.source, [], cursor, current);
  await store.sourceError(f.source.id, "current-error", current);
  await store.updateConnectionHealth(
    f.connectionId,
    { lastError: "current-error" },
    current,
  );
  const connection = (await store.connection(f.workspaceId, f.connectionId))!;
  for (const staleWrite of [
    () =>
      store.recordAccounts(
        f.source,
        [],
        { at: "2000-01-01T00:00:00Z", id: "stale" },
        old,
      ),
    () => store.saveReport(connection, "2026-10-01", [], old),
    () => store.sourceError(f.source.id, "stale-error", old),
    () =>
      store.updateConnectionHealth(
        f.connectionId,
        { lastError: "stale-error" },
        old,
      ),
  ])
    await expect(staleWrite()).rejects.toMatchObject({
      code: "job_lease_lost",
    });
  expect(await store.source(f.workspaceId, f.source.id)).toMatchObject({
    cursor,
    lastError: "current-error",
  });
  expect(
    (await store.connection(f.workspaceId, f.connectionId))?.lastError,
  ).toBe("current-error");
  await store.disconnect(f.workspaceId, f.connectionId);
  await store.recordAccounts(
    f.source,
    [{ id: "late", provider: "email", createdAt: cursor.at }],
    { ...cursor, id: "late" },
    current,
  );
  await store.saveReport(connection, "2026-10-01", [], current);
  await store.sourceError(f.source.id, "late-error", current);
  expect((await store.source(f.workspaceId, f.source.id))?.cursor).toEqual(
    cursor,
  );
  expect(
    await f.db
      .select()
      .from(t.events)
      .where(eq(t.events.sourceId, f.source.id)),
  ).toHaveLength(0);
  expect(
    await f.db
      .select()
      .from(t.reports)
      .where(eq(t.reports.connectionId, f.connectionId)),
  ).toHaveLength(0);
});
it("keeps newer metric cache and series consistent and fences failed stale workers", async () => {
  const f = await setup("clerk"),
    store = f.services.store;
  const old = await lease(f),
    current = await replaceLease(f, old);
  const date = new Date().toISOString().slice(0, 10);
  const query = { metric: "signup", from: date, to: date, filters: {} };
  const request = await store.requestMetric(f.source, query, "freshness");
  const result: MetricResult = {
    shape: "series",
    unit: "count",
    timezone: "UTC",
    definition: "Fixture",
    status: "available",
    points: [{ label: date, value: "2" }],
    fetchedAt: new Date().toISOString(),
  };
  await store.saveMetric(request.id, result, null, current);
  await store.saveMetric(
    request.id,
    {
      ...result,
      points: [{ label: date, value: "1" }],
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
    },
    null,
    current,
  );
  for (const staleWrite of [
    () => store.saveMetric(request.id, null, "stale-error", old),
    () => store.monitorError(f.source.id, false, "stale-error", old),
    () => store.delayProvider(f.connectionId, 3600, old),
  ])
    await expect(staleWrite()).rejects.toMatchObject({
      code: "job_lease_lost",
    });
  expect(
    (await store.metricRequest(f.workspaceId, request.id))?.result?.points,
  ).toEqual(result.points);
  expect((await store.retainedSeries(f.source.id, query))?.points).toEqual(
    result.points,
  );
  expect(
    (await store.metricRequest(f.workspaceId, request.id))?.error,
  ).toBeNull();
  expect((await store.monitorState(f.source.id))?.liveError).toBeNull();
  await store.disconnect(f.workspaceId, f.connectionId);
  await store.saveMetric(request.id, { ...result, points: [] }, null, current);
  expect(
    (await store.metricRequest(f.workspaceId, request.id))?.result?.points,
  ).toEqual(result.points);
});
it("bulk fanout retains atomic overlap deduplication and focused routing checks", async () => {
  const f = await setup();
  const destinations = [];
  for (let index = 0; index < 3; index++) {
    const id = crypto.randomUUID();
    await f.store.createDestination(
      {
        id,
        workspaceId: f.workspaceId,
        kind: "telegram",
        name: "Fixture",
        address: "123",
        unsubscribeHash: crypto.randomUUID(),
      },
      5,
    );
    await f.store.updateDestination(f.workspaceId, id, { verified: true });
    destinations.push(id);
  }
  await f.store.updateProject(f.workspaceId, f.project.id, {}, destinations);
  const at = new Date().toISOString(),
    cursor = { at, id: "499" };
  const events = Array.from({ length: 500 }, (_, index) => ({
    id: String(index),
    provider: "email",
    createdAt: at,
    anonymous: index === 0,
  }));
  await f.store.recordAccounts(f.source, events, cursor);
  await f.store.recordAccounts(f.source, events, cursor);
  const [counts] = (
    await f.db.execute(sql`select
    (select count(*)::int from ${t.events} where source_id=${f.source.id}) as events,
    (select count(*)::int from ${t.deliveries} where workspace_id=${f.workspaceId}) as deliveries,
    (select count(*)::int from ${t.jobs} where workspace_id=${f.workspaceId} and payload->>'kind'='deliver') as jobs`)
  ).rows;
  expect(counts).toEqual({ events: 500, deliveries: 1497, jobs: 1497 });
  const key = `account:${f.source.id}:1`;
  expect(
    await f.store.deliveryEligibility(
      f.workspaceId,
      f.project.id,
      destinations[0],
      key,
    ),
  ).toBe(true);
  await f.store.updateProject(
    f.workspaceId,
    f.project.id,
    {},
    destinations.slice(1),
  );
  expect(
    await f.store.deliveryEligibility(
      f.workspaceId,
      f.project.id,
      destinations[0],
      key,
    ),
  ).toBe(false);
  await f.store.disconnect(f.workspaceId, f.connectionId);
  expect(
    await f.store.deliveryEligibility(
      f.workspaceId,
      f.project.id,
      destinations[1],
      key,
    ),
  ).toBe(false);
});
it("bounds pruning, leaves null rows untouched and retains stalled dedup identities", async () => {
  const f = await setup("clerk");
  const old = new Date(Date.now() - 70 * 86400_000);
  const rows = await f.db
    .insert(m.monitorEvents)
    .values(
      Array.from({ length: 1005 }, (_, index) => ({
        workspaceId: f.workspaceId,
        projectId: f.project.id,
        key: `retention-${index}`,
        kind: "payment" as const,
        occurredAt: old,
        environment: "production",
        amount: "1.00",
        currency: "USD",
      })),
    )
    .returning({ id: m.monitorEvents.id });
  await f.db.insert(m.monitorObservations).values(
    rows.map((row, index) => ({
      sourceId: f.source.id,
      externalId: `retention-${index}`,
      eventId: row.id,
    })),
  );
  expect(await f.store.cleanup()).toBe(true);
  expect(
    (
      await f.db.execute(
        sql`select count(*)::int as count from ${m.monitorEvents} where project_id=${f.project.id} and amount is not null`,
      )
    ).rows[0].count,
  ).toBe(5);
  expect(await f.store.cleanup()).toBe(false);
  const version = async () =>
    (
      await f.db.execute(
        sql`select ctid::text from ${m.monitorEvents} where id=${rows[0].id}`,
      )
    ).rows[0].ctid;
  const before = await version();
  await f.store.cleanup();
  expect(await version()).toBe(before);
  await f.db
    .update(m.monitorEvents)
    .set({ occurredAt: new Date(Date.now() - 400 * 86400_000) })
    .where(eq(m.monitorEvents.projectId, f.project.id));
  await f.store.cleanup();
  expect(
    await f.db
      .select()
      .from(m.monitorEvents)
      .where(eq(m.monitorEvents.projectId, f.project.id)),
  ).toHaveLength(1005);
  await f.store.saveMonitorPage(
    f.source,
    [],
    { historyDone: true, liveFrom: new Date().toISOString() },
    true,
  );
  expect(await f.store.cleanup()).toBe(true);
  expect(
    await f.db
      .select()
      .from(m.monitorObservations)
      .where(eq(m.monitorObservations.sourceId, f.source.id)),
  ).toHaveLength(5);
  expect(await f.store.cleanup()).toBe(false);
  expect(
    await f.db
      .select()
      .from(m.monitorObservations)
      .where(eq(m.monitorObservations.sourceId, f.source.id)),
  ).toHaveLength(0);
  const indexes = (
    await f.db.execute(
      sql`select indexname from pg_indexes where schemaname='signs_of_life' and indexname in ('monitor_observations_event','event_source_occurred')`,
    )
  ).rows;
  expect(indexes).toHaveLength(2);
});
it("reserves oldest jobs once across dispatchers and releases failed publication", async () => {
  const f = await setup();
  await f.db
    .update(t.jobs)
    .set({ status: "completed" })
    .where(eq(t.jobs.workspaceId, f.workspaceId));
  const ids = [];
  for (let index = 0; index < 3; index++) {
    const key = `dispatch-${crypto.randomUUID()}`;
    await f.store.enqueue(
      f.workspaceId,
      key,
      { kind: "daily", projectId: f.project.id },
      new Date(1000 * index),
    );
    ids.push(
      (await f.db.select().from(t.jobs).where(eq(t.jobs.key, key)))[0].id,
    );
  }
  expect(await f.store.dueJobs(3)).toEqual(ids);
  const reservations = (
    await Promise.all([f.store.reserveDueJobs(2), f.store.reserveDueJobs(2)])
  ).flat();
  expect(new Set(reservations).size).toBe(3);
  expect(reservations).toHaveLength(3);
  expect(await f.store.dueJobs(3)).toEqual([]);
  await f.store.releaseDispatch([ids[0]]);
  expect(await f.store.reserveDueJobs(3)).toEqual([ids[0]]);
  expect(await f.store.jobDiagnostics()).toMatchObject({
    pending: 3,
    running: 0,
    expiredLeases: 0,
    failed: 0,
    oldestDueAt: new Date(0),
  });
});
it("returns monitoring configuration without cached report bodies and fences delivery outcomes", async () => {
  const f = await setup("clerk"),
    store = f.services.store;
  const date = new Date().toISOString().slice(0, 10);
  const request = await store.requestMetric(
    f.source,
    { metric: "signup", from: date, to: date, filters: {} },
    "snapshot",
  );
  expect(request).toBeDefined();
  const config = await store.monitoringState(f.workspaceId, f.project.id);
  expect(config.states).toHaveLength(1);
  expect(config).not.toHaveProperty("metrics");
  const destinationId = crypto.randomUUID();
  await store.createDestination(
    {
      id: destinationId,
      workspaceId: f.workspaceId,
      kind: "telegram",
      name: "Fixture",
      address: "123",
      unsubscribeHash: crypto.randomUUID(),
    },
    5,
  );
  await store.enqueueDelivery({
    workspaceId: f.workspaceId,
    projectId: null,
    destinationId,
    key: "fence",
    notification: { title: "Fixture", text: "Fixture" },
  });
  const delivery = (await store.snapshot(f.workspaceId)).deliveries[0];
  const old = await lease(f),
    current = await replaceLease(f, old);
  await store.updateDelivery(delivery.id, { status: "accepted" }, current);
  await expect(
    store.updateDelivery(delivery.id, { status: "failed" }, old),
  ).rejects.toMatchObject({ code: "job_lease_lost" });
  expect((await store.delivery(f.workspaceId, delivery.id))?.status).toBe(
    "accepted",
  );
  expect(
    await store.deliveryEligibility(
      crypto.randomUUID(),
      f.project.id,
      destinationId,
      "fence",
    ),
  ).toBe(false);
});

it("requires the build's latest migration for readiness without changing the ledger", async () => {
  const f = await setup();
  const journal = JSON.parse(
    await readFile("packages/db/migrations/meta/_journal.json", "utf8"),
  );
  expect(requiredMigrationTimestamp).toBe(journal.entries.at(-1).when);
  await expect(f.store.health()).resolves.toBeUndefined();
  const rollback = new Error("rollback readiness probe");
  await expect(
    f.db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from signs_of_life_migrations.__drizzle_migrations where created_at=${requiredMigrationTimestamp}`,
      );
      await expect(
        postgresStore(tx as unknown as Database).health(),
      ).rejects.toMatchObject({
        code: "database_migration_required",
        status: 503,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  await expect(f.store.health()).resolves.toBeUndefined();
});
