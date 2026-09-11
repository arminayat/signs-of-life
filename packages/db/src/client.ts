import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";
export function database(url: string, max = 5) {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    statement_timeout: 20_000,
  });
  return {
    db: drizzle(pool, { schema: { ...schema, ...authSchema } }),
    close: () => pool.end(),
  };
}
export type Database = ReturnType<typeof database>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;
