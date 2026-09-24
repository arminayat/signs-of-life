# Job runtime pipeline

## Implemented today

Cloudflare: every-minute scheduled event → optional hourly cleanup → dueJobs(100) → send {id} → markDispatched → Queue → runOne(id) → claim/execute/finish → ack.
Node: hourly cleanup → runOne() → claim next due job; 1s idle sleep or 5s loop-error sleep.
runOne owns four payloads: supabase.collect, apple.collect, daily, deliver. Application failures persist retry/error state; uncaught infrastructure failures trigger Queue retry. PostgreSQL uniqueness, lease tokens and expired dispatch stamps tolerate duplicate/abandoned messages.
Detailed source lineage, intervals, catch-up limits, partial report handling and send windows are in [backend pipeline flows](../../../../packages/backend/docs/agents/pipeline-flows.md); do not duplicate schedules here.
