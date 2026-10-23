# Job runtime pipeline

## Implemented today

Cloudflare: every-minute scheduled event → reserve oldest-due batches atomically → sendBatch → optional bounded hourly cleanup → persisted health log. Queue consumption → runOne(id) → claim/execute/finish → ack. Dispatch is capped at ten 100-job batches or 45 seconds. Failed publication releases the reservation; abandoned reservations still expire in PostgreSQL.
Node: runOne() claims the next due job → optional isolated maintenance → 1s idle sleep or 5s loop-error sleep. Cleanup runs initially and hourly when caught up, or after one minute while pending/failed. Cloudflare cleanup runs only at UTC minute zero and drains at most ten bounded batches or 45 seconds after dispatch.
runOne owns seven payloads: supabase.collect, apple.collect, daily, deliver, monitor.collect, monitor.metric and monitor.webhook. Application failures persist retry/error state; uncaught infrastructure failures trigger Queue retry. PostgreSQL uniqueness, required write fences and expired dispatch reservations tolerate duplicate/abandoned messages.
Detailed source lineage, intervals, catch-up limits, partial report handling and send windows are in [backend pipeline flows](../../../../packages/backend/docs/agents/pipeline-flows.md); do not duplicate schedules here.
