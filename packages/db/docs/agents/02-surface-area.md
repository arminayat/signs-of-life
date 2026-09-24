# Database surface area

## Implemented today

Paths are relative to packages/db; these are internal functions, not HTTP routes.

| Source                                                        | Public behavior / inputs                                                                                   | Writes or external effects                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| src/client.ts: database(url,max=5)                            | Returns db and close; 10s connect, 20s idle/statement timeouts                                             | Opens PostgreSQL pool                                                           |
| src/migrations.ts: migrateDatabase(db)                        | Root-relative migrations; legacy ledger rename before Drizzle                                              | Schema/data migration                                                           |
| src/identity-migration.ts: migrateIdentities(db,mappings)     | Explicit userId/issuer/subject mapping; refuses populated conflicting owners                               | Transactional mapping, removal of empty old owner, Better Auth session deletion |
| src/store.ts: postgresStore(db)                               | Implements lifecycle/identity, snapshots, challenge/rate-limit, delivery access; composes stores below     | PostgreSQL only; no provider calls                                              |
| src/store-jobs.ts: jobStore                                   | enqueue, dueJobs, markDispatched, claim, finish, cleanup, receipt                                          | Job/lease/retention mutations                                                   |
| src/store-collection.ts: collectionStore                      | recordAccounts, saveReport, projectMetrics, reportDeliveryKeys, sourceError, updateConnection, refreshLock | Event/cursor/delivery transaction; report/metric transaction                    |
| src/store-delivery.ts: enqueueDelivery, fanout, workspaceLock | Executor can be database or existing transaction                                                           | Delivery+job creation; row locks; verified/enabled routing                      |
| src/store-overview.ts: overviewStore                          | projectOverview(project)                                                                                   | Read-only PostgreSQL aggregates for 30 project-local dates                      |

Root scripts/migrate.ts and scripts/migrate-identities.ts invoke migration functions; this child has no scripts of its own.
