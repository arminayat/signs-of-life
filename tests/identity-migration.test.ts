import { afterEach, expect, it } from "vitest";
import { fixture } from "./helpers";
import { migrateIdentities } from "../packages/db/src/identity-migration";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
it("preserves the original workspace when an explicitly mapped provider identity already has an empty workspace", async () => {
  const original = await fixture({
    issuer: "old-provider",
    subject: crypto.randomUUID(),
    name: "Original",
  });
  cleanups.push(original.close);
  const subject = crypto.randomUUID();
  const fresh = await fixture({
    issuer: "new-provider",
    subject,
    name: "Fresh login",
  });
  cleanups.push(fresh.close);
  const project = await original.store.createProject(
    original.member!.workspaceId,
    { name: "Keep me", description: "", timezone: "UTC" },
    5,
  );
  await migrateIdentities(original.db, [
    { userId: original.member!.userId, issuer: "new-provider", subject },
  ]);
  const mapped = await original.store.resolveIdentity({
    issuer: "new-provider",
    subject,
    name: "Fresh login",
  });
  expect(mapped.workspaceId).toBe(original.member!.workspaceId);
  expect(
    (await original.store.snapshot(mapped.workspaceId)).projects[0].id,
  ).toBe(project.id);
});
it("rejects mapping an identity from a populated workspace without changing either owner", async () => {
  const original = await fixture();
  cleanups.push(original.close);
  const subject = crypto.randomUUID();
  const other = await fixture({
    issuer: "new-provider",
    subject,
    name: "Other",
  });
  cleanups.push(other.close);
  await other.store.createProject(
    other.member!.workspaceId,
    { name: "Other project", description: "", timezone: "UTC" },
    5,
  );
  await expect(
    migrateIdentities(original.db, [
      { userId: original.member!.userId, issuer: "new-provider", subject },
    ]),
  ).rejects.toThrow(/populated/);
  expect(
    (
      await other.store.resolveIdentity({
        issuer: "new-provider",
        subject,
        name: "Other",
      })
    ).workspaceId,
  ).toBe(other.member!.workspaceId);
});
