import { serve } from "@hono/node-server";
import { createApi } from "../../../packages/backend/src/api";
import { authentication } from "../../../packages/backend/src/authentication";
import { nodeServices } from "../../../packages/backend/src/node";
import { gracefulShutdown } from "./shutdown";
import type { Server } from "node:http";
const { services, db, close } = nodeServices();
const server = serve({
  fetch: createApi({ ...services, auth: authentication(services.config, db) })
    .fetch,
  port: Number(process.env.PORT ?? 8787),
  hostname: process.env.HOST ?? "127.0.0.1",
});
console.log("Signs of Life API listening");
const shutdown = gracefulShutdown(server as Server, close);
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
