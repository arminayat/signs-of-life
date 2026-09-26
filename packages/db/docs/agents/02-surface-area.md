# Database surface area

## Implemented today

Paths are relative to packages/db; these are internal functions, not HTTP routes.

| Source                                                        | Public behavior / inputs                                                                                   | Writes or external effects                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| src/client.ts: database(url,max=5)                            | Returns db and close; 10s connect, 20s idle/statement timeouts                                             | Opens PostgreSQL pool                                                                          |
| src/migrations.ts: migrateDatabase(db)                        | Root-relative migrations; legacy ledger rename before Drizzle                                              | Schema/data migration                                                                          |
| src/identity-migration.ts: migrateIdentities(db,mappings)     | Explicit userId/issuer/subject mapping; refuses populated conflicting owners                               | Transactional mapping, removal of empty old owner, Better Auth session deletion                |
| src/store.ts: postgresStore(db)                               | Implements lifecycle/identity, snapshots, challenge/rate-limit, delivery access; composes stores below     | PostgreSQL only; no provider calls                                                             |
| src/store-jobs.ts: jobStore                                   | enqueue, dueJobs, markDispatched, claim, finish, cleanup, receipt                                          | Job/lease/retention mutations                                                                  |
| src/store-collection.ts: collectionStore                      | recordAccounts, saveReport, projectMetrics, reportDeliveryKeys, sourceError, updateConnection, refreshLock | Event/cursor/delivery transaction; report/metric transaction                                   |
| src/store-delivery.ts: enqueueDelivery, fanout, workspaceLock | Executor can be database or existing transaction                                                           | Delivery+job creation; row locks; verified/enabled routing                                     |
| src/store-overview.ts: overviewStore                          | projectOverview(project,range?)                                                                            | Read-only PostgreSQL aggregates for requested project-local dates (30 by default, at most 365) |

Root scripts/migrate.ts and scripts/migrate-identities.ts invoke migration functions; this child has no scripts of its own.

## Implemented today — expanded monitoring

store-monitoring.ts owns independent state, atomic observation/provenance/fanout/checkpoint writes, selected dashboards and metric read models. store-monitoring-lifecycle.ts owns reconnect, provider budgets, normalized webhook inbox/jobs and encrypted-secret compare-and-set. All are composed into postgresStore; no provider HTTP in db.

## Implemented today — retained reports

store-monitoring-series.ts persists provider daily points independently of range-query cache, upserts by source/metric/filters/date/series and retains reporting metadata/freshness. retainedSeries returns partial historical points on provider failure, never a fabricated period summary. Cleanup expires dated points after 365 days. Monetary observation details are pruned at 30 days while dedup identities remain through import/replay windows.
