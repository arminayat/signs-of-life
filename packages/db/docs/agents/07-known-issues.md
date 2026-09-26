# Database known issues

## Implemented today

- **Resolved/covered: migration replay after schema rename.** Symptom: previously applied SQL replays → cause: a new empty ledger name → fix: src/migrations.ts moves pm_migrations before Drizzle reads it; rejects simultaneous old/new ledgers → prevention: use migrateDatabase and root branding-migration tests; do not rewrite 0000–0002.
- **Resolved/covered: first-login duplicate owners.** Symptom: parallel logins create orphan users → cause: racing identity insertion → fix: conflict-aware identity insert and winner lookup in store.ts → prevention: retain tests/identity-concurrency.test.ts.
- **Active retention constraint:** stalled sources need old dedup IDs → cause: overlap replay after an outage → implemented workaround: cleanup deletes >365-day event identities only when cursor is >5 minutes beyond occurrence, and retains nonterminal deliveries → prevention: do not replace cleanup with an unconditional age delete.

## Implemented today — monitoring safeguards

- **Resolved/covered:** imported projects lacked daily jobs → migration 0004 bypassed createProject → additive migration 0006 inserts missing daily jobs idempotently → upgrade tests check the invariant.
- **Resolved/covered:** empty webhook checkpoint crashed Drizzle update → empty SET is invalid → only update checkpoint for a nonempty patch → repeated webhook tests cover it.
- **Resolved/covered:** expired worker could replace a newer cursor → finish was fenced but page commit was not → page transaction locks/checks current job lease before writes → stale-lease tests.
- **Testing footgun:** pnpm exec vitest omits .env → default test DB role may not exist → use pnpm test [files], which loads TEST_DATABASE_URL; never change database roles to mask the command error.

- **Resolved/covered:** production and sandbox shared the same source uniqueness key → migration 0008 includes environment and carries forward monitor state; credential catalogs retain environment → keep sandbox separation tests.
- **Resolved/covered:** range-query cache expiry could discard collected history still within retention → migration 0009 stores independent dated series; provider failure shows retained values as partial with no fabricated period total → keep retained-series test.

- **Resolved/covered:** a muted first observation suppressed an enabled verified match → fanout depended on initial insertion → migration 0010 and an atomic canonical notification claim let the first eligible source notify once → keep muted-first-source regression coverage.
- **Resolved/covered:** a delayed collector could mark a disconnected connection connected or restore its secret → generic connection updates lacked an active guard → updates and refresh lease acquisition require an active connection → disconnect-race tests cover stale writes.

- **Operational workaround verified:** this release host cannot route to the production database’s IPv6 endpoint → use the project’s discovered IPv4 session-pooler endpoint with `sslmode=verify-full` and its saved Supabase CA → verify identity/schema before migration; never disable certificate validation or guess a pooler hostname.
