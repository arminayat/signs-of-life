import { afterEach, expect, it } from "vitest";
import { createApi } from "../packages/backend/src/api";
import type { ProjectOverview } from "../packages/core/src/store";
import { localDay } from "../packages/core/src/time";
import { events, metrics } from "../packages/db/src/schema";
import { fixture } from "./helpers";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
it("aggregates full project history, preserves zero versus missing reports and enforces tenant scope", async () => {
  const f = await fixture();
  cleanups.push(f.close);
  const other = await fixture();
  cleanups.push(other.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "Metrics", description: "", timezone: "Pacific/Honolulu" },
    5,
  );
  const sibling = await f.store.createProject(
    workspaceId,
    { name: "Other", description: "", timezone: "UTC" },
    5,
  );
  async function source(projectId: string, kind: "supabase" | "apple") {
    const connectionId = crypto.randomUUID();
    await f.store.saveConnection({
      id: connectionId,
      workspaceId,
      kind,
      name: kind,
      secret: "test-only",
      externalId: null,
    });
    return f.store.createSource(
      {
        workspaceId,
        projectId,
        connectionId,
        kind,
        name: kind,
        externalId: crypto.randomUUID(),
      },
      10,
    );
  }
  const supabase = await source(project.id, "supabase");
  const apple = await source(project.id, "apple");
  const apple2 = await source(project.id, "apple");
  const siblingSource = await source(sibling.id, "supabase");
  // A UTC boundary falls on the preceding day in the project's timezone.
  const boundary = new Date(
    `${new Date().toISOString().slice(0, 10)}T00:30:00Z`,
  );
  boundary.setUTCDate(boundary.getUTCDate() - 1);
  const date = localDay(boundary, project.timezone);
  await f.db.insert(events).values([
    ...Array.from({ length: 125 }, () => ({
      workspaceId,
      sourceId: supabase.id,
      externalId: crypto.randomUUID(),
      occurredAt: boundary,
      provider: "email",
    })),
    {
      workspaceId,
      sourceId: supabase.id,
      externalId: crypto.randomUUID(),
      occurredAt: boundary,
      provider: "email",
      anonymous: true,
    },
    {
      workspaceId,
      sourceId: siblingSource.id,
      externalId: crypto.randomUUID(),
      occurredAt: boundary,
      provider: "email",
    },
    {
      workspaceId,
      sourceId: supabase.id,
      externalId: crypto.randomUUID(),
      occurredAt: new Date(Date.now() - 40 * 86400_000),
      provider: "email",
    },
  ]);
  // Choose a different reporting date even when localDay is the previous UTC date.
  const previous = new Date(Date.parse(`${date}T00:00:00Z`) - 86400_000)
    .toISOString()
    .slice(0, 10);
  await f.db.insert(metrics).values([
    { workspaceId, sourceId: apple.id, date, downloads: 12, redownloads: 3 },
    { workspaceId, sourceId: apple2.id, date, downloads: 7, redownloads: 2 },
    {
      workspaceId,
      sourceId: apple.id,
      date: previous,
      downloads: 0,
      redownloads: 0,
    },
  ]);
  const app = createApi(f.services);
  const response = await app.request(`/api/projects/${project.id}/overview`);
  expect(response.status).toBe(200);
  const result = (await response.json()) as ProjectOverview;
  expect(result.dates).toHaveLength(30);
  expect(result.accounts).toEqual([{ date, count: 125 }]);
  expect(result.downloads).toEqual([
    { date: previous, downloads: 0, redownloads: 0, sourceCount: 1 },
    { date, downloads: 19, redownloads: 5, sourceCount: 2 },
  ]);
  expect(result.downloads).toHaveLength(2);
  const foreign = createApi(other.services);
  expect(
    (await foreign.request(`/api/projects/${project.id}/overview`)).status,
  ).toBe(404);
  expect(
    (await foreign.request(`/api/projects/${project.id}/dashboard`)).status,
  ).toBe(404);
  expect((await app.request("/api/projects/not-an-id/overview")).status).toBe(
    400,
  );
});
it("filters project deliveries before applying the latest-100 limit", async () => {
  const f = await fixture();
  cleanups.push(f.close);
  const workspaceId = f.member!.workspaceId;
  const project = await f.store.createProject(
    workspaceId,
    { name: "First", description: "", timezone: "UTC" },
    5,
  );
  const sibling = await f.store.createProject(
    workspaceId,
    { name: "Busy", description: "", timezone: "UTC" },
    5,
  );
  const destinationId = crypto.randomUUID();
  await f.store.createDestination(
    {
      id: destinationId,
      workspaceId,
      kind: "telegram",
      name: "Test",
      address: "123",
      unsubscribeHash: crypto.randomUUID(),
    },
    5,
  );
  for (let i = 0; i < 102; i++)
    await f.store.enqueueDelivery({
      workspaceId,
      projectId: i === 0 ? project.id : sibling.id,
      destinationId,
      key: `history-${i}`,
      notification: { title: "Test", text: "Test" },
    });
  const snapshot = await f.store.snapshot(workspaceId, project.id);
  expect(snapshot.deliveries).toHaveLength(1);
  expect(snapshot.deliveries[0].projectId).toBe(project.id);
});
