# Jobs runtime surface area

## Implemented today

| Source / entry              | Inputs and behavior                                       | Mutations / external calls                                                                                                 |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| src/node.ts loop            | nodeServices + runOne; idle waits 1s; loop error waits 5s | Claims/executes DB jobs; runs cleanup initially and hourly; logs stable failure event; closes on signal exit               |
| src/cloudflare.ts scheduled | scheduledTime and JobBindings                             | Cleanup at UTC minute 0; reads <=100 due IDs, JOBS.send({id}) then markDispatched; closes DB in finally                    |
| src/cloudflare.ts queue     | Queue batch                                               | Invalid body without string id is acked; valid ID calls runOne then ack; uncaught exception retries after 30s; closes pool |
| wrangler.jsonc              | Every-minute Cron, JOBS producer/consumer                 | Batch size 3, batch timeout 5s, 3 queue retries, dead-letter queue                                                         |

Provider requests, delivery writes and collector schedules occur through packages/backend/src/runner.ts and collectors.ts. This app has no fetch handler.
