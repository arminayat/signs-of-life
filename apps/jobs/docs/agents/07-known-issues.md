# Jobs runtime known issues

## Implemented today

- **Handled recovery: dispatched job never completes.** Symptom: Queue dispatch/message failure → cause: queue and DB are separate systems → implemented recovery: db dueJobs reconsiders dispatch stamps after 2 minutes and expired leases after 5 minutes → prevention: preserve Cron redispatch and inspect persisted job state.
- **Active diagnostic footgun: acked message with failed job.** Cause: runOne catches application failure and persists/reschedules it → workaround: inspect source/connection errors and job due/status, not just Queue ack → prevention: distinguish application retries from infrastructure retries.
  No separate worker-health HTTP endpoint is present.

- **Batch publication recovery:** the scheduled handler sends up to 100 due IDs together and only marks them dispatched after publication succeeds. Empty scans do not publish. Existing claims/dispatch expiry tolerate duplicate hints after an interrupted send/mark; retain `tests/queue-dispatch.test.ts`. This is transport batching, not multi-job message packing or a change to per-message billing.
