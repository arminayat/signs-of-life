import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client";

export async function migrateDatabase(db: Database) {
  // Move the existing ledger before Drizzle reads it. Otherwise an upgrade
  // would replay already-applied migrations against populated tables.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pm_migrations') THEN
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'signs_of_life_migrations') THEN
          RAISE EXCEPTION 'Both legacy and Signs of Life migration schemas exist; reconcile them before upgrading';
        END IF;
        ALTER SCHEMA pm_migrations RENAME TO signs_of_life_migrations;
      END IF;
    END $$;
  `);
  await migrate(db, {
    migrationsFolder: "./packages/db/migrations",
    migrationsSchema: "signs_of_life_migrations",
  });
}
