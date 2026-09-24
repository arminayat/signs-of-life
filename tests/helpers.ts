import { migrateDatabase } from "../packages/db/src/migrations";
import { database } from "../packages/db/src/client";
import { postgresStore } from "../packages/db/src/store";
import { configuration } from "../packages/backend/src/config";
import { secretBox } from "../packages/adapters/src/crypto";
import type { ApiServices } from "../packages/backend/src/services";
import type { Identity } from "../packages/core/src/model";
export const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://signs_of_life:signs_of_life@127.0.0.1:5432/signs_of_life_test";
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
        : Response.json([
            { id: "fixture-project", name: "Example production" },
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
  return {
    db,
    store,
    services,
    member,
    async close() {
      if (member) await store.deleteWorkspace(member.workspaceId);
      await close();
    },
  };
}
