/// <reference path="../worker-configuration.d.ts" />
import { configuration } from "../../../packages/backend/src/config";
import { compose } from "../../../packages/backend/src/compose";
import { runOne } from "../../../packages/backend/src/runner";
import { dispatchJobs } from "./dispatch";
import { drainCleanup, reportJobDiagnostics } from "./maintenance";
function runtime(env: JobBindings) {
  return compose(
    configuration(
      { ...env, DATABASE_URL: env.DATABASE.connectionString },
      "cloudflare",
    ),
  );
}
export default {
  async scheduled(event, env) {
    const { services, close } = runtime(env);
    try {
      await dispatchJobs(services.store, env.JOBS);
      if (new Date(event.scheduledTime).getUTCMinutes() === 0)
        await drainCleanup(services.store);
    } finally {
      await reportJobDiagnostics(services.store);
      await close();
    }
  },
  async queue(batch, env) {
    const { services, close } = runtime(env);
    try {
      for (const message of batch.messages) {
        const body = message.body;
        if (
          typeof body !== "object" ||
          body === null ||
          !("id" in body) ||
          typeof body.id !== "string"
        ) {
          message.ack();
          continue;
        }
        try {
          await runOne(services, body.id);
          message.ack();
        } catch {
          console.warn(JSON.stringify({ event: "queue_execution_failed" }));
          message.retry({ delaySeconds: 30 });
        }
      }
    } finally {
      await close();
    }
  },
} satisfies ExportedHandler<JobBindings>;
