import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
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
    { name: "Lock order", description: "", timezone: "UTC" },
    5,
  );
  const connectionId = crypto.randomUUID();
  await f.store.saveConnection({
    id: connectionId,
    workspaceId,
    projectId: project.id,
    kind: "clerk",
    name: "Fixture",
    secret: "fake",
    externalId: null,
  });
  const sources = [];
  for (const externalId of ["first", "second"])
    sources.push(
      await f.store.createSource(
        {
          workspaceId,
          projectId: project.id,
          connectionId,
          kind: "clerk",
          externalId,
          name: externalId,
          environment: "production",
        },
        10,
      ),
    );
  return { ...f, workspaceId, project, connectionId, sources };
}
it("serializes reversed cross-source aliases, concurrent health writes and collection pages", async () => {
  const f = await setup(),
    store = f.services.store;
  const jobs = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.workspaceId, f.workspaceId));
  const claims = await Promise.all(jobs.map((job) => store.claim(job.id)));
  const [first, second, third, fourth] = claims.filter((job) => !!job);
  const base: Observation[] = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    resourceId: "first",
    environment: "production",
    kind: "payment",
    occurredAt: new Date().toISOString(),
    reference: {
      provider: "stripe",
      account: "fixture",
      object: `invoice-${index}`,
      action: "payment",
    },
  }));
  await Promise.all([
    store.saveMonitorPage(f.sources[0], base, {}, false, first),
    store.saveMonitorPage(
      f.sources[1],
      [...base].reverse().map((event) => ({ ...event, resourceId: "second" })),
      {},
      false,
      second,
    ),
    store.monitorError(f.sources[0].id, false, "fixture_error", third),
    store.updateConnectionHealth(f.connectionId, { lastError: "one" }, third),
    store.updateConnectionHealth(f.connectionId, { lastError: "two" }, fourth),
  ]);
  expect(
    await f.db
      .select()
      .from(m.monitorEvents)
      .where(eq(m.monitorEvents.projectId, f.project.id)),
  ).toHaveLength(20);
  expect(
    await f.db
      .select()
      .from(m.monitorObservations)
      .where(eq(m.monitorObservations.sourceId, f.sources[0].id)),
  ).toHaveLength(20);
  expect(
    await f.db
      .select()
      .from(m.monitorObservations)
      .where(eq(m.monitorObservations.sourceId, f.sources[1].id)),
  ).toHaveLength(20);
});
it("lets project deletion race with collection without partial rows or lock inversions", async () => {
  const f = await setup();
  const [row] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `monitor:${f.sources[0].id}:false`));
  const job = (await f.store.claim(row.id))!;
  await Promise.all([
    f.services.store.saveMonitorPage(
      f.sources[0],
      Array.from({ length: 200 }, (_, index) => ({
        id: String(index),
        resourceId: "first",
        kind: "signup",
        occurredAt: new Date().toISOString(),
        environment: "production",
      })),
      {},
      false,
      job,
    ),
    f.store.deleteProject(f.workspaceId, f.project.id),
  ]);
  expect(
    await f.db
      .select()
      .from(m.monitorEvents)
      .where(eq(m.monitorEvents.projectId, f.project.id)),
  ).toHaveLength(0);
  expect(await f.store.source(f.workspaceId, f.sources[0].id)).toBeUndefined();
});
