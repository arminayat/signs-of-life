# Database operations

## Implemented today

Run commands from repository root. pnpm db:migrate reads DATABASE_URL and invokes migrateDatabase; pnpm auth:migrate /private/path/mapping.json validates explicit identity mappings and clears Better Auth sessions. Scripts do not provision providers.
Job claims use FOR UPDATE SKIP LOCKED, 5-minute leases and token-fenced finish. Dispatch reservations atomically select oldest-due jobs with SKIP LOCKED; publication failures can release them, and stamps expire after 2 minutes. cleanup removes expired challenges/limits; terminal history/receipts/jobs after 30 days; reports/metrics and event identities after 365 days, with event-cursor/import and pending-delivery exceptions. Normalized event monetary details are cleared after 30 days; report query caches expire when their start date falls outside retention. Visible event/delivery feeds remain 30 days.
Database-backed readiness requires the committed migration timestamp in src/schema-version.ts. It does not establish provider readiness. Apply migrations through 0013 before this API/jobs build.

Worker mutations require a Job and check current token, workspace, running status and expiry inside the write transaction. Collection also checks active connection state. Cleanup mutates at most 1,000 rows per table per pass, skips monetary fields already null, and returns whether a backlog remains; callers may schedule further bounded passes. Runtime maintenance failures do not prevent job consumption. jobDiagnostics returns persisted queue counts, oldest due time and oldest source success time; these are operational signals, not provider acceptance proof.

## Planned/aspirational — operating rules

Follow root docs/deployment.md and docs/renaming.md for maintenance. Back up all three private schemas plus all encryption-key versions; preserve AUTH_SECRET for unsubscribe capabilities. Apply migrations before API/jobs upgrades, from the repository root. Do not run schema push against production. Explicitly map identities and increment AUTH_SESSION_VERSION during auth switches.
For verification, use isolated _test databases; the rename test additionally needs permission to create temporary databases. Do not run migrations or integration tests against customer data.

When migration and API/jobs use different PostgreSQL roles, the runtime role also needs read-only access to the migration ledger for readiness. Replace `runtime_role` with the actual runtime role; do not grant schema creation or ledger writes:

```sql
GRANT USAGE ON SCHEMA signs_of_life_migrations TO runtime_role;
GRANT SELECT ON signs_of_life_migrations.__drizzle_migrations TO runtime_role;
```

Missing ledger access returns readiness 503. `tests/database-readiness.test.ts` verifies failure under a temporary restricted role and success after these exact grants; the role and grants are rolled back. This test needs CREATEROLE capability in the isolated local test cluster, in addition to the migration suite's CREATEDB capability.

The maintained production runtime role initially lacks migration-ledger access; include the explicit read-only grants above in the reliability rollout. On hosts without a route to the database's IPv6 endpoint, use the previously discovered IPv4 session pooler with the project-qualified role name and `sslmode=verify-full` plus the saved Supabase CA. This is a release-client connection choice, not a Hyperdrive reconfiguration.
