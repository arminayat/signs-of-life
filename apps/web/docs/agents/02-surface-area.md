# Web routes and actions

## Implemented today

Routes are defined by src/main.tsx and project-detail.tsx. All persisted mutations use src/data.ts → same-origin /api; the browser never accesses PostgreSQL.

| Route / screen                              | Source                                                        | Actions / reads / effects                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login at protected URLs when session is 401 | main.tsx: Login                                               | GET config; POST session/login then provider redirect; disabled until login configured; theme localStorage only                                                                        |
| / Projects                                  | projects.tsx                                                  | GET dashboard; create project name/description/browser timezone → POST projects and navigate to its Sources; link project cards; capped recent event count and latest-report downloads |
| /projects/:id                               | project-detail.tsx                                            | GET project dashboard; default redirect to overview; secondary project navigation; unknown view fallback                                                                               |
| /projects/:id/overview                      | monitor-overview.tsx, project-overview.tsx, monitor-chart.tsx | Range-aware Overview plus configurable provider reports; stored view mutations use API; account dates use project zone, Apple uses reporting date                                      |
| /projects/:id/sources                       | project-sources.tsx, connections.tsx, source-dialog.tsx       | Start/reconnect Supabase OAuth; submit/reconnect Apple credentials; fetch catalog; POST sources; disconnect connection or delete source/history after confirmation                     |
| /projects/:id/notifications                 | project-notifications.tsx, project-settings.tsx               | Recent project deliveries; PATCH enabled; modal edits name/description/timezone/dailyTime/destinationIds; DELETE project after confirmation                                            |
| /connections                                | main.tsx                                                      | Legacy redirect to /; no workspace Connections screen                                                                                                                                  |
| /destinations                               | destinations.tsx                                              | Create Telegram/email; show Start link or pending email; resend verification; POST test; PATCH pause/resume; DELETE destination/history                                                |
| /activity                                   | other-pages.tsx: ActivityPage/ActivityList                    | Workspace delivery list/status/errors/attempts; no mutation                                                                                                                            |
| /settings                                   | other-pages.tsx: SettingsPage                                 | GET config; installation limits/retention/source link; logout; DELETE workspace requires typed DELETE                                                                                  |
| /verify?token=…                             | other-pages.tsx: VerifyPage                                   | No login needed; explicit POST verify-email; GET alone does not verify                                                                                                                 |
| *                                           | main.tsx                                                      | Page-not-found with home link                                                                                                                                                          |

Shell provides workspace/project nav, sign-out, source link, version from root package.json and theme control. Authenticated theme control is in the bottom content footer; login has its own utilities.
All listed data routes call real backend handlers. Copy/empty states are not sample monitoring data. Provider sends are queued by backend; "Provider accepted" is not an inbox receipt.

## Implemented today — expanded project experience

monitor-overview.tsx composes Growth/Revenue/Usage with range selection (7/30/90/365/custom), provider cards and Configure views. monitor-views.tsx adds/removes/hides/reorders provider metrics or supported reports and advertised filters. monitor-connection.tsx adds provider credential/OAuth and billing webhook setup. monitor-status.tsx shows import/live state and event preferences. All writes use the same-origin API; query caches refresh report results and request current metrics hourly. No formula editor or direct provider calls exist.
