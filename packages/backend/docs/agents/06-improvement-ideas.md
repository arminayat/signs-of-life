# Backend improvement ideas

## Implemented today — completed items

| Idea                                                               | Impact                                                                                               | Effort | Area                                                  | Status |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- | ------ |
| Reactivate terminated Apple collector jobs on credential reconnect | Restoring an existing connection should resume its sources without needing another source attachment | Small  | routes-integrations.ts + Apple lifecycle test; see 07 | done   |
| Make Supabase availability require both OAuth credentials          | Avoid offering Connect when only client ID is configured                                             | Small  | api.ts / config.ts + API test; see 07                 | done   |

Migration-created project scheduling is owned by db. Authentication now lives in core, with adapter-owned minimal configuration.

## Implemented today — audit improvements

| Idea                                                                      | Impact                                                                                                                                                                       | Effort | Area                                                          | Status |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- | ------ |
| Revisit pending native-report dates after their reporting day             | Google Play reports arrive 3–7 days late, while daily summaries only query yesterday; deliver eligible delayed dates once, retaining silent pre-connection history           | Medium | monitoring-summary.ts; reporting-date/delivery state in db    | done   |
| Apply the existing credential compare-and-set to Supabase refresh         | Prevent an in-flight old refresh from overwriting a newly reconnected grant or clearing a replacement lease                                                                  | Small  | services.ts; reuse replaceMonitorSecret/releaseMonitorRefresh | done   |
| Fence all collector results and health writes                             | Prevent stale Supabase/Apple workers, metric jobs and provider-error paths from overwriting newer progress/results; account for metric calls exceeding the five-minute claim | Medium | collectors.ts, monitoring-jobs.ts, runner.ts + db stores      | done   |
| Preserve earlier ambiguous delivery outcomes on permanent retry rejection | A later Resend 4xx must not turn a previously uncertain send into definitive failure                                                                                         | Small  | runner.ts; extend delivery-retry tests                        | done   |
| Include credential retrieval in optional match failure handling           | Expired/revoked Stripe credentials currently block otherwise valid RevenueCat webhook observations before the existing recoverable-error catch                               | Small  | monitoring-matches.ts                                         | done   |
| Log route templates instead of capability-bearing paths                   | A database failure during unsubscribe currently logs its reusable token in api_error.path                                                                                    | Small  | api.ts error logging                                          | done   |
| Define project-local calendar bounds consistently with the dashboard      | UTC validation rejects a valid current project-local date when the project is already in the next day; coordinate API range validation with the web range builder            | Small  | api.ts overview endpoint + web monitor-overview.tsx           | done   |
| Read routing eligibility directly for each delivery                       | Avoid loading the full workspace snapshot, including unrelated events/metrics/deliveries, just to check one project's route/source                                           | Small  | runner.ts; focused db read                                    | done   |

Implemented in source. Backend/runtime regression suites cover delayed dates, reconnect races, stale-error rejection, ambiguous-send transitions and capability redaction; DB owns transactional fence and eligibility coverage. These checks do not establish deployment or live provider acceptance.
