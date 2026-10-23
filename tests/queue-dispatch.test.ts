import { beforeEach, expect, it, vi } from "vitest";

const { store, close, sendBatch } = vi.hoisted(() => ({
  store: {
    dueJobs: vi.fn<() => Promise<string[]>>(),
    markDispatched: vi.fn(async (_id: string) => {}),
    cleanup: vi.fn(),
  },
  close: vi.fn(async () => {}),
  sendBatch: vi.fn(),
}));
vi.mock("../packages/backend/src/config", () => ({
  configuration: () => ({}),
}));
vi.mock("../packages/backend/src/compose", () => ({
  compose: () => ({ services: { store }, close }),
}));
import worker from "../apps/jobs/src/cloudflare";

const event = {
  scheduledTime: Date.parse("2026-10-23T12:01:00Z"),
} as ScheduledController;
const env = {
  DATABASE: { connectionString: "fixture" },
  JOBS: { sendBatch },
} as unknown as JobBindings;

beforeEach(() => vi.clearAllMocks());

it("publishes up to 100 due jobs in one batch before marking any dispatched", async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `job-${i}`);
  store.dueJobs.mockResolvedValue(ids);
  sendBatch.mockImplementation(async (messages) => {
    expect(store.markDispatched).not.toHaveBeenCalled();
    expect(messages).toEqual(
      ids.map((id) => ({ body: { id }, contentType: "json" })),
    );
  });

  await worker.scheduled(event, env);

  expect(store.dueJobs).toHaveBeenCalledExactlyOnceWith(100);
  expect(sendBatch).toHaveBeenCalledOnce();
  expect(store.markDispatched.mock.calls.map(([id]) => id)).toEqual(ids);
  expect(close).toHaveBeenCalledOnce();
});

it("does not publish a queue message when no job is due", async () => {
  store.dueJobs.mockResolvedValue([]);
  await worker.scheduled(event, env);
  expect(sendBatch).not.toHaveBeenCalled();
  expect(store.markDispatched).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it("leaves jobs recoverable and closes the connection after failed publication", async () => {
  store.dueJobs.mockResolvedValue(["job-1", "job-2"]);
  sendBatch.mockRejectedValue(new Error("publication failed"));
  await expect(worker.scheduled(event, env)).rejects.toThrow(
    "publication failed",
  );
  expect(store.markDispatched).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
