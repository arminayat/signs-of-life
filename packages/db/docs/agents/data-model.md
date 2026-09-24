# Database data model

## Implemented today

Source: src/schema.ts and src/auth-schema.ts. Names below are SQL tables.

| Schema / entities                                                   | Relationships and invariants                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| signs_of_life.users, identities, workspaces                         | (issuer,subject) primary key → application user; unique owner_id gives one workspace per owner. No application-user email column                                   |
| projects                                                            | Workspace-owned; enabled defaults true, timezone UTC, daily_time 09:00                                                                                             |
| connections                                                         | Workspace-owned encrypted secret and provider kind; nullable project_id preserves legacy sharing; tenant/project FK cascades; external uniqueness includes project |
| sources                                                             | Project and connection linked within workspace; unique (project_id,kind,external_id); baseline, cursor, collection timestamps/errors                               |
| destinations, project_destinations                                  | Workspace email/private-chat addresses; enabled and verified independent; unique unsubscribe hash; project/destination join has tenant FKs                         |
| events                                                              | Unique (source_id,external_id), provider/occurrence and anonymous marker; stores observations, never monitored emails                                              |
| metrics, reports                                                    | Unique source/date totals and monotonic correction revision; report connection/date availability; no raw report table                                              |
| deliveries                                                          | Unique destination/key; JSON notification, purpose, status, attempts, provider_id, first started_at                                                                |
| jobs                                                                | Globally unique key; JSON JobPayload, due_at, status, attempts, lease token/until and dispatch time                                                                |
| challenges, webhook_receipts, rate_limits                           | Hashed single-use capabilities with expiry; receipt keys; fixed-window rate counts                                                                                 |
| signs_of_life_identity.user/session/account/verification/rate_limit | Better Auth-owned records; operator login emails/session metadata are present here, distinct from monitored users                                                  |
| signs_of_life_migrations.__drizzle_migrations                       | Applied SQL ledger managed by Drizzle                                                                                                                              |

Connection/destination secrets are omitted from snapshots; verification message bodies are redacted there. projectId passed to snapshot scopes deliveries before the 100 limit; other arrays remain workspace-wide. Events cap at 100, metrics at 900; projectOverview performs separate aggregates.
SQL migrations 0000–0002 establish/evolve legacy schemas; 0003 renames them; 0004 assigns single-project connections, creates projects for unattached ones and leaves multi-project connections null. No RLS policy definition is present; private schemas, runtime roles and service authorization form the boundary.
