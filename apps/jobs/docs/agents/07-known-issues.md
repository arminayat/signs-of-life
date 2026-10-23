# Jobs runtime known issues

## Implemented today

- **Handled recovery: dispatched job never completes.** Symptom: Queue dispatch/message failure → cause: queue and DB are separate systems → implemented recovery: db dueJobs reconsiders dispatch stamps after 2 minutes and expired leases after 5 minutes → prevention: preserve Cron redispatch and inspect persisted job state.
- **Active diagnostic footgun: acked message with failed job.** Cause: runOne catches application failure and persists/reschedules it → workaround: inspect source/connection errors and job due/status, not just Queue ack → prevention: distinguish application retries from infrastructure retries.
  No separate worker-health HTTP endpoint is present.
- **Resolved/covered: cleanup failure gates useful work.** Both hosts execute/dispatch jobs before maintenance and catch cleanup errors separately. Node retries pending/failed cleanup after one minute; Cloudflare preserves hourly cleanup and drains bounded batches after dispatch. Runtime tests cover failure isolation and finite backlog draining.
- **Resolved/covered: single-batch dispatch ceiling.** Cloudflare reserves oldest-due work before Queue publication and drains up to ten batches of 100 or 45 seconds. Publication failure releases reservations; abandonment uses their normal expiry. Runtime tests cover 250 jobs, failure recovery and the maximum batch count. The remaining finite capacity is intentional; monitor oldestDueAt and pending counts rather than assuming real-time processing.

- Scheduled-handler regressions retain empty-scan, batched-publication and failure/connection-close coverage in `tests/queue-dispatch.test.ts`. Batching preserves distinct messages and does not change per-message billing.
