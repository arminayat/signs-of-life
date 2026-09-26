# Backend surface area

## Implemented today

All HTTP paths begin /api. See api-contracts.md for every handler, payload and auth distinction.

| Source                                                         | Public surface                                                                                         | Effects                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| src/api.ts: createApi                                          | Hono factory, config/health/readiness/session/dashboard/project/workspace endpoints; validation/errors | Auth identity resolution, PostgreSQL lifecycle writes; composes route groups |
| src/routes-integrations.ts: integrationRoutes                  | Provider OAuth/credentials, catalogs, disconnect, source create/delete                                 | Provider calls; encrypted connection/challenge writes; jobs                  |
| src/routes-destinations.ts: destinationRoutes                  | Create, verify, rename, pause, delete and test destination                                             | Challenges, routing data, verification/test delivery jobs                    |
| src/routes-public.ts: publicRoutes                             | Email confirmation, unsubscribe and provider webhooks                                                  | Single-use capabilities; destination enable/disable; receipts                |
| src/config.ts: configuration                                   | Runtime-aware env validation → Config                                                                  | Throws on missing/unsupported config, no I/O                                 |
| src/compose.ts: compose; src/node.ts: nodeServices             | Services/database/close assembly; SMTP only in Node wrapper                                            | Opens DB; creates provider objects                                           |
| src/authentication.ts: authentication                          | Select Better Auth or Supabase Auth                                                                    | Auth adapter initialization                                                  |
| src/services.ts: connectionFor, supabaseOAuth, supabaseAccess  | Active tenant connection, OAuth config, encrypted token refresh                                        | Refresh lease, OAuth call, ciphertext replacement                            |
| src/runner.ts: runOne                                          | Claim optional job ID, execute payload, finish/reschedule                                              | SQL jobs and provider effects                                                |
| src/collectors.ts: collectAccounts, collectApple, dailySummary | Account polling, report polling and project-local notification timing                                  | Cursors/events/metrics/fanout; recurrence                                    |

No standalone server, timer, CLI or Cloudflare binding is defined here; apps/api and apps/jobs host these functions.

## Implemented today — expanded monitoring

routes-monitoring.ts owns generalized credential/OAuth setup, report definitions/queries, dashboard views and event preferences. monitoring-access.ts owns adapters and encrypted refresh/CAS; monitoring-jobs.ts owns independent live/import pages, metric refresh and inbox processing; monitoring-matches.ts authenticates cross-provider references; monitoring-summary.ts adds selected metrics to daily delivery.
