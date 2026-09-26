import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { expect, test } from "vitest";
import { database } from "../packages/db/src/client";
import { migrateDatabase } from "../packages/db/src/migrations";
import { testUrl } from "./helpers";

test.each([false, true])(
  "Signs of Life migration preserves data and is repeatable (legacy=%s)",
  async (legacy) => {
    if (!new URL(testUrl).pathname.endsWith("_test"))
      throw new Error("Migration tests require a test database");
    const name = `signs_of_life_${crypto.randomUUID().replaceAll("-", "")}_test`;
    const admin = new pg.Client({ connectionString: testUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(testUrl);
    url.pathname = `/${name}`;
    const { db, close } = database(url.toString());
    const folder = await mkdtemp(join(tmpdir(), "signs-of-life-migration-"));
    try {
      if (legacy) {
        const source = "packages/db/migrations";
        const journal = JSON.parse(
          await readFile(`${source}/meta/_journal.json`, "utf8"),
        );
        journal.entries = journal.entries.slice(0, 3);
        await mkdir(join(folder, "meta"));
        await writeFile(
          join(folder, "meta/_journal.json"),
          JSON.stringify(journal),
        );
        for (const entry of journal.entries)
          await copyFile(
            `${source}/${entry.tag}.sql`,
            join(folder, `${entry.tag}.sql`),
          );
        await migrate(db, {
          migrationsFolder: folder,
          migrationsSchema: "pm_migrations",
        });
        await db.execute(
          sql`INSERT INTO pm.users (name) VALUES ('Existing member')`,
        );
        await db.execute(sql`
          INSERT INTO pm.workspaces (owner_id) SELECT id FROM pm.users;
          INSERT INTO pm.projects (workspace_id, name)
            SELECT id, 'Existing project' FROM pm.workspaces;
          INSERT INTO pm.connections (workspace_id, kind, name, secret)
            SELECT id, 'supabase', 'Linked', 'preserved-linked-secret' FROM pm.workspaces;
          INSERT INTO pm.sources (workspace_id, project_id, connection_id, kind, external_id, name)
            SELECT c.workspace_id, p.id, c.id, 'supabase', 'existing-ref', 'Existing source'
            FROM pm.connections c JOIN pm.projects p ON p.workspace_id = c.workspace_id;
          INSERT INTO pm.connections (workspace_id, kind, name, secret)
            SELECT id, 'apple', 'Unattached', 'preserved-unattached-secret' FROM pm.workspaces;
          INSERT INTO pm_identity."user" (id, name, email)
            VALUES ('existing-auth-user', 'Existing member', 'fixture@example.test');
        `);
      }

      await migrateDatabase(db);
      await migrateDatabase(db);

      const schemas = await db.execute(sql`
        SELECT nspname FROM pg_namespace
        WHERE nspname IN ('pm', 'pm_identity', 'pm_migrations',
          'signs_of_life', 'signs_of_life_identity', 'signs_of_life_migrations')
        ORDER BY nspname
      `);
      expect(schemas.rows.map((row) => row.nspname)).toEqual([
        "signs_of_life",
        "signs_of_life_identity",
        "signs_of_life_migrations",
      ]);
      const ledger = await db.execute(
        sql`SELECT count(*)::int AS count FROM signs_of_life_migrations.__drizzle_migrations`,
      );
      expect(ledger.rows[0]?.count).toBe(11);
      const missingDaily = await db.execute(
        sql`select count(*)::int as count from signs_of_life.projects p where not exists (select 1 from signs_of_life.jobs j where j.key = 'daily:' || p.id)`,
      );
      expect(missingDaily.rows[0]?.count).toBe(0);

      if (legacy) {
        const projects = await db.execute(sql`
          SELECT p.name, u.name AS owner FROM signs_of_life.projects p
          JOIN signs_of_life.workspaces w ON w.id = p.workspace_id
          JOIN signs_of_life.users u ON u.id = w.owner_id
          ORDER BY p.name
        `);
        expect(projects.rows).toEqual([
          { name: "Existing project", owner: "Existing member" },
          { name: "Unattached", owner: "Existing member" },
        ]);
        const connections = await db.execute(sql`
          SELECT c.name, c.secret, p.name AS project FROM signs_of_life.connections c
          JOIN signs_of_life.projects p ON p.id = c.project_id ORDER BY c.name
        `);
        expect(connections.rows).toEqual([
          {
            name: "Linked",
            secret: "preserved-linked-secret",
            project: "Existing project",
          },
          {
            name: "Unattached",
            secret: "preserved-unattached-secret",
            project: "Unattached",
          },
        ]);
        const auth = await db.execute(
          sql`SELECT id FROM signs_of_life_identity."user"`,
        );
        expect(auth.rows).toEqual([{ id: "existing-auth-user" }]);
        // Existing cross-table foreign keys and cascades still work after renaming.
        await db.execute(sql`DELETE FROM signs_of_life.users`);
        const remaining = await db.execute(
          sql`SELECT count(*)::int AS count FROM signs_of_life.projects`,
        );
        expect(remaining.rows[0]?.count).toBe(0);
      }
    } finally {
      await close();
      await admin.query(`DROP DATABASE "${name}"`);
      await admin.end();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
