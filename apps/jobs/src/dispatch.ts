import type { MonitorStore } from "../../../packages/core/src/store";

export async function dispatchJobs(
  store: MonitorStore,
  queue: Pick<Queue<{ id: string }>, "sendBatch">,
) {
  const deadline = Date.now() + 45_000;
  let dispatched = 0;
  // Each reservation is oldest-due first and expires if this worker disappears.
  // Bound both wall time and batch count to leave room for the next Cron tick.
  for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
    const ids = await store.reserveDueJobs(100);
    if (!ids.length) break;
    try {
      await queue.sendBatch(
        ids.map((id) => ({ body: { id }, contentType: "json" })),
      );
      dispatched += ids.length;
    } catch (error) {
      // A duplicate hint is safe if publication succeeded but its acknowledgement
      // was lost; PostgreSQL still owns execution and the claim fence.
      await store.releaseDispatch(ids);
      throw error;
    }
    if (ids.length < 100) break;
  }
  return dispatched;
}
