/// <reference path="../worker-configuration.d.ts" />
import { configuration } from "../../../packages/backend/src/config";
import { compose } from "../../../packages/backend/src/compose";
import { runOne } from "../../../packages/backend/src/runner";
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
      if (new Date(event.scheduledTime).getUTCMinutes() === 0)
        await services.store.cleanup();
      const ids = await services.store.dueJobs(100);
      if (ids.length) {
        await env.JOBS.sendBatch(
          ids.map((id) => ({ body: { id }, contentType: "json" })),
        );
        for (const id of ids) await services.store.markDispatched(id);
      }
    } finally {
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
          message.retry({ delaySeconds: 30 });
        }
      }
    } finally {
      await close();
    }
  },
} satisfies ExportedHandler<JobBindings>;
