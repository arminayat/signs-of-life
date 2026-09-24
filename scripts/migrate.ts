import { migrateDatabase } from "../packages/db/src/migrations";
import { database } from "../packages/db/src/client";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { db, close } = database(process.env.DATABASE_URL);
try {
  await migrateDatabase(db);
  console.log("Migrations applied.");
} finally {
  await close();
}
