# Database known issues

## Implemented today

- **Open, code-confirmed; runtime reproduction not run: imported projects lack daily jobs.** Symptom: a project created for an unattached connection by migration 0004 has no daily notification job → cause: migrations/0004_free_lucky_pierre.sql inserts projects directly, whereas src/store.ts:createProject also inserts daily:<projectId>; createSource inserts only collector jobs → fix/workaround: none implemented or verified → prevention: add a corrective backfill and regression test (06). Existing migration tests assert ownership/preservation, not daily job creation.
- **Resolved/covered: migration replay after schema rename.** Symptom: previously applied SQL replays → cause: a new empty ledger name → fix: src/migrations.ts moves pm_migrations before Drizzle reads it; rejects simultaneous old/new ledgers → prevention: use migrateDatabase and root branding-migration tests; do not rewrite 0000–0002.
- **Resolved/covered: first-login duplicate owners.** Symptom: parallel logins create orphan users → cause: racing identity insertion → fix: conflict-aware identity insert and winner lookup in store.ts → prevention: retain tests/identity-concurrency.test.ts.
- **Active retention constraint:** stalled sources need old dedup IDs → cause: overlap replay after an outage → implemented workaround: cleanup deletes >30-day events only when cursor is >5 minutes beyond occurrence, and retains nonterminal deliveries → prevention: do not replace cleanup with an unconditional age delete.
