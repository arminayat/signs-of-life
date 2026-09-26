# Database operations

## Implemented today

Run commands from repository root. pnpm db:migrate reads DATABASE_URL and invokes migrateDatabase; pnpm auth:migrate /private/path/mapping.json validates explicit identity mappings and clears Better Auth sessions. Scripts do not provision providers.
Job claims use FOR UPDATE SKIP LOCKED, 5-minute leases and token-fenced finish. Due dispatch stamps expire after 2 minutes. cleanup removes expired challenges/limits; terminal history/receipts/jobs after 30 days; reports/metrics and event identities after 365 days, with event-cursor/import and pending-delivery exceptions. Normalized event monetary details are cleared after 30 days; report query caches expire when their start date falls outside retention. Visible event/delivery feeds remain 30 days.
Database-backed readiness is SELECT 1, not a migration-version or provider check.

## Planned/aspirational — operating rules

Follow root docs/deployment.md and docs/renaming.md for maintenance. Back up all three private schemas plus all encryption-key versions; preserve AUTH_SECRET for unsubscribe capabilities. Apply migrations before API/jobs upgrades, from the repository root. Do not run schema push against production. Explicitly map identities and increment AUTH_SESSION_VERSION during auth switches.
For verification, use isolated _test databases; the rename test additionally needs permission to create temporary databases. Do not run migrations or integration tests against customer data.
