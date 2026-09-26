# Database overview

## Implemented today

Internal PostgreSQL persistence library. database() creates a pg/Drizzle client; migrateDatabase() upgrades private schemas; postgresStore() supplies MonitorStore to backend/API/jobs. Identity resolution creates an application user and one owner workspace; project/source/delivery writes create durable jobs.
Schemas are signs_of_life, signs_of_life_identity and the migration ledger signs_of_life_migrations. Customer source databases are never written by this package.

## Planned/aspirational

No other SQL engine adapter or independent database service is present. Migration 0006 repairs imported-project scheduling; upgrade tests assert every project has a daily job.
