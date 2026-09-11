import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "./helpers";
import * as t from "../packages/db/src/schema";
import { collectApple, dailySummary } from "../packages/backend/src/collectors";
import { reportingDates } from "../packages/core/src/time";
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
    { name: "Product", description: "", timezone: "UTC" },
    5,
  );
  const id = crypto.randomUUID();
  await f.store.saveConnection({
    id,
    workspaceId,
    kind: "apple",
    name: "Apple",
    externalId: "12345",
    secret: await f.services.secrets.seal(
      {
        issuerId: "issuer",
        keyId: "key",
        privateKey: "fixture",
        vendorNumber: "12345",
      },
      id,
    ),
  });
  const source = await f.store.createSource(
    {
      workspaceId,
      projectId: project.id,
      connectionId: id,
      kind: "apple",
      name: "Product",
      externalId: "123",
    },
    10,
  );
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId,
      name: "Inbox",
      kind: "email",
      address: "app@example.test",
      unsubscribeHash: crypto.randomUUID(),
    },
    3,
  );
  await f.store.updateDestination(workspaceId, destinationId, {
    verified: true,
  });
  await f.store.updateProject(workspaceId, project.id, {}, [destinationId]);
  const connection = (await f.store.connection(workspaceId, id))!;
  const [dailyJob] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `daily:${project.id}`));
  const now = new Date("2026-09-11T12:00:00Z");
  return { ...f, workspaceId, project, source, connection, dailyJob, now };
}
describe("Apple report lifecycle", () => {
  it("distinguishes pending reports, sends late totals, and avoids historical notification floods", async () => {
    const f = await setup();
    await dailySummary(f.services, f.dailyJob, f.project.id, f.now);
    let history = (await f.store.snapshot(f.workspaceId)).deliveries;
    expect(history).toHaveLength(1);
    expect(history[0].notification.title).toContain("pending");
    for (const date of reportingDates(f.now))
      await f.store.saveReport(f.connection, date, [
        { appId: "123", title: "Product", downloads: 4, redownloads: 2 },
      ]);
    await dailySummary(f.services, f.dailyJob, f.project.id, f.now);
    history = (await f.store.snapshot(f.workspaceId)).deliveries;
    expect(history).toHaveLength(2);
    expect(history[0].notification.text).toContain("4 initial downloads");
    await dailySummary(f.services, f.dailyJob, f.project.id, f.now);
    expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(2);
  });
  it("notifies corrections, including corrections that restore an earlier total", async () => {
    const f = await setup();
    const date = reportingDates(f.now)[0];
    for (const downloads of [4, 5, 4]) {
      await f.store.saveReport(f.connection, date, [
        { appId: "123", title: "Product", downloads, redownloads: 1 },
      ]);
      await dailySummary(f.services, f.dailyJob, f.project.id, f.now);
    }
    const snapshot = await f.store.snapshot(f.workspaceId);
    expect(snapshot.deliveries).toHaveLength(3);
    expect(snapshot.deliveries[0].notification.title).toContain("Corrected");
    expect(snapshot.metrics[0].revision).toBe(3);
    await f.store.saveReport(f.connection, date, [
      { appId: "123", title: "Product", downloads: 4, redownloads: 1 },
    ]);
    expect((await f.store.snapshot(f.workspaceId)).metrics[0].revision).toBe(3);
  });
  it("retrieves each vendor date once for all selected app sources", async () => {
    const f = await setup();
    await f.store.createSource(
      {
        workspaceId: f.workspaceId,
        projectId: f.project.id,
        connectionId: f.connection.id,
        kind: "apple",
        name: "Another app",
        externalId: "456",
      },
      10,
    );
    const report = vi
      .fn()
      .mockResolvedValue([
        { appId: "123", title: "Product", downloads: 2, redownloads: 0 },
      ]);
    f.services.reports.report = report;
    await collectApple(f.services, f.dailyJob, f.connection.id);
    expect(report).toHaveBeenCalledTimes(7);
    expect((await f.store.snapshot(f.workspaceId)).metrics).toHaveLength(14);
  });
});
