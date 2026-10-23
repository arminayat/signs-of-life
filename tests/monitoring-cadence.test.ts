import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectAccounts,
  dailySummary,
} from "../packages/backend/src/collectors";
import { collectMonitor } from "../packages/backend/src/monitoring-jobs";
import type { Services } from "../packages/backend/src/services";
import type { AccountEvent, SourceKind } from "../packages/core/src/model";
import type {
  DashboardView,
  MonitorState,
} from "../packages/core/src/monitoring";
import type { Job, Project, Source } from "../packages/core/src/store";
import { fixtureCredentials } from "./monitoring-fixtures";

const now = new Date("2026-10-23T12:00:00.000Z");
const job = { workspaceId: "workspace" } as Job;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

function setup(kind: SourceKind) {
  const source: Source = {
    id: "source",
    projectId: "project",
    workspaceId: "workspace",
    connectionId: "connection",
    externalId: "resource",
    kind,
    name: "Source",
    environment: "production",
    cursor: null,
    baseline: new Date("2026-10-23T00:00:00.000Z"),
    lastSuccessAt: null,
    lastError: null,
    createdAt: now,
  };
  const project: Project = {
    id: "project",
    workspaceId: "workspace",
    name: "Project",
    description: "",
    enabled: true,
    timezone: "UTC",
    dailyTime: "09:00",
    createdAt: now,
  };
  const state: MonitorState = {
    sourceId: source.id,
    environment: source.environment,
    notifyAfter: source.baseline.toISOString(),
    historyFrom: "2026-10-22T00:00:00.000Z",
    historyUntil: source.baseline.toISOString(),
    historyCursor: {},
    historyDone: false,
    liveFrom: "2026-10-23T11:55:00.000Z",
    liveUntil: null,
    liveCursor: {},
    coverage: null,
    historyError: null,
    liveError: null,
    notifications: ["signup"],
  };
  const http = vi.fn<typeof fetch>();
  const store = {
    source: async () => source,
    project: async () => project,
    connection: async () => ({
      id: source.connectionId,
      kind,
      active: true,
      secret: "fixture",
    }),
    providerBudget: async () => true,
    monitorState: async () => state,
    saveMonitorPage: vi.fn(async (_source, _events, patch) => {
      Object.assign(state, patch);
    }),
    recordAccounts: vi.fn(),
    updateConnection: vi.fn(),
    monitoringSnapshot: vi.fn(
      async (): Promise<{
        views: DashboardView[];
        states: MonitorState[];
      }> => ({ views: [], states: [] }),
    ),
    requestMetric: vi.fn(async () => ({})),
    snapshot: vi.fn(async () => ({ sources: [], connections: [] })),
    reportDeliveryKeys: vi.fn(async () => []),
  };
  const accounts = { collect: vi.fn(async (): Promise<AccountEvent[]> => []) };
  const services = {
    config: { MONITOR_ALLOWED_HOSTS: ["example.test"] },
    http,
    secrets: {
      open: async () =>
        kind === "supabase"
          ? { access_token: "fixture", expires_at: now.getTime() + 86400_000 }
          : {
              ...fixtureCredentials[kind as keyof typeof fixtureCredentials],
              expiresAt: String(now.getTime() + 86400_000),
            },
    },
    accounts,
    store,
  } as unknown as Services;
  return { services, source, project, state, store, http, accounts };
}

describe("recurring collection cadence", () => {
  it.each([
    ["better-auth", { version: 1, users: [], next: null }],
    ["workos", { data: [], list_metadata: { after: null } }],
    ["clerk", []],
    ["auth0", { users: [], total: 0 }],
    ["stripe", { data: [], has_more: false }],
  ] as const)(
    "polls %s again in five minutes after a completed page",
    async (kind, response) => {
      const f = setup(kind);
      f.http.mockImplementation(async () => Response.json(response));

      expect(await collectMonitor(f.services, job, f.source.id, false)).toEqual(
        new Date(now.getTime() + 300_000),
      );
      expect(f.http).toHaveBeenCalledTimes(1);
      expect(f.state).toMatchObject({
        liveFrom: now.toISOString(),
        liveUntil: null,
        liveCursor: {},
      });
      expect(f.store.updateConnection).toHaveBeenCalledWith(
        f.source.connectionId,
        { status: "connected", lastError: null, lastSuccessAt: now },
      );
    },
  );

  it("keeps aggregate-only report refreshes hourly", async () => {
    const f = setup("google-play");
    f.store.monitoringSnapshot.mockResolvedValue({
      views: [
        {
          id: "view",
          sourceId: f.source.id,
          metric: "native:installs",
          hidden: false,
          filters: {},
        },
      ],
      states: [],
    });

    expect(await collectMonitor(f.services, job, f.source.id, false)).toEqual(
      new Date(now.getTime() + 3600_000),
    );
    expect(f.http).not.toHaveBeenCalled();
    expect(f.store.requestMetric).toHaveBeenCalledExactlyOnceWith(
      f.source,
      {
        metric: "native:installs",
        from: "2026-09-24",
        to: "2026-10-23",
        filters: {},
      },
      expect.any(String),
    );
  });

  it("polls Supabase again in five minutes while retaining its overlap and completed checkpoint", async () => {
    const f = setup("supabase");
    f.source.cursor = {
      at: "2026-10-23T11:55:00.000Z",
      id: "",
      catchup: false,
    };

    expect(await collectAccounts(f.services, job, f.source.id)).toEqual(
      new Date(now.getTime() + 300_000),
    );
    expect(f.accounts.collect).toHaveBeenCalledExactlyOnceWith(
      "fixture",
      f.source.externalId,
      {
        at: "2026-10-23T11:50:00.000Z",
        id: "00000000-0000-0000-0000-000000000000",
      },
      now.toISOString(),
    );
    expect(f.store.recordAccounts).toHaveBeenLastCalledWith(f.source, [], {
      at: now.toISOString(),
      id: "00000000-0000-0000-0000-000000000000",
    });
  });
});

describe("catch-up cadence", () => {
  it.each([false, true])(
    "continues a partial monitor page promptly (historical=%s)",
    async (historical) => {
      const f = setup("clerk");
      f.http.mockImplementation(async () =>
        Response.json(
          Array.from({ length: 200 }, (_, i) => ({
            id: `user-${i}`,
            created_at: Date.parse(
              historical ? "2026-10-22T12:00:00Z" : "2026-10-23T11:58:00Z",
            ),
          })),
        ),
      );

      expect(
        await collectMonitor(f.services, job, f.source.id, historical),
      ).toEqual(new Date(now.getTime() + 3000));
      expect(f.state[historical ? "historyCursor" : "liveCursor"]).toEqual({
        offset: "200",
      });
      expect(f.state.historyDone).toBe(false);
      expect(f.store.monitoringSnapshot).not.toHaveBeenCalled();
    },
  );

  it("stops scheduling completed history and does not refetch it", async () => {
    const f = setup("clerk");
    f.http.mockImplementation(async () => Response.json([]));

    expect(
      await collectMonitor(f.services, job, f.source.id, true),
    ).toBeUndefined();
    expect(f.state.historyDone).toBe(true);
    expect(
      await collectMonitor(f.services, job, f.source.id, true),
    ).toBeUndefined();
    expect(f.http).toHaveBeenCalledTimes(1);
    expect(f.state.liveFrom).toBe("2026-10-23T11:55:00.000Z");
  });

  it("continues a bounded Supabase backlog after one second with its last cursor", async () => {
    const f = setup("supabase");
    let page = 0;
    f.accounts.collect.mockImplementation(async () => {
      page++;
      return Array.from({ length: 500 }, (_, i) => ({
        id: `page-${page}-user-${i}`,
        createdAt: "2026-10-23T11:58:00.000Z",
        provider: "email",
      }));
    });

    expect(await collectAccounts(f.services, job, f.source.id)).toEqual(
      new Date(now.getTime() + 1000),
    );
    expect(f.accounts.collect).toHaveBeenCalledTimes(20);
    expect(f.store.recordAccounts).toHaveBeenLastCalledWith(
      f.source,
      expect.any(Array),
      { at: "2026-10-23T11:58:00.000Z", id: "page-20-user-499", catchup: true },
    );
    expect(f.store.updateConnection).not.toHaveBeenCalled();
  });
});

describe("daily summary cadence", () => {
  it.each([
    [true, "18:00", false],
    [true, "09:00", true],
    [false, "09:00", false],
  ] as const)(
    "rechecks in five minutes (enabled=%s, dailyTime=%s)",
    async (enabled, dailyTime, ready) => {
      const f = setup("clerk");
      Object.assign(f.project, { enabled, dailyTime });

      expect(await dailySummary(f.services, job, f.project.id, now)).toEqual(
        new Date(now.getTime() + 300_000),
      );
      expect(f.store.monitoringSnapshot).toHaveBeenCalledTimes(ready ? 1 : 0);
    },
  );

  it("checks a late-night summary at its project-local time before midnight", async () => {
    const f = setup("clerk");
    const beforeSummary = new Date("2026-10-23T21:57:30.000Z");
    vi.setSystemTime(beforeSummary);
    Object.assign(f.project, { timezone: "Europe/Berlin", dailyTime: "23:59" });

    const due = await dailySummary(
      f.services,
      job,
      f.project.id,
      beforeSummary,
    );
    expect(due).toEqual(new Date("2026-10-23T21:59:00.000Z"));
    expect(f.store.monitoringSnapshot).not.toHaveBeenCalled();

    await dailySummary(f.services, job, f.project.id, due);
    expect(f.store.monitoringSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reaches a skipped spring DST summary time on the next five-minute check", async () => {
    const f = setup("clerk");
    const beforeJump = new Date("2026-03-29T00:58:00.000Z");
    vi.setSystemTime(beforeJump);
    Object.assign(f.project, { timezone: "Europe/Berlin", dailyTime: "02:30" });

    const due = await dailySummary(f.services, job, f.project.id, beforeJump);
    expect(due).toEqual(new Date("2026-03-29T01:03:00.000Z"));
    expect(f.store.monitoringSnapshot).not.toHaveBeenCalled();

    await dailySummary(f.services, job, f.project.id, due);
    expect(f.store.monitoringSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each(["2026-10-25T00:28:00.000Z", "2026-10-25T01:28:00.000Z"])(
    "advances to a ready summary through either repeated fall DST hour at %s",
    async (instant) => {
      const f = setup("clerk");
      const beforeSummary = new Date(instant);
      vi.setSystemTime(beforeSummary);
      Object.assign(f.project, {
        timezone: "Europe/Berlin",
        dailyTime: "02:30",
      });

      const due = await dailySummary(
        f.services,
        job,
        f.project.id,
        beforeSummary,
      );
      expect(due!.getTime()).toBeGreaterThanOrEqual(
        beforeSummary.getTime() + 120_000,
      );
      expect(due!.getTime()).toBeLessThanOrEqual(
        beforeSummary.getTime() + 300_000,
      );
      expect(f.store.monitoringSnapshot).not.toHaveBeenCalled();

      await dailySummary(f.services, job, f.project.id, due);
      expect(f.store.monitoringSnapshot).toHaveBeenCalledTimes(1);
    },
  );
});
