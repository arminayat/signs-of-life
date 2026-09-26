import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./packages/db/src/schema.ts",
    "./packages/db/src/auth-schema.ts",
    "./packages/db/src/schema-monitoring.ts",
  ],
  out: "./packages/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/signs_of_life",
  },
  strict: true,
});
