import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { gracefulShutdown } from "../apps/api/src/shutdown";
import {
  cleanupSafely,
  drainCleanup,
  reportJobDiagnostics,
} from "../apps/jobs/src/maintenance";
import { dispatchJobs } from "../apps/jobs/src/dispatch";
import type { MonitorStore } from "../packages/core/src/store";

afterEach(() => vi.restoreAllMocks());

it("drains bounded pending cleanup batches and stops on failure without a tight retry loop", async () => {
  const cleanup = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValue(false);
  await drainCleanup({ cleanup } as unknown as MonitorStore);
  expect(cleanup).toHaveBeenCalledTimes(3);
  cleanup.mockReset().mockResolvedValue(true);
  await drainCleanup({ cleanup } as unknown as MonitorStore);
  expect(cleanup).toHaveBeenCalledTimes(10);
  vi.spyOn(console, "error").mockImplementation(() => {});
  cleanup.mockReset().mockRejectedValue(new Error("fixture retention failure"));
  await drainCleanup({ cleanup } as unknown as MonitorStore);
  expect(cleanup).toHaveBeenCalledOnce();
});

it("dispatches more than one batch after cleanup fails, reserving before publication", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const pending = Array.from({ length: 250 }, (_, index) => String(index));
  const reserved = new Set<string>();
  const store = {
    cleanup: async () => {
      throw new Error("fixture retention failure");
    },
    reserveDueJobs: async (limit: number) => {
      const batch = pending.splice(0, limit);
      batch.forEach((id) => reserved.add(id));
      return batch;
    },
    releaseDispatch: vi.fn(),
  } as unknown as MonitorStore;
  const sendBatch = vi.fn<Queue<{ id: string }>["sendBatch"]>(async (batch) => {
    expect([...batch].every(({ body }) => reserved.has(body.id))).toBe(true);
    return { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } };
  });
  expect(await cleanupSafely(store)).toBe(true);
  expect(await dispatchJobs(store, { sendBatch })).toBe(250);
  expect(sendBatch.mock.calls.map(([batch]) => [...batch].length)).toEqual([
    100, 100, 50,
  ]);
});

it("releases a failed publication reservation for database recovery", async () => {
  const releaseDispatch = vi.fn();
  const store = {
    reserveDueJobs: async () => ["job"],
    releaseDispatch,
  } as unknown as MonitorStore;
  await expect(
    dispatchJobs(store, {
      sendBatch: async () => {
        throw new Error("fixture queue failure");
      },
    }),
  ).rejects.toThrow("fixture queue failure");
  expect(releaseDispatch).toHaveBeenCalledWith(["job"]);
});

it("bounds dispatch even when more work continually becomes due", async () => {
  const reserveDueJobs = vi.fn(async () =>
    Array.from({ length: 100 }, (_, i) => String(i)),
  );
  const store = { reserveDueJobs } as unknown as MonitorStore;
  expect(
    await dispatchJobs(store, {
      sendBatch: async () => ({
        metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      }),
    }),
  ).toBe(1000);
  expect(reserveDueJobs).toHaveBeenCalledTimes(10);
});

it("emits persisted backlog/freshness diagnostics and isolates diagnostic failures", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await reportJobDiagnostics({
    jobDiagnostics: async () => ({ pending: 7, failed: 1, expiredLeases: 2 }),
  } as unknown as MonitorStore);
  expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
    event: "worker_health",
    pending: 7,
    failed: 1,
    expiredLeases: 2,
  });
  await expect(
    reportJobDiagnostics({
      jobDiagnostics: async () => {
        throw new Error("fixture");
      },
    } as unknown as MonitorStore),
  ).resolves.toBeUndefined();
  expect(JSON.parse(String(error.mock.calls[0][0])).event).toBe(
    "worker_health_failed",
  );
});

it("drains an active HTTP request before closing its database and exits only once", async () => {
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const closeDatabase = vi.fn(async () => {}),
    exit = vi.fn();
  const server = createServer(async (_request, response) => {
    entered();
    await pending;
    expect(closeDatabase).not.toHaveBeenCalled();
    response.end("finished");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("missing test address");
  const response = fetch(`http://127.0.0.1:${address.port}`);
  await started;
  const shutdown = gracefulShutdown(server, closeDatabase, exit);
  const first = shutdown(),
    repeated = shutdown();
  expect(first).toBe(repeated);
  expect(closeDatabase).not.toHaveBeenCalled();
  release();
  expect(await (await response).text()).toBe("finished");
  await first;
  expect(closeDatabase).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
});
