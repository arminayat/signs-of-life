import pg from "pg";

export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL) {
  const fallback =
    "postgres://signs_of_life:signs_of_life@127.0.0.1:5432/signs_of_life_test";
  let url: URL;
  try {
    url = new URL(value || fallback);
  } catch {
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL URL for an isolated local database ending in _test.",
    );
  }
  if (
    url.search ||
    url.hash ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_-]+_test$/.test(url.pathname)
  ) {
    throw new Error(
      "Tests require a loopback PostgreSQL database whose name ends in _test, without URL query parameters or fragments.",
    );
  }
  return url.toString();
}

export async function checkTestDatabase(value?: string) {
  const connectionString = testDatabaseUrl(value);
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query("select 1");
  } catch {
    throw new Error(
      "The isolated test database is unavailable. Start it and set TEST_DATABASE_URL, or run pnpm check:isolated with PostgreSQL tools installed. Installation credentials were not changed.",
    );
  } finally {
    await client.end();
  }
}
