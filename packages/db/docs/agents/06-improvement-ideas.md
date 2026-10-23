# Database improvement ideas

## Implemented today

The prioritized database review items are implemented: required job fencing for worker writes; active-connection checks; monotonic metric cache/retained-series freshness; bulk account fanout; bounded retention that skips already-pruned monetary fields; atomic oldest-due dispatch reservation; focused delivery/configuration reads; migration-aware readiness; provenance and account-range indexes in migrations 0012–0013. The earlier imported-project daily-job backfill remains in migration 0006.

`tests/database-reliability.test.ts` covers the new persistence invariants; `tests/database-concurrency.test.ts` covers reversed aliases, concurrent health writes and project deletion, and existing identity/migration/overview/collection suites remain relevant. A local 50,000-event fixture reduced a seven-day account query from a sequential scan over 50,000 rows/770 shared blocks to an indexed scan using 24 blocks; measured local times were 6.45 ms and 0.147 ms. These are illustrative fixture measurements, not production latency guarantees.

## Planned/aspirational

No additional local proposal is prioritized. For future changes retain measured query plans, preserve applied migrations and keep retention batching compatible with stalled-cursor and pending-delivery exceptions. Runtime scheduling/maintenance recovery belongs to `apps/jobs`.
