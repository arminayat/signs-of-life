# Backend configuration and operations

## Implemented today

src/config.ts drops empty-string env values, validates with Zod, and rejects missing active encryption keys. Runtime values are passed by apps/api/jobs; no Vite credential env is used.

| Variables                                                                  | Meaning / validation                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL, PUBLIC_URL                                                   | Required DB string and canonical URL                                                                                                |
| AUTH_PROVIDER, AUTH_SESSION_VERSION, AUTH_SECRET                           | better-auth default or supabase; namespace version defaults 1 (alphanumeric/_/-); secret >=32 chars                                 |
| ENCRYPTION_KEYS, ENCRYPTION_KEY_VERSION                                    | Required JSON version→base64 32-byte keys; active version defaults v1 and must exist                                                |
| GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET                                     | Both needed to enable Better Auth GitHub login                                                                                      |
| SUPABASE_AUTH_URL, SUPABASE_AUTH_KEY                                       | Both required for Supabase login mode                                                                                               |
| SUPABASE_OAUTH_CLIENT_ID, SUPABASE_OAUTH_CLIENT_SECRET                     | Monitoring OAuth; distinct from login                                                                                               |
| TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET         | Token requires valid username and secret >=32 chars                                                                                 |
| EMAIL_PROVIDER, MAIL_FROM, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, SMTP_URL | disabled default; email requires sender; resend requires key; SMTP requires Node and URL; webhook secret needed for bounce endpoint |
| MAX_PROJECTS, MAX_SOURCES, MAX_DESTINATIONS                                | Positive integers default 5,10,3; workspace capacity                                                                                |
| SOURCE_URL, BUILD_REVISION                                                 | Public config metadata; default repository URL and development revision                                                             |

HOST/PORT belong to Node API entrypoint; TEST_DATABASE_URL belongs to tests; Cloudflare DATABASE/JOBS/API/ASSETS bindings belong to apps.

## Planned/aspirational — operating rules

Follow root docs/deployment.md and integrations.md for provider setup, backups and auth migration. Apply migration 0004 before the project-owned-connection API/web pair. Health/readiness/config do not establish provider acceptance. Verify persisted jobs, source success/errors and delivery outcomes separately; do not expose secrets while diagnosing.
