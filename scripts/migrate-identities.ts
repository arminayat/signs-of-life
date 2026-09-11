import { readFile } from "node:fs/promises";
import { z } from "zod";
import { database } from "../packages/db/src/client";
import { migrateIdentities } from "../packages/db/src/identity-migration";
const file = process.argv[2];
if (!file || !process.env.DATABASE_URL)
  throw new Error(
    "Usage: pnpm auth:migrate mapping.json. DATABASE_URL is required.",
  );
const mappings = z
  .array(
    z.object({
      userId: z.uuid(),
      issuer: z.string().min(1),
      subject: z.string().min(1),
    }),
  )
  .min(1)
  .parse(JSON.parse(await readFile(file, "utf8")));
const { db, close } = database(process.env.DATABASE_URL);
try {
  await migrateIdentities(db, mappings);
  console.log(
    `Mapped ${mappings.length} identities and invalidated Better Auth sessions. Increment AUTH_SESSION_VERSION on API and job hosts before enabling the new auth provider.`,
  );
} finally {
  await close();
}
