# Database folder structure

## Implemented today

- src/schema.ts: application schema; src/auth-schema.ts: Better Auth schema; src/schema-monitoring.ts: normalized monitoring tables.
- src/client.ts: connection lifecycle and executor types.
- src/store.ts and src/store-*.ts: persistence implementation by responsibility; store-sources.ts owns source creation/removal, and store-monitoring-series.ts owns independent daily aggregate retention.
- src/migrations.ts and src/identity-migration.ts: upgrade functions.
- migrations/: eleven SQL migrations 0000–0010; meta/ journal and schema snapshots.
- AGENTS.md and docs/agents/: local memory.
  Seeds, customer-database migrations, local tests/ and generated client folders are not present. Root scripts/ wraps migration operations; root tests/ owns verification.

## Planned/aspirational — placement rules

Add schema changes with a new reviewed migration and matching snapshots. Put tests in the root suite. Add a new top-level folder only when its responsibility cannot fit the existing map.
