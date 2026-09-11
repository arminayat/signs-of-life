import { migrate } from "drizzle-orm/node-postgres/migrator";
import { database } from "../packages/db/src/client";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { db, close } = database(process.env.DATABASE_URL);
try {
  await migrate(db, {
    migrationsFolder: "./packages/db/migrations",
    migrationsSchema: "pm_migrations",
  });
  console.log("Migrations applied.");
} finally {
  await close();
}
