import { expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { signsOfLife } from "../packages/better-auth-connector/src";

const token = "dedicated-fake-connector-token-more-than-32";
function fixture(createdAt: string) {
  const users = ["a", "b"].map((id) => ({
    id,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    name: "Fixture",
    email: `${id}@example.test`,
    emailVerified: false,
  }));
  const auth = betterAuth({
    baseURL: "https://example.test",
    secret: "fixture-auth-secret-at-least-32-characters",
    database: memoryAdapter({ user: users }),
    plugins: [signsOfLife({ tokens: [token] })],
  });
  return (from: string, until: string, after?: string) => {
    const url = new URL("https://example.test/api/auth/signs-of-life/v1/users");
    for (const [key, value] of Object.entries({
      from,
      until,
      limit: "1",
      ...(after ? { after } : {}),
    }))
      url.searchParams.set(key, value);
    return auth.handler(
      new Request(url, { headers: { authorization: `Bearer ${token}` } }),
    );
  };
}

it.each([
  ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "2026-01-01T00:00:00.000Z"],
  [
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.100Z",
    "2026-01-01T00:00:00.000Z",
  ],
  [
    "2026-01-01T00:00:00.1Z",
    "2026-01-01T00:00:00.9Z",
    "2026-01-01T00:00:00.100Z",
  ],
])(
  "paginates equivalent ISO boundaries from %s to %s",
  async (from, until, createdAt) => {
    const read = fixture(createdAt);
    const first = await read(from, until);
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      users: { id: string }[];
      next: string;
    };
    expect(body.users.map((user) => user.id)).toEqual(["a"]);
    const second = await read(
      new Date(from).toISOString(),
      new Date(until).toISOString(),
      body.next,
    );
    expect(second.status).toBe(200);
    const next = (await second.json()) as {
      users: { id: string }[];
      next: string;
    };
    expect(next.users.map((user) => user.id)).toEqual(["b"]);
    const last = await read(from, until, next.next);
    expect(last.status).toBe(200);
    expect(await last.json()).toMatchObject({ users: [], next: null });
  },
);

it("keeps cursor binding and invalid-range checks after canonicalizing dates", async () => {
  const read = fixture("2026-01-01T00:00:00Z");
  const from = "2026-01-01T00:00:00Z",
    until = "2026-01-02T00:00:00Z";
  const first = (await (await read(from, until)).json()) as { next: string };
  expect((await read("2025-12-31T00:00:00Z", until, first.next)).status).toBe(
    400,
  );
  expect((await read(from, "2026-01-03T00:00:00Z", first.next)).status).toBe(
    400,
  );
  expect((await read(from, "2026-01-01T00:00:00.000Z")).status).toBe(400);
  expect((await read(until, from)).status).toBe(400);
  expect((await read("invalid", until)).status).toBe(400);
});
