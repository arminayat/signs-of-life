import { afterEach, expect, it, vi } from "vitest";
import { collectMonitor } from "../packages/backend/src/monitoring-jobs";
import type { Services } from "../packages/backend/src/services";
import type { Job } from "../packages/core/src/store";

afterEach(() => vi.useRealTimers());
it.each([
  ["Europe/Berlin", "2026-10-22T22:30:00Z", false, "2026-09-24", "2026-10-23"],
  [
    "America/Los_Angeles",
    "2026-10-23T02:00:00Z",
    false,
    "2026-09-23",
    "2026-10-22",
  ],
  ["Europe/Berlin", "2026-03-29T22:30:00Z", false, "2026-03-01", "2026-03-30"],
  ["Europe/Berlin", "2026-10-22T22:30:00Z", true, "2025-10-24", "2026-10-23"],
])(
  "refreshes the displayed project range for %s at %s (history=%s)",
  async (timezone, instant, historical, from, to) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    const requestMetric = vi.fn(async () => ({}));
    const source = {
      id: "source",
      projectId: "project",
      workspaceId: "workspace",
      connectionId: "connection",
      externalId: "app.fixture",
      kind: "google-play",
    };
    const services = {
      config: {},
      http: vi.fn(() => {
        throw new Error("No provider call expected");
      }),
      secrets: { open: async () => ({ accessToken: "fixture" }) },
      store: {
        source: async () => source,
        project: async () => ({ id: "project", timezone }),
        connection: async () => ({
          id: "connection",
          kind: "google-play",
          active: true,
          secret: "fixture",
        }),
        providerBudget: async () => true,
        monitorState: async () => ({
          notifyAfter: "2026-01-01T00:00:00Z",
          liveFrom: "2026-01-01T00:00:00Z",
          historyFrom: "2025-01-01T00:00:00Z",
          historyUntil: "2026-01-01T00:00:00Z",
          environment: "production",
        }),
        saveMonitorPage: vi.fn(),
        updateConnectionHealth: vi.fn(),
        monitoringState: async () => ({
          views: [
            {
              sourceId: "source",
              metric: "native:installs",
              filters: {},
              hidden: false,
            },
          ],
        }),
        requestMetric,
      },
    } as unknown as Services;
    await collectMonitor(
      services,
      { workspaceId: "workspace" } as Job,
      "source",
      historical,
    );
    expect(requestMetric).toHaveBeenCalledExactlyOnceWith(
      source,
      { metric: "native:installs", from, to, filters: {} },
      expect.any(String),
    );
    expect(services.http).not.toHaveBeenCalled();
  },
);
