import { and, count, eq } from "drizzle-orm";
import type { Database } from "./client";
import {
  identities,
  users,
  workspaces,
  projects,
  connections,
  destinations,
  jobs,
} from "./schema";
import { session } from "./auth-schema";
export type IdentityMapping = {
  userId: string;
  issuer: string;
  subject: string;
};
export async function migrateIdentities(
  db: Database,
  mappings: IdentityMapping[],
) {
  await db.transaction(async (tx) => {
    for (const mapping of mappings) {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, mapping.userId))
        .for("update");
      if (!user)
        throw new Error(
          "A mapped application user does not exist. No changes were applied.",
        );
      const identityFilter = and(
        eq(identities.issuer, mapping.issuer),
        eq(identities.subject, mapping.subject),
      );
      const [existing] = await tx
        .select()
        .from(identities)
        .where(identityFilter)
        .for("update");
      if (existing && existing.userId !== mapping.userId) {
        const [workspace] = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.ownerId, existing.userId))
          .for("update");
        const [identityCount] = await tx
          .select({ value: count() })
          .from(identities)
          .where(eq(identities.userId, existing.userId));
        let empty = identityCount.value === 1;
        if (workspace) {
          for (const table of [projects, connections, destinations, jobs]) {
            const [rows] = await tx
              .select({ value: count() })
              .from(table)
              .where(eq(table.workspaceId, workspace.id));
            if (rows.value) empty = false;
          }
        }
        if (!empty)
          throw new Error(
            "An identity belongs to a populated workspace or another linked identity. No changes were applied.",
          );
        // A first login can create an empty workspace before the operator performs cutover.
        // The explicit mapping authorizes moving only this identity; never merge by email.
        await tx
          .update(identities)
          .set({ userId: mapping.userId })
          .where(identityFilter);
        await tx.delete(users).where(eq(users.id, existing.userId));
      } else await tx.insert(identities).values(mapping).onConflictDoNothing();
    }
    await tx.delete(session);
  });
}
