import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/db/src/schema.ts", "./packages/db/src/auth-schema.ts"],
  out: "./packages/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/product_monitor",
  },
  strict: true,
});
