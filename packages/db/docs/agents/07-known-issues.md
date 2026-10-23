# Database known issues

## Implemented today

- **Resolved/covered: migration replay after schema rename.** Symptom: previously applied SQL replays → cause: a new empty ledger name → fix: src/migrations.ts moves pm_migrations before Drizzle reads it; rejects simultaneous old/new ledgers → prevention: use migrateDatabase and root branding-migration tests; do not rewrite 0000–0002.
- **Resolved/covered: first-login duplicate owners.** Symptom: parallel logins create orphan users → cause: racing identity insertion → fix: conflict-aware identity insert and winner lookup in store.ts → prevention: retain tests/identity-concurrency.test.ts.
- **Active retention constraint:** stalled sources need old dedup IDs → cause: overlap replay after an outage → implemented workaround: cleanup deletes >365-day event identities only when cursor is >5 minutes beyond occurrence, and retains nonterminal deliveries → prevention: do not replace cleanup with an unconditional age delete.

## Implemented today — monitoring safeguards

- **Resolved/covered:** imported projects lacked daily jobs → migration 0004 bypassed createProject → additive migration 0006 inserts missing daily jobs idempotently → upgrade tests check the invariant.
- **Resolved/covered:** empty webhook checkpoint crashed Drizzle update → empty SET is invalid → only update checkpoint for a nonempty patch → repeated webhook tests cover it.
- **Resolved/covered:** expired workers could replace newer state because only completion was fenced → required claim checks now guard legacy/expanded collection, metric results/errors, health, delivery outcomes, daily fanout, inbox completion and provider delays in their write transactions → retain monitoring-security and database-reliability tests.
- **Testing footgun:** pnpm exec vitest omits .env → default test DB role may not exist → use pnpm test [files], which loads TEST_DATABASE_URL; never change database roles to mask the command error.

- **Resolved/covered:** production and sandbox shared the same source uniqueness key → migration 0008 includes environment and carries forward monitor state; credential catalogs retain environment → keep sandbox separation tests.
- **Resolved/covered:** range-query cache expiry could discard collected history still within retention → migration 0009 stores independent dated series; provider failure shows retained values as partial with no fabricated period total → keep retained-series test.

- **Resolved/covered:** a muted first observation suppressed an enabled verified match → fanout depended on initial insertion → migration 0010 and an atomic canonical notification claim let the first eligible source notify once → keep muted-first-source regression coverage.
- **Resolved/covered:** a delayed collector could mark a disconnected connection connected or restore its secret → generic connection updates lacked an active guard → updates and refresh lease acquisition require an active connection → disconnect-race tests cover stale writes.

- **Operational workaround verified:** this release host cannot route to the production database’s IPv6 endpoint → use the project’s discovered IPv4 session-pooler endpoint with `sslmode=verify-full` and its saved Supabase CA → verify identity/schema before migration; never disable certificate validation or guess a pooler hostname.

- **Resolved/covered:** new webhook channels must not expose URLs or confirmation codes through dashboard snapshots → encrypted destination secret is omitted and all verification notifications are redacted → webhook-destination lifecycle tests cover stored encryption, snapshot secrecy and bound confirmation. Apply migration 0011 before new code.

- **Resolved/covered:** a recovered invoice could be silently imported with a pre-connection creation timestamp before its webhook arrived → explicit authenticated payment-time authority lets the webhook correct the same canonical event and claim one eligible notification. Unmarked polling cannot revert the date or replay it; new-source-lifecycle.test.ts covers import-before-webhook and success/recovery duplicates.

## Implemented today — review safeguards

- **Resolved/covered: legacy collection and disconnect races.** Account/report transactions check the current claim and active connection; source rows are locked before account cursor writes. Stale success/error and disconnected-response tests verify that newer progress survives and late observations are not inserted.
- **Resolved/covered: divergent metric freshness.** Cache writes and retained-series upserts reject older `fetchedAt` results, and required job claims reject stale error writes. Regression coverage keeps the cache and retained daily value consistent.
- **Resolved/covered: repeated retention writes and unindexed provenance cascades.** Each cleanup pass bounds mutations to 1,000 rows per table, skips null monetary fields, and reports a backlog. Migration 0012 indexes `monitor_observations.event_id`; tests retain stalled identities, drain batches and confirm that an already-pruned row's tuple does not change. Jobs runtimes own maintenance scheduling and failure isolation.
- **Resolved/covered: account-range scans.** Migration 0013 adds a partial `(source_id, occurred_at)` index for nonanonymous accounts; overview uses timestamp bounds including the next local midnight. A representative local query plan justifies this index; no hosted latency claim is made.
- **Resolved/covered: readiness accepted an outdated schema.** `health` now requires the migration timestamp in `schema-version.ts`; missing/unavailable schema returns an application 503. A regression ties that constant to the latest journal entry and tests the missing-migration state inside a rolled-back transaction.
- **Credential freshness boundary:** generic `updateConnection` remains a configuration mutation; worker health has a separate fenced method. Supabase and expanded-monitor refresh callers use ciphertext/lease comparison through `replaceMonitorSecret` and `releaseMonitorRefresh`. Backend owns refresh/reconnect regression coverage.
