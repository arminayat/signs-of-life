import { expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { fixture } from "./helpers";
import { users, workspaces } from "../packages/db/src/schema";

it("resolves simultaneous first logins to one user and workspace", async () => {
  const f = await fixture(null);
  const name = `Concurrent ${crypto.randomUUID()}`;
  let workspaceId: string | undefined;
  try {
    const identity = { issuer: "test", subject: crypto.randomUUID(), name };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => f.store.resolveIdentity(identity)),
    );
    workspaceId = results[0].workspaceId;
    expect(new Set(results.map((result) => result.userId)).size).toBe(1);
    expect(new Set(results.map((result) => result.workspaceId)).size).toBe(1);
    const [userCount] = await f.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.name, name));
    const [workspaceCount] = await f.db
      .select({ value: count() })
      .from(workspaces)
      .where(eq(workspaces.ownerId, results[0].userId));
    expect(userCount.value).toBe(1);
    expect(workspaceCount.value).toBe(1);
  } finally {
    if (workspaceId) await f.store.deleteWorkspace(workspaceId);
    await f.close();
  }
});
