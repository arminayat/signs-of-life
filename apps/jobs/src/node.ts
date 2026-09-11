import { setTimeout } from "node:timers/promises";
import { nodeServices } from "../../../packages/backend/src/node";
import { runOne } from "../../../packages/backend/src/runner";
const { services, close } = nodeServices();
let running = true,
  lastCleanup = 0;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
console.log("Product Monitor background worker listening");
try {
  while (running) {
    try {
      if (Date.now() - lastCleanup > 3600_000) {
        await services.store.cleanup();
        lastCleanup = Date.now();
      }
      if (!(await runOne(services))) await setTimeout(1000);
    } catch {
      console.error(JSON.stringify({ event: "worker_loop_failed" }));
      await setTimeout(5000);
    }
  }
} finally {
  await close();
}
