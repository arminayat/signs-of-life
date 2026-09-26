import { expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { anonymous } from "better-auth/plugins";
import { signsOfLife } from "../packages/better-auth-connector/src";
const token = "dedicated-fixture-connector-token-32-characters",
  nextToken = "rotated-fixture-connector-token-32-characters";
it("Better Auth 1.7.4 respects model/field mappings, paginates tied timestamps, and exposes only allowed fields", async () => {
  const members = Array.from({ length: 405 }, (_, i) => ({
    id: `user_${String(i).padStart(4, "0")}`,
    joined_at: new Date("2026-01-01T00:00:00Z"),
    email_address: `private-${i}@example.test`,
    display_name: "Private Name",
    emailVerified: false,
    updatedAt: new Date(),
    isAnonymous: i === 0,
  }));
  const original = JSON.stringify(members);
  const auth = betterAuth({
    baseURL: "https://example.test",
    secret: "fixture-auth-secret-at-least-32-characters",
    database: memoryAdapter({ members }),
    user: {
      modelName: "members",
      fields: {
        createdAt: "joined_at",
        email: "email_address",
        name: "display_name",
      },
    },
    plugins: [
      anonymous(),
      signsOfLife({ tokens: [token, nextToken], name: "Example app" }),
    ],
  });
  let after: string | null = null;
  const ids: string[] = [];
  for (let page = 0; page < 5; page++) {
    const url = new URL(
      "https://example.test/api/auth/signs-of-life/v1/users?from=2025-12-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z&limit=200",
    );
    if (after) url.searchParams.set("after", after);
    const response = await auth.handler(
      new Request(url, {
        headers: { authorization: `Bearer ${page % 2 ? nextToken : token}` },
      }),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      users: { id: string; anonymous: boolean }[];
      next: string | null;
    };
    expect(JSON.stringify(result)).not.toMatch(
      /private-|Private Name|email_address|display_name/,
    );
    if (!page) expect(result.users[0].anonymous).toBe(true);
    ids.push(...result.users.map((u) => u.id));
    after = result.next;
    if (!after) break;
  }
  expect(new Set(ids).size).toBe(405);
  expect(ids).toHaveLength(405);
  expect(after).toBe(null);
  expect(JSON.stringify(members)).toBe(original);
  const denied = await auth.handler(
    new Request("https://example.test/api/auth/signs-of-life/v1/users"),
  );
  expect(denied.status).toBe(401);
});
it("requires dedicated tokens and adds no schema, hooks or writes", () => {
  expect(() => signsOfLife({ tokens: ["short"] })).toThrow();
  const plugin = signsOfLife({ tokens: [token] });
  expect(plugin.schema).toBeUndefined();
  expect(plugin.hooks).toBeUndefined();
});
