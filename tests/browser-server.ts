// Isolated UI test host. Never imported by production entrypoints.
import { and, eq, lte } from "drizzle-orm";
import { events, jobs, metrics } from "../packages/db/src/schema";
import { serve } from "@hono/node-server";
import { createServer } from "vite";
import { fixture } from "./helpers";
import { createApi } from "../packages/backend/src/api";
import { runOne } from "../packages/backend/src/runner";
import { hashToken } from "../packages/adapters/src/crypto";
if (process.env.NODE_ENV !== "test")
  throw new Error("This fixture server requires NODE_ENV=test");
const f = await fixture({
  issuer: "browser-test",
  subject: crypto.randomUUID(),
  name: "Alex Morgan",
});
f.services.config.PUBLIC_URL = "http://127.0.0.1:5217";
const workspaceId = f.member!.workspaceId;
const project = await f.store.createProject(
  workspaceId,
  {
    name: "Clearspace",
    description: "A little more room for what matters.",
    timezone: "Europe/Berlin",
  },
  50,
);
const connectionId = crypto.randomUUID();
await f.store.saveConnection({
  id: connectionId,
  workspaceId,
  kind: "supabase",
  name: "Supabase",
  secret: await f.services.secrets.seal(
    {
      access_token: "test-token",
      refresh_token: "test-refresh",
      expires_at: Date.now() + 86400_000,
    },
    connectionId,
  ),
  externalId: null,
});
const source = await f.store.createSource(
  {
    workspaceId,
    projectId: project.id,
    connectionId,
    kind: "supabase",
    name: "Clearspace production",
    externalId: "fixture-project",
  },
  100,
);
await f.db
  .insert(events)
  .values({
    workspaceId,
    sourceId: source.id,
    externalId: "fixture-account",
    occurredAt: new Date(),
    provider: "email",
  });
const appleConnectionId = crypto.randomUUID();
await f.store.saveConnection({
  id: appleConnectionId,
  workspaceId,
  kind: "apple",
  name: "Fixture App Store",
  secret: "test-only-unused",
  externalId: null,
});
const appleSource = await f.store.createSource(
  {
    workspaceId,
    projectId: project.id,
    connectionId: appleConnectionId,
    kind: "apple",
    name: "Clearspace iOS",
    externalId: "fixture-app",
  },
  100,
);
await f.db
  .insert(metrics)
  .values(
    [1, 2].map((offset) => ({
      workspaceId,
      sourceId: appleSource.id,
      date: new Date(Date.now() - offset * 86400_000)
        .toISOString()
        .slice(0, 10),
      downloads: offset === 1 ? 12 : 0,
      redownloads: offset === 1 ? 3 : 0,
    })),
  );
const destinationId = crypto.randomUUID();
await f.store.createDestination(
  {
    id: destinationId,
    workspaceId,
    kind: "telegram",
    name: "My Telegram",
    address: "123456",
    unsubscribeHash: await hashToken(crypto.randomUUID()),
  },
  100,
);
await f.store.updateDestination(workspaceId, destinationId, { verified: true });
await f.store.updateProject(workspaceId, project.id, {}, [destinationId]);
await f.store.fanout(project, "fixture-welcome", {
  title: "Your notifications are connected",
  text: "Clearspace updates will arrive in your Telegram chat.",
});
f.services.config.MAX_PROJECTS = 50;
f.services.config.MAX_DESTINATIONS = 100;
const app = createApi(f.services);
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 8797 });
const vite = await createServer({
  configFile: "apps/web/vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: 5217,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8797" },
  },
});
await vite.listen();
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const due = await f.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.status, "pending"),
          lte(jobs.dueAt, new Date()),
        ),
      )
      .limit(10);
    for (const job of due) await runOne(f.services, job.id);
  } finally {
    busy = false;
  }
}, 500);
async function stop() {
  clearInterval(timer);
  server.close();
  await vite.close();
  await f.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
console.log("Fixture UI available at http://127.0.0.1:5217");
