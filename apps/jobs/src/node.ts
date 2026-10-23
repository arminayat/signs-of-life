import { setTimeout } from "node:timers/promises";
import { nodeServices } from "../../../packages/backend/src/node";
import { runOne } from "../../../packages/backend/src/runner";
import { cleanupSafely, reportJobDiagnostics } from "./maintenance";
const { services, close } = nodeServices();
let running = true,
  nextCleanup = 0;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
console.log("Signs of Life background worker listening");
try {
  while (running) {
    try {
      const executed = await runOne(services);
      if (Date.now() >= nextCleanup) {
        const pending = await cleanupSafely(services.store);
        await reportJobDiagnostics(services.store);
        nextCleanup = Date.now() + (pending ? 60_000 : 3600_000);
      }
      if (!executed) await setTimeout(1000);
    } catch {
      console.error(JSON.stringify({ event: "worker_loop_failed" }));
      await setTimeout(5000);
    }
  }
} finally {
  await close();
}
