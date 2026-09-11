import { serve } from "@hono/node-server";
import { createApi } from "../../../packages/backend/src/api";
import { authentication } from "../../../packages/backend/src/authentication";
import { nodeServices } from "../../../packages/backend/src/node";
const { services, db, close } = nodeServices();
const server = serve({
  fetch: createApi({ ...services, auth: authentication(services.config, db) })
    .fetch,
  port: Number(process.env.PORT ?? 8787),
  hostname: process.env.HOST ?? "127.0.0.1",
});
console.log("Product Monitor API listening");
async function shutdown() {
  server.close();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
