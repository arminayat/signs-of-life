import { beforeEach, expect, it, vi } from "vitest";

const { store, close, sendBatch } = vi.hoisted(() => ({
  store: {
    reserveDueJobs: vi.fn<() => Promise<string[]>>(),
    releaseDispatch: vi.fn(async (_ids: string[]) => {}),
    jobDiagnostics: vi.fn(async () => ({})),
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

beforeEach(() => vi.resetAllMocks());

it("publishes reserved jobs in batches and stops when the next scan is empty", async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `job-${i}`);
  store.reserveDueJobs.mockResolvedValueOnce(ids).mockResolvedValue([]);
  sendBatch.mockImplementation(async (messages) => {
    expect(store.releaseDispatch).not.toHaveBeenCalled();
    expect(messages).toEqual(
      ids.map((id) => ({ body: { id }, contentType: "json" })),
    );
  });

  await worker.scheduled(event, env);

  expect(store.reserveDueJobs).toHaveBeenCalledTimes(2);
  expect(store.reserveDueJobs).toHaveBeenCalledWith(100);
  expect(sendBatch).toHaveBeenCalledOnce();
  expect(store.releaseDispatch).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it("does not publish a queue message when no job is due", async () => {
  store.reserveDueJobs.mockResolvedValue([]);
  await worker.scheduled(event, env);
  expect(sendBatch).not.toHaveBeenCalled();
  expect(store.releaseDispatch).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it("leaves jobs recoverable and closes the connection after failed publication", async () => {
  store.reserveDueJobs.mockResolvedValue(["job-1", "job-2"]);
  sendBatch.mockRejectedValue(new Error("publication failed"));
  await expect(worker.scheduled(event, env)).rejects.toThrow(
    "publication failed",
  );
  expect(store.releaseDispatch).toHaveBeenCalledExactlyOnceWith([
    "job-1",
    "job-2",
  ]);
  expect(close).toHaveBeenCalledOnce();
});
