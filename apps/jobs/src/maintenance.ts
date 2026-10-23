import type { MonitorStore } from "../../../packages/core/src/store";

export async function cleanupSafely(store: MonitorStore) {
  try {
    return await store.cleanup();
  } catch {
    console.error(JSON.stringify({ event: "worker_cleanup_failed" }));
    return true;
  }
}

export async function drainCleanup(store: MonitorStore) {
  const deadline = Date.now() + 45_000;
  for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
    try {
      if (!(await store.cleanup())) return;
    } catch {
      console.error(JSON.stringify({ event: "worker_cleanup_failed" }));
      return;
    }
  }
}

export async function reportJobDiagnostics(store: MonitorStore) {
  try {
    const diagnostics = await store.jobDiagnostics();
    console.log(JSON.stringify({ event: "worker_health", ...diagnostics }));
  } catch {
    console.error(JSON.stringify({ event: "worker_health_failed" }));
  }
}
