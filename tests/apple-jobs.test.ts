import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { fixture } from "./helpers";
import * as t from "../packages/db/src/schema";
import {
  collectApple,
  collectAppleHistory,
  dailySummary,
} from "../packages/backend/src/collectors";
import { createApi } from "../packages/backend/src/api";
import { reportingDates } from "../packages/core/src/time";
import type {
  AppStoreStats,
  AppSubscriptionReport,
} from "../packages/core/src/app-store";
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
  const [dailyRow] = await f.db
    .select()
    .from(t.jobs)
    .where(eq(t.jobs.key, `daily:${project.id}`));
  const dailyJob = (await f.store.claim(dailyRow.id))!;
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
  it("imports a year of history for the new source only, in silent batches", async () => {
    const f = await setup();
    const other = await f.store.createSource(
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
    const [queued] = await f.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.key, `apple-history:${f.source.id}`));
    expect(queued.payload).toEqual({
      kind: "apple.history",
      sourceId: f.source.id,
    });
    const live = reportingDates(f.now);
    const history = reportingDates(f.now, 365).slice(live.length);
    const unavailable = history[3];
    // A date the live collector already stored keeps its totals and is not refetched.
    await f.store.saveReport(f.connection, history[0], [
      { appId: "123", title: "Product", downloads: 5, redownloads: 0 },
    ]);
    const report = vi.fn(async (_credentials: unknown, date: string) =>
      date === unavailable
        ? null
        : [
            { appId: "123", title: "Product", downloads: 2, redownloads: 1 },
            {
              appId: "456",
              title: "Another app",
              downloads: 9,
              redownloads: 0,
            },
          ],
    );
    f.services.reports.report = report;
    let next = await collectAppleHistory(
      f.services,
      f.dailyJob,
      f.source.id,
      f.now,
      100,
    );
    expect(next).toBeInstanceOf(Date);
    expect(report).toHaveBeenCalledTimes(100);
    while (next)
      next = await collectAppleHistory(
        f.services,
        f.dailyJob,
        f.source.id,
        f.now,
        100,
      );
    const fetched = report.mock.calls.map(([, date]) => date);
    expect(fetched).toHaveLength(history.length - 1);
    expect(fetched).not.toContain(history[0]);
    expect(fetched.some((date) => live.includes(date))).toBe(false);
    const rows = await f.db.select().from(t.metrics);
    const own = rows.filter((row) => row.sourceId === f.source.id);
    expect(own).toHaveLength(history.length - 1);
    expect(own.find((row) => row.date === unavailable)).toBeUndefined();
    expect(own.find((row) => row.date === history[0])?.downloads).toBe(5);
    expect(own.find((row) => row.date === history[1])?.downloads).toBe(2);
    // Only the live save touched the other source; history is per source.
    expect(rows.filter((row) => row.sourceId === other.id)).toHaveLength(1);
    expect((await f.store.snapshot(f.workspaceId)).deliveries).toHaveLength(0);
    // Finished imports, including unavailable dates, make no further calls.
    await expect(
      collectAppleHistory(f.services, f.dailyJob, f.source.id, f.now),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledTimes(history.length - 1);
    await dailySummary(f.services, f.dailyJob, f.project.id, f.now);
    const deliveries = (await f.store.snapshot(f.workspaceId)).deliveries;
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries)
      expect(delivery.notification.title).toContain("pending");
  });
  it("stores each app's sales and subscription breakdown and serves it on the Stats endpoint", async () => {
    const f = await setup();
    const dates = reportingDates(new Date());
    const sales = {
      downloads: 3,
      redownloads: 1,
      updates: 4,
      purchases: 2,
      renewals: 1,
      refunds: 0,
      proceeds: { EUR: 6.98 },
      countries: { DE: 2, US: 1 },
      devices: { iPhone: 3 },
      versions: { "1.4.0": 4 },
      products: { Monthly: { units: 2, proceeds: { EUR: 6.98 } } },
    };
    f.services.reports.report = vi.fn(async (_c: unknown, date: string) =>
      date === dates[1]
        ? null
        : [
            {
              appId: "123",
              title: "Product",
              downloads: 3,
              redownloads: 1,
              sales,
            },
          ],
    );
    f.services.reports.subscriptions = vi.fn(
      async (
        _c: unknown,
        date: string,
      ): Promise<AppSubscriptionReport[] | null> =>
        date === dates[0]
          ? [
              {
                appId: "123",
                subscriptions: {
                  active: 5,
                  offers: 1,
                  trials: 2,
                  billingRetry: 0,
                  gracePeriod: 0,
                  plans: { Monthly: 8 },
                  events: { Renew: 1 },
                },
              },
              {
                appId: "999",
                subscriptions: {
                  active: 50,
                  offers: 0,
                  trials: 0,
                  billingRetry: 0,
                  gracePeriod: 0,
                  plans: {},
                  events: {},
                },
              },
            ]
          : null,
    );
    await collectApple(f.services, f.dailyJob, f.connection.id);
    const rows = await f.db
      .select()
      .from(t.appStoreDays)
      .where(eq(t.appStoreDays.sourceId, f.source.id));
    // A pending Sales report and no subscription report store nothing yet.
    expect(rows.map((row) => row.date).sort()).toEqual(
      dates.filter((date) => date !== dates[1]).sort(),
    );
    const api = createApi(f.services);
    const response = await api.request(
      `/api/sources/${f.source.id}/app-store?from=${dates.at(-1)}&to=${dates[0]}`,
    );
    expect(response.status).toBe(200);
    const stats = (await response.json()) as AppStoreStats;
    expect(stats.reportDays).toBe(6);
    expect(stats.totals).toMatchObject({
      downloads: 18,
      updates: 24,
      purchases: 12,
      proceeds: { EUR: 41.88 },
    });
    expect(stats.countries).toEqual({ DE: 12, US: 6 });
    // Another app's subscriptions on the same vendor report stay out.
    expect(stats.subscriptions).toMatchObject({ date: dates[0], active: 5 });
    expect(stats.days.at(-1)).toMatchObject({ date: dates[0], active: 5 });
    expect(stats.days.find((day) => day.date === dates[1])).toMatchObject({
      downloads: null,
    });
    // A later report fills the pending date without erasing subscriptions.
    f.services.reports.report = vi.fn(async () => [
      { appId: "123", title: "Product", downloads: 1, redownloads: 0 },
    ]);
    f.services.reports.subscriptions = vi.fn(async () => null);
    await collectApple(f.services, f.dailyJob, f.connection.id);
    const [today] = await f.db
      .select()
      .from(t.appStoreDays)
      .where(
        and(
          eq(t.appStoreDays.sourceId, f.source.id),
          eq(t.appStoreDays.date, dates[0]),
        ),
      );
    expect(today.sales).toMatchObject({ downloads: 1, countries: {} });
    expect(today.subscriptions).toMatchObject({ active: 5 });
    const listing = vi.fn(async () => ({
      storeUrl: null,
      versions: null,
      reviews: null,
      ratings: [],
    }));
    f.services.reports.listing = listing;
    expect(
      (
        await api.request(
          `/api/sources/${f.source.id}/app-store/listing?countries=DE,US,xx,DE`,
        )
      ).status,
    ).toBe(200);
    expect(listing).toHaveBeenCalledWith(expect.anything(), "123", [
      "DE",
      "US",
    ]);
    expect(
      (
        await api.request(
          `/api/sources/${crypto.randomUUID()}/app-store?from=${dates[0]}&to=${dates[0]}`,
        )
      ).status,
    ).toBe(404);
  });
  it("re-queues an imported source's history when breakdown dates are missing", async () => {
    const f = await setup();
    f.services.reports.report = vi.fn(async () => []);
    let next = await collectAppleHistory(
      f.services,
      f.dailyJob,
      f.source.id,
      new Date(),
      400,
    );
    expect(next).toBeUndefined();
    const key = `apple-history:${f.source.id}`;
    const [row] = await f.db.select().from(t.jobs).where(eq(t.jobs.key, key));
    await f.store.finish((await f.store.claim(row.id))!);
    const status = async () =>
      (await f.db.select().from(t.jobs).where(eq(t.jobs.key, key)))[0].status;
    await collectApple(f.services, f.dailyJob, f.connection.id);
    expect(await status()).toBe("completed");
    // An upgrade (or a gap) leaves a history date without a breakdown row.
    const history = reportingDates(new Date(), 365).slice(7);
    await f.db
      .delete(t.appStoreDays)
      .where(
        and(
          eq(t.appStoreDays.sourceId, f.source.id),
          eq(t.appStoreDays.date, history[10]),
        ),
      );
    await collectApple(f.services, f.dailyJob, f.connection.id);
    expect(await status()).toBe("pending");
    next = await collectAppleHistory(f.services, f.dailyJob, f.source.id);
    expect(f.services.reports.report).toHaveBeenLastCalledWith(
      expect.anything(),
      history[10],
    );
  });
  it("lists apps from every recent daily report and allows manual app IDs", async () => {
    const f = await setup();
    const dates = reportingDates(new Date());
    f.services.reports.report = vi.fn(
      async (_credentials: unknown, date: string) =>
        date === dates[0]
          ? [{ appId: "123", title: "Product", downloads: 1, redownloads: 0 }]
          : date === dates[5]
            ? [
                {
                  appId: "123",
                  title: "Old name",
                  downloads: 1,
                  redownloads: 0,
                },
                {
                  appId: "789",
                  title: "Quiet app",
                  downloads: 1,
                  redownloads: 0,
                },
              ]
            : null,
    );
    const response = await createApi(f.services).request(
      `/api/connections/${f.connection.id}/catalog`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { id: "123", name: "Product" },
        { id: "789", name: "Quiet app" },
      ],
      manualAppId: true,
    });
  });
});
