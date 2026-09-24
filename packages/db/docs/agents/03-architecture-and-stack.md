# Database architecture and stack

## Implemented today

Drizzle ORM 0.45.2, drizzle-kit 0.31.10 and pg 8.23.0 are root-pinned. Compose/CI use PostgreSQL 17; docs/status.md records older local PostgreSQL 18 verification, not a fresh run here.
Core owns MonitorStore and records; db owns SQL, schema and transactions. No provider SDKs or runtime bindings are imported.
DATABASE_URL enters through composition or root migration scripts. Tests use TEST_DATABASE_URL ending in _test, defaulted in tests/helpers.ts. The rename suite creates/drops temporary databases and needs CREATEDB privileges.
Root drizzle.config.ts reads both schemas and generates migrations/meta. pnpm db:generate generates SQL; pnpm db:migrate applies it from the repository root. Root Vitest runs database suites serially; no child-specific CI/deploy exists.
