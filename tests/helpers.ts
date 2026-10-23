import { testDatabaseUrl } from "../scripts/test-database";
import { eq } from "drizzle-orm";
import { jobs } from "../packages/db/src/schema";
import type { MonitorStore } from "../packages/core/src/store";
import { migrateDatabase } from "../packages/db/src/migrations";
import { database } from "../packages/db/src/client";
import { postgresStore } from "../packages/db/src/store";
import { configuration } from "../packages/backend/src/config";
import { secretBox } from "../packages/adapters/src/crypto";
import type { ApiServices } from "../packages/backend/src/services";
import type { Identity } from "../packages/core/src/model";
export const testUrl = testDatabaseUrl();
const fencedMethods = [
  "recordAccounts",
  "saveReport",
  "saveMetric",
  "saveMonitorPage",
  "sourceError",
  "monitorError",
  "updateDelivery",
  "removeMonitorInbox",
  "delayProvider",
] as const;
type FencedMethod = (typeof fencedMethods)[number];
type OptionalLast<T extends unknown[]> = T extends [...infer A, infer B]
  ? [...A, B?]
  : T;
type FixtureStore = Omit<MonitorStore, FencedMethod> & {
  [K in FencedMethod]: (
    ...args: OptionalLast<Parameters<MonitorStore[K]>>
  ) => ReturnType<MonitorStore[K]>;
};
export async function fixture(
  identity: Identity | null = {
    issuer: "test",
    subject: crypto.randomUUID(),
    name: "Test member",
  },
) {
  if (!new URL(testUrl).pathname.endsWith("_test"))
    throw new Error("Tests require a database name ending in _test");
  const { db, close } = database(testUrl, 10);
  await migrateDatabase(db);
  const store = postgresStore(db);
  const config = configuration(
    {
      DATABASE_URL: testUrl,
      PUBLIC_URL: "http://localhost:5173",
      AUTH_SECRET: "test-only-auth-secret-not-used-in-any-deployment",
      ENCRYPTION_KEYS: JSON.stringify({
        v1: Buffer.alloc(32, 7).toString("base64"),
      }),
      TELEGRAM_BOT_USERNAME: "fixture_bot",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret-long-enough-for-validation",
      EMAIL_PROVIDER: "resend",
      MAIL_FROM: "signs-of-life@example.test",
      RESEND_API_KEY: "test-fixture-not-a-real-key",
    },
    "node",
  );
  const services: ApiServices = {
    http: async (input) =>
      String(input).includes("/oauth/token")
        ? Response.json({
            access_token: "test-token",
            refresh_token: "test-refresh",
            expires_in: 3600,
          })
        : String(input).endsWith("/organizations")
          ? Response.json([{ id: "fixture-org", name: "Example organization" }])
          : Response.json([
              {
                id: "fixture-project",
                name: "Example production",
                organization_id: "fixture-org",
              },
            ]),
    config,
    store,
    secrets: secretBox(config.ENCRYPTION_KEYS, "v1"),
    auth: {
      enabled: true,
      identity: async () => identity,
      login: async () => Response.json({ url: config.PUBLIC_URL }),
      logout: async () => Response.json({ success: true }),
      handle: async () => new Response(null, { status: 404 }),
    },
    accounts: { collect: async () => [] },
    reports: { report: async () => [] },
    channels: {
      email: {
        send: async () => ({
          status: "accepted",
          providerId: crypto.randomUUID(),
        }),
      },
      telegram: { send: async () => ({ status: "accepted", providerId: "1" }) },
    },
  };
  const member = identity ? await store.resolveIdentity(identity) : undefined;
  // Fixture setup may call persistence directly, but still obtains a real claim.
  // Production services keep the strict store and cannot omit job ownership.
  const testStore = new Proxy(store, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (!(fencedMethods as readonly string[]).includes(String(property)))
        return value;
      return async (...args: unknown[]) => {
        if (args.length === value.length && args.at(-1)) return value(...args);
        if (!member)
          throw new Error(
            "A fixture identity is required for an automatic test claim",
          );
        const key = `fixture-lease:${crypto.randomUUID()}`;
        await store.enqueue(member.workspaceId, key, {
          kind: "daily",
          projectId: crypto.randomUUID(),
        });
        const [row] = await db.select().from(jobs).where(eq(jobs.key, key));
        const job = (await store.claim(row.id))!;
        try {
          return await value(...args, job);
        } finally {
          await store.finish(job);
        }
      };
    },
  }) as FixtureStore;
  return {
    db,
    store: testStore,
    services,
    member,
    async close() {
      if (member) await store.deleteWorkspace(member.workspaceId);
      await close();
    },
  };
}
