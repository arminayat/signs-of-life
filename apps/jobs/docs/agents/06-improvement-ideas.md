# Jobs runtime improvement ideas

## Implemented today

| Idea                                                        | Impact                                                                                                                                                                       | Effort       | Area                                             | Status |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------ | ------ |
| Isolate retention cleanup failures from collection/dispatch | A cleanup-specific failure must not stop the Node worker from executing jobs or abort Cloudflare's hourly dispatch                                                           | Small        | node.ts, cloudflare.ts                           | done   |
| Dispatch ordered, bounded batches with a time budget        | The current single unordered 100-job scan caps Cloudflare at 100 dispatches/minute; prioritize oldest due work, use Queue batch sends and drain within a safe runtime budget | Medium       | cloudflare.ts + db dueJobs/dispatch reservations | done   |
| Add application backlog and freshness diagnostics           | Queue acknowledgement is not job success; expose oldest due age, failed/expired claims and source freshness to operator checks                                               | Small–medium | runtime logs + focused db aggregates             | done   |

Runtime regressions cover failed cleanup/publication, multi-batch dispatch, bounded draining and health logs. Database reservation/fence coverage remains owned by db. No deployment or provider acceptance is implied.
