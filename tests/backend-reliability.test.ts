import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../packages/backend/src/api";
import { runOne } from "../packages/backend/src/runner";
import {
  supabaseAccess,
  type ApiServices,
  type Services,
} from "../packages/backend/src/services";
import { monitoringSummary } from "../packages/backend/src/monitoring-summary";
import { verifiedMatches } from "../packages/backend/src/monitoring-matches";
import { AppError, type Notification } from "../packages/core/src/model";
import type { Connection, Job, Project } from "../packages/core/src/store";
import type { Observation } from "../packages/core/src/monitoring";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const job = {
  id: "job",
  workspaceId: "workspace",
  leaseToken: "lease",
  attempts: 1,
} as Job;

describe("notification outcome invariants", () => {
  function deliveryFixture(attempts = 1) {
    const delivery = {
      id: "delivery",
      destinationId: "destination",
      projectId: null,
      status: "sending",
      attempts,
      startedAt: new Date(),
      createdAt: new Date(),
      purpose: "notification",
      notification: { title: "Test", text: "Test" },
    };
    const send = vi
      .fn()
      .mockResolvedValue({ status: "failed", code: "resend_http_401" });
    const services = {
      config: {
        EMAIL_PROVIDER: "resend",
        AUTH_SECRET: "fixture-only",
        PUBLIC_URL: "https://example.test",
      },
      channels: { email: { send } },
      store: {
        claim: async () => ({
          ...job,
          payload: { kind: "deliver", deliveryId: delivery.id },
        }),
        delivery: async () => ({ ...delivery }),
        destination: async () => ({
          kind: "email",
          address: "fixture@example.test",
          enabled: true,
          verified: true,
        }),
        updateDelivery: vi.fn(async (_id, patch, claim) => {
          expect(claim.leaseToken).toBe(job.leaseToken);
          Object.assign(delivery, patch);
        }),
        finish: vi.fn(),
      },
    } as unknown as Services;
    return { delivery, send, services };
  }
  it("keeps a prior ambiguous send uncertain after a permanent rejection", async () => {
    const { delivery, send, services } = deliveryFixture();
    await runOne(services);
    expect(send).toHaveBeenCalledOnce();
    expect(delivery).toMatchObject({
      status: "uncertain",
      attempts: 2,
      lastError: "resend_http_401",
    });
  });
  it("does not send a ninth attempt after an interrupted final outcome write", async () => {
    const { delivery, send, services } = deliveryFixture(8);
    await runOne(services);
    expect(send).not.toHaveBeenCalled();
    expect(delivery.status).toBe("uncertain");
  });
});

it("does not replace a reconnected Supabase grant or release a newer refresh lease", async () => {
  const current = {
    id: "connection",
    workspaceId: "workspace",
    active: true,
    kind: "supabase",
    secret: JSON.stringify({
      access_token: "old",
      refresh_token: "old",
      expires_at: 0,
    }),
    refreshLease: null as Date | null,
  };
  const replacementLease = new Date(Date.now() + 120_000);
  const services = {
    config: {
      PUBLIC_URL: "https://example.test",
      SUPABASE_OAUTH_CLIENT_ID: "fixture",
      SUPABASE_OAUTH_CLIENT_SECRET: "fixture",
    },
    secrets: {
      open: async (value: string) => JSON.parse(value),
      seal: async (value: unknown) => JSON.stringify(value),
    },
    store: {
      connection: async () => ({ ...current }),
      refreshLock: async (_id: string, lease: Date) => {
        current.refreshLease = lease;
        return true;
      },
      replaceMonitorSecret: async (
        previous: Connection,
        secret: string,
        lease: Date,
      ) => {
        if (
          current.secret !== previous.secret ||
          current.refreshLease !== lease
        )
          return false;
        current.secret = secret;
        return true;
      },
      releaseMonitorRefresh: async (_id: string, lease: Date) => {
        if (current.refreshLease === lease) current.refreshLease = null;
      },
    },
    http: async () => {
      current.secret = "reconnected-grant";
      current.refreshLease = replacementLease;
      return Response.json({
        access_token: "stale",
        refresh_token: "stale",
        expires_in: 3600,
      });
    },
  } as unknown as Services;
  await expect(
    supabaseAccess(services, { ...current } as Connection),
  ).rejects.toMatchObject({ code: "connection_changed_during_refresh" });
  expect(current.secret).toBe("reconnected-grant");
  expect(current.refreshLease).toBe(replacementLease);
});

it("does not persist another error after a stale claim is rejected by the health write", async () => {
  const finish = vi.fn(),
    monitorError = vi.fn();
  const sourceError = vi.fn(async (_id, _code, claim) => {
    expect(claim.leaseToken).toBe(job.leaseToken);
    throw new AppError("job_lease_lost", 409);
  });
  const services = {
    http: async () => {
      throw new Error("fixture transport failure");
    },
    config: {},
    secrets: { open: async () => ({ apiKey: "fixture" }) },
    store: {
      claim: async () => ({
        ...job,
        payload: {
          kind: "monitor.collect",
          sourceId: "source",
          historical: true,
        },
      }),
      source: async () => ({
        id: "source",
        workspaceId: "workspace",
        connectionId: "connection",
        externalId: "ins_fixture",
        kind: "clerk",
      }),
      monitorState: async () => ({
        historyDone: false,
        historyFrom: "2026-01-01T00:00:00Z",
        historyUntil: "2026-01-02T00:00:00Z",
        historyCursor: {},
        environment: "production",
      }),
      connection: async () => ({
        id: "connection",
        kind: "clerk",
        active: true,
        secret: "fixture",
      }),
      providerBudget: async () => true,
      sourceError,
      monitorError,
      finish,
    },
  } as unknown as Services;
  await expect(runOne(services)).resolves.toBe(true);
  expect(sourceError).toHaveBeenCalledOnce();
  expect(monitorError).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
});

it("keeps an observation unresolved when optional matching credentials need reconnecting", async () => {
  const connection = {
    id: "stripe",
    workspaceId: "workspace",
    projectId: "project",
    kind: "stripe",
    active: true,
    secret: "fixture",
  };
  const services = {
    config: {},
    secrets: { open: async () => ({ authMethod: "oauth", expiresAt: "0" }) },
    store: {
      snapshot: async () => ({ connections: [connection] }),
      connection: async () => connection,
      refreshLock: async () => true,
      releaseMonitorRefresh: async () => {},
    },
  } as unknown as Services;
  const event = {
    id: "event",
    kind: "renewal",
    environment: "production",
    candidate: { provider: "stripe", object: "in_fixture" },
  } as Observation;
  const source = {
    workspaceId: "workspace",
    projectId: "project",
  } as Parameters<typeof verifiedMatches>[1];
  expect(await verifiedMatches(services, source, [event])).toEqual([event]);
});

it("catches up delayed reports once, excludes connection history and skips already announced queries", async () => {
  const deliveries = new Map<string, string>();
  let now = new Date("2026-10-10T12:00:00Z");
  const requestMetric = vi.fn(async (_source, query) => ({
    result: {
      status:
        Date.parse(query.from) <= now.getTime() - 3 * 86400_000
          ? "available"
          : "unavailable",
      summary: "5",
      points: [],
      unit: "count",
      timezone: "America/Los_Angeles",
      definition: "Fixture",
    },
  }));
  const source = {
    id: "source",
    kind: "google-play",
    connectionId: "connection",
    name: "App",
  };
  const services = {
    store: {
      monitoringState: async () => ({
        views: [
          {
            id: "view",
            sourceId: "source",
            metric: "native:installs",
            hidden: false,
            filters: {},
          },
        ],
        states: [{ sourceId: "source", notifyAfter: "2026-10-08T00:00:00Z" }],
      }),
      snapshot: async () => ({
        sources: [source],
        connections: [{ id: "connection", active: true }],
      }),
      reportDeliveryKeys: async () => [...deliveries.keys()],
      requestMetric,
      fanoutForJob: async (
        _project: Project,
        key: string,
        notification: Notification,
        claim: Job,
      ) => {
        expect(claim).toBe(job);
        expect(deliveries.has(key)).toBe(false);
        deliveries.set(key, notification.text);
      },
    },
  } as unknown as Services;
  const project = {
    id: "project",
    workspaceId: "workspace",
    timezone: "UTC",
  } as Project;
  for (let day = 10; day <= 20; day++) {
    now = new Date(`2026-10-${day}T12:00:00Z`);
    await monitoringSummary(services, project, now, job);
  }
  expect(deliveries.size).toBe(9); // October 9–17, after the connection baseline.
  expect(
    [...deliveries.keys()].every((key) => !key.includes("2026-10-08")),
  ).toBe(true);
  requestMetric.mockClear();
  await monitoringSummary(services, project, now, job);
  expect(deliveries.size).toBe(9);
  expect(
    requestMetric.mock.calls.map(([, query]) => query.from).sort(),
  ).toEqual(["2026-10-18", "2026-10-19"]);
});

it("logs the matched route without the unsubscribe capability when the database fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const token = "a".repeat(43);
  const app = createApi({
    config: {},
    store: {
      unsubscribe: async () => {
        throw new Error("fixture failure");
      },
    },
  } as unknown as ApiServices);
  expect(
    (await app.request(`/api/unsubscribe/${token}`, { method: "POST" })).status,
  ).toBe(500);
  expect(error).toHaveBeenCalledOnce();
  expect(String(error.mock.calls[0][0])).not.toContain(token);
  expect(JSON.parse(String(error.mock.calls[0][0])).path).toBe(
    "/api/unsubscribe/:token",
  );
});

function projectApi() {
  const id = crypto.randomUUID();
  const projectOverview = vi.fn(async () => ({ dates: ["2026-10-23"] }));
  const monitoringState = vi.fn(async () => ({ states: [], views: [] }));
  const services = {
    config: { PUBLIC_URL: "https://example.test" },
    auth: { identity: async () => ({ issuer: "fixture", subject: "fixture" }) },
    store: {
      resolveIdentity: async () => ({
        workspaceId: "workspace",
        userId: "user",
        name: "Fixture",
      }),
      project: async (workspaceId: string, projectId: string) =>
        workspaceId === "workspace" && projectId === id
          ? { id, timezone: "Europe/Berlin" }
          : undefined,
      projectOverview,
      monitoringState,
    },
  } as unknown as ApiServices;
  return { id, app: createApi(services), projectOverview, monitoringState };
}

it("allows the current project-calendar date before the UTC day changes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T22:30:00Z"));
  const { id, app, projectOverview } = projectApi();
  expect(
    (
      await app.request(
        `/api/projects/${id}/overview?from=2026-10-23&to=2026-10-23`,
      )
    ).status,
  ).toBe(200);
  expect(projectOverview).toHaveBeenCalledWith(
    expect.objectContaining({ timezone: "Europe/Berlin" }),
    { from: "2026-10-23", to: "2026-10-23" },
  );
  expect(
    (
      await app.request(
        `/api/projects/${id}/overview?from=2026-10-24&to=2026-10-24`,
      )
    ).status,
  ).toBe(400);
});

it("authorizes lightweight monitoring state separately from metric payloads", async () => {
  const { id, app, monitoringState } = projectApi();
  const response = await app.request(`/api/projects/${id}/monitoring/state`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ states: [], views: [] });
  expect(monitoringState).toHaveBeenCalledExactlyOnceWith("workspace", id);
  expect(
    (await app.request(`/api/projects/${crypto.randomUUID()}/monitoring/state`))
      .status,
  ).toBe(404);
  expect(monitoringState).toHaveBeenCalledOnce();
});
