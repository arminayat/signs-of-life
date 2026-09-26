# Collection and delivery flows

## Implemented today

Source: src/collectors.ts, runner.ts, services.ts and db stores.

| Flow                | Trigger / progression                                                                                                                                                                 | Retry / partial-failure behavior                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase accounts   | Source creation enqueues job; starts at source baseline; five-minute overlap unless catchup; 500/page, <=20 pages and 150s loop deadline; record events+cursor+fanout transactionally | Complete read schedules +60s; exhausted page/deadline budget +1s; anonymous IDs retained without fanout; late/deleted-between-polls accounts can be missed |
| Token refresh       | Access token expires within 60s; acquire 60s DB refresh lease, re-read current token, exchange and encrypt                                                                            | Contention returns token_refresh_in_progress; release in finally                                                                                           |
| Apple collection    | One job per connection; reads previous seven UTC report dates; saves each date separately; repeat +1h                                                                                 | 404 stays pending; available absent app writes zero; changed totals increment revision; partial completed dates remain durable                             |
| Daily notifications | Project creation inserts job; checks each minute; waits for local dailyTime and enabled project                                                                                       | Newest missing date can fan out pending; late/corrected announced dates get revised keys; unannounced older history imports silently                       |
| Delivery            | Claim persisted delivery job; recheck destination verification/enabled, project enabled, destination link and active source                                                           | Cancel invalid routing; interrupted non-idempotent send uncertain; Resend same-key retry <=23h from first send, at most eight provider attempts            |

runOne claims through store, catches failures to stable codes, persists source/connection error, and reschedules recurring errors with bounded exponential backoff (up to one hour). A disconnected/missing connection terminates that job. Infrastructure Queue retries differ from application retries; normal runOne error handling returns after persisting failure.
No separate DAG engine, workflow orchestrator, raw-report archive or exactly-once external transaction exists.

## Implemented today — monitoring flow

Credential/OAuth catalog probe → create source/state plus independent import/live jobs → lease-fenced page commits with fixed notification baseline → selected reports queued hourly → provider-native results/retained daily points → configurable Overview. Auth targets 60 seconds, billing reconciliation 5 minutes, aggregate sources 1 hour; queue/rate limits may delay. Billing webhook authenticity precedes durable normalized inbox + processing job. Historical pages are silent. Native unique-user totals use period provider calls; daily summaries use visible views and preserve Apple correction handling. Per-connection budgets and Retry-After defer requests, and separate history/live errors describe partial failures.
