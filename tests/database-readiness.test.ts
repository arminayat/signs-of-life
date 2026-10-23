import { expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { fixture } from "./helpers";
import { postgresStore } from "../packages/db/src/store";
import type { Database } from "../packages/db/src/client";

it("returns 503 without migration-ledger access and accepts read-only ledger grants", async () => {
  const f = await fixture();
  const rollback = new Error("rollback readiness role probe");
  try {
    await expect(
      f.db.transaction(async (tx) => {
        const role = sql.identifier(
          `readiness_${crypto.randomUUID().replaceAll("-", "")}`,
        );
        await tx.execute(sql`create role ${role} nologin`);
        await tx.execute(sql`savepoint before_restricted_role`);
        await tx.execute(sql`set local role ${role}`);
        await expect(
          postgresStore(tx as unknown as Database).health(),
        ).rejects.toMatchObject({
          code: "database_unavailable_or_unmigrated",
          status: 503,
        });
        // A PostgreSQL permission error aborts the statement transaction; recover
        // before granting exactly the read permissions needed by readiness.
        await tx.execute(sql`rollback to savepoint before_restricted_role`);
        await tx.execute(sql`reset role`);
        await tx.execute(
          sql`grant usage on schema signs_of_life_migrations to ${role}`,
        );
        await tx.execute(
          sql`grant select on signs_of_life_migrations.__drizzle_migrations to ${role}`,
        );
        await tx.execute(sql`set local role ${role}`);
        await expect(
          postgresStore(tx as unknown as Database).health(),
        ).resolves.toBeUndefined();
        await tx.execute(sql`reset role`);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await f.close();
  }
});
