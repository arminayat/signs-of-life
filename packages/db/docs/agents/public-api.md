# Database internal API

## Implemented today

No package export map, standalone CLI or published SDK exists. Consumers import src/client, src/store, src/migrations or src/identity-migration directly.
database(url,max?) returns {db,close}; postgresStore(db) returns MonitorStore; migrateDatabase(db) returns a completion promise; migrateIdentities(db,mappings) requires explicit {userId,issuer,subject} records.
jobStore/collectionStore/overviewStore are composition helpers. enqueueDelivery/fanout/workspaceLock take Executor so a caller can preserve its transaction.
No runtime validation is performed on every store argument. Backend Zod parsing and ownership checks are required at untrusted boundaries; internal direct calls must already have trusted inputs.

Worker persistence methods require a claimed Job: collection pages/reports, metrics, health, delivery outcomes, daily fanout, inbox completion and provider delays are guarded through commit. Use `updateConnectionHealth` for workers; `updateConnection` is a trusted configuration mutation. `monitoringState` omits metric-cache results; `deliveryEligibility` avoids a workspace snapshot. `reserveDueJobs` atomically reserves oldest due IDs, `releaseDispatch` allows retry after publication failure, `jobDiagnostics` returns persisted operational signals, and `cleanup` returns a boolean indicating remaining bounded work.
