// Generates an ephemeral installation configuration for the container smoke test.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const lines = [
  "DATABASE_URL=postgres://monitor:monitor@db:5432/monitor",
  "PUBLIC_URL=http://localhost:8080",
  `AUTH_SECRET=${randomBytes(32).toString("hex")}`,
  `ENCRYPTION_KEYS='${JSON.stringify({ v1: randomBytes(32).toString("base64") })}'`,
  "AUTH_PROVIDER=better-auth",
  "EMAIL_PROVIDER=disabled",
];
writeFileSync(".env", lines.join("\n") + "\n", { mode: 0o600 });
