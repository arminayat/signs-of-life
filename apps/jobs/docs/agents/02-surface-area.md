# Jobs runtime surface area

## Implemented today

| Source / entry              | Inputs and behavior                                       | Mutations / external calls                                                                                                 |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| src/node.ts loop            | nodeServices + runOne; idle waits 1s; loop error waits 5s | Claims/executes DB jobs before maintenance; cleanup hourly or after 1 minute while pending/failed; closes on signal exit   |
| src/cloudflare.ts scheduled | scheduledTime and JobBindings                             | Reserves/publishes oldest-due batches first, then bounded hourly cleanup; emits persisted backlog/freshness; closes DB     |
| src/dispatch.ts             | MonitorStore and Queue sendBatch                          | Up to 10 batches of 100 or 45 seconds; releases reservations on publication failure                                        |
| src/maintenance.ts          | MonitorStore                                              | Isolated cleanup, bounded hourly backlog drain, stable worker_health and maintenance-failure logs                          |
| src/cloudflare.ts queue     | Queue batch                                               | Invalid body without string id is acked; valid ID calls runOne then ack; uncaught exception retries after 30s; closes pool |
| wrangler.jsonc              | Every-minute Cron, JOBS producer/consumer                 | Batch size 3, batch timeout 5s, 3 queue retries, dead-letter queue                                                         |

Provider requests, delivery writes and collector schedules occur through packages/backend/src/runner.ts and collectors.ts. This app has no fetch handler.
