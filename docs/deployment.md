# Deployment

Use separate integration credentials and encryption keys for each installation. Configure one canonical `PUBLIC_URL`; all application UI, auth and API routes share that origin. The public landing page is a separate static deployment and links to that application origin.

Existing installations must follow the [Signs of Life rename guide](renaming.md)
before upgrading; it covers database schemas, Docker volumes, cookies and hosted resources.

## Docker

```sh
cp .env.example .env
# Generate secrets; configure providers; set PUBLIC_URL=http://localhost:8080.
docker compose up --build -d
```

The stack runs PostgreSQL, a one-off Drizzle migration, the Hono API, Node jobs and an nginx static frontend. PostgreSQL must become healthy before migration; API/jobs start after successful migration. Only the web port is published. Replace the development database password before an internet deployment; URL-encode it when used in a connection string.

For local email inspection:

```sh
# .env: EMAIL_PROVIDER=smtp, SMTP_URL=smtp://mailpit:1025,
# MAIL_FROM=Signs of Life <signs-of-life@example.test>
docker compose --profile mail up --build -d
```

Mailpit opens at `http://localhost:8025`. Use an HTTPS reverse proxy and a real mail provider for a public installation. Do not use Mailpit for public delivery.

An external PostgreSQL host works with the same API/job containers: supply its `DATABASE_URL` when running those containers, run the migration once, and omit the bundled database service. The repository's default Compose file provisions its own database. No Redis or external queue is required.

Check `/api/health` for process health and `/api/ready` for database connectivity and the migration ledger version required by the build. Verify login and a real notification separately.

## Cloudflare

The application deployment consists of three Workers:

1. `signs-of-life-api`: Hono with a Hyperdrive database binding.
2. `signs-of-life-jobs`: Cron/Queues with the same Hyperdrive configuration.
3. `signs-of-life`: static React assets with a service binding to the API.

The maintained installation uses `https://sol.arminayat.dev` as its canonical origin. The web Worker declares this hostname as a custom domain; deploying it creates a specific DNS record without changing the zone's wildcard record. API and job configs already use this origin and bind the `sol` Supabase project's Hyperdrive configuration. Keep generated instance-specific configs and secrets out of Git, or commit only deliberately public non-secret configuration.

1. Provision a standard PostgreSQL database. Keep `signs_of_life` and `signs_of_life_identity` out of exposed Data API schemas.
2. Configure Hyperdrive for that database **with query caching disabled**, because job leases and authentication require fresh reads. The maintained Supabase connection uses a restricted application role, direct PostgreSQL endpoint and verified TLS with Supabase's CA certificate.
3. Create `signs-of-life-jobs` and `signs-of-life-dead-letter` queues.
4. Set the real Hyperdrive IDs and canonical `PUBLIC_URL` in API/job configurations. Set `BUILD_REVISION` to the Git commit, and `SOURCE_URL` to the corresponding public source revision.
5. Apply Drizzle migrations using a direct/private database connection, then place secrets in both Worker secret stores as needed.
6. Build and deploy API, jobs, then web:

```sh
pnpm build
pnpm exec wrangler deploy --config apps/api/wrangler.jsonc
pnpm exec wrangler deploy --config apps/jobs/wrangler.jsonc
pnpm exec wrangler deploy --config apps/web/wrangler.jsonc
```

The API and job Workers have `workers_dev=false`; the public web Worker forwards `/api/*` through its service binding. OAuth redirects must use the public web hostname. There is no cross-origin cookie dependency.

Secrets include `AUTH_SECRET`, `ENCRYPTION_KEYS`, provider credentials and webhook signing secrets. Use `wrangler secret put` or bulk input from an untracked file. Never put them in `vars` or inline shell arguments. API and job hosts must agree on encryption keys, auth session version and unsubscribe signing secret. Jobs do not need GitHub OAuth credentials.

The one-minute Cron trigger redispatches abandoned jobs from PostgreSQL. Monitor recent source errors, overdue jobs, queue failures and uncertain deliveries. Queue acceptance is not job completion; `/api/health` alone is not live acceptance.

Completed account polls and daily-summary readiness checks use a five-minute recurrence. Keep the one-minute Cron for prompt verification, notification, webhook and recovery dispatch; it only publishes jobs whose persisted due time has arrived. Publication already batches up to 100 messages, and consumers receive up to three messages per invocation. Cloudflare bills each message's write/read/delete operations even in a batch, so fewer recurring jobs reduce Queue usage; larger transport batches alone do not. The cadence change needs a jobs Worker deployment (or Node worker restart) and a web deployment for the updated setup copy. It adds no migration, environment variable or queue configuration. Existing jobs adopt the new interval after their next successful run. Verify actual Queue operations and application job health after rollout.

### Public landing page — implemented today

The web project also owns a standalone static landing page in `apps/web/landing`. Its separate Vite build writes `apps/web/dist-landing`; the `signs-of-life-landing` assets Worker uses `apps/web/wrangler.landing.jsonc`. The configured hostname follows the requested `soll.arminayat.dev`. The existing application remains at `sol.arminayat.dev`.

Run `pnpm dev:landing` for local development at `http://127.0.0.1:5174`. It needs no API or database. `pnpm build` includes both frontend builds, while `pnpm build:landing` builds only the landing page. The landing page has no service bindings, secrets, environment variables or migrations; its sign-in links open the application. Keep its static `_headers` policy aligned with the dashboard's security policy and serve fonts/images locally.

Release the landing page independently:

```sh
pnpm check
pnpm exec wrangler deploy --dry-run --config apps/web/wrangler.landing.jsonc
git diff --check
CLOUDFLARE_AUTH_USE_KEYRING=false pnpm exec wrangler deploy --profile signs-of-life-release --config apps/web/wrangler.landing.jsonc
```

The named profile is the maintained installation's existing Wrangler authentication workaround; other installations should use their own authorized Cloudflare account and hostname. Deployment of this assets Worker does not deploy API/jobs/dashboard changes. Verify the public HTML, CSS, favicon and security headers after release; browser testing still requires task authorization. The supplied Docker application stack does not serve this separate landing build.

The 2026-10-23 landing release is live at `https://soll.arminayat.dev/`; HTTPS, exact asset bytes, security headers and links were checked over HTTP. See [status](status.md#public-landing-page--2026-10-23) for the evidence and unperformed browser gate. No API/jobs/dashboard deployment or database migration was part of that release.

## Switching database hosts

Pause API writes and jobs for the maintenance window. Back up all `signs_of_life`, `signs_of_life_identity` and `signs_of_life_migrations` schemas with `pg_dump`, restore them to the new PostgreSQL host, preserve the encryption keys and `AUTH_SECRET`, and update `DATABASE_URL` or Hyperdrive. Run migrations, check `/api/ready`, then resume execution. Keep the old database intact until application and job checks pass. Do not use Supabase-specific export/import APIs.

## Switching authentication

Provider switching needs explicit identity mappings. Never match users by email automatically.

Prepare a private JSON file with an array of `{ "userId": "APPLICATION_UUID", "issuer": "NEW_ISSUER", "subject": "NEW_PROVIDER_USER_ID" }`. Better Auth's issuer is `better-auth`; Supabase's issuer is the configured Auth URL. Provision the new provider identities first.

Pause public API access, back up the database, then run:

```sh
pnpm auth:migrate /private/path/identity-mapping.json
```

The command validates every mapping in a transaction and clears Better Auth sessions. It can move an explicitly mapped identity from an empty workspace created during first login; it refuses populated workspaces or identities linked to other accounts. Increment `AUTH_SESSION_VERSION` on every host, select the new `AUTH_PROVIDER`, and deploy its credentials. The new cookie namespace rejects old provider sessions, including when switching back later. Verify mapped users still see their original projects before reopening access. Existing integration OAuth tokens are independent of platform login and remain encrypted in place.

## Backups and upgrades

Back up the three private schemas and retain the encryption key map separately with controlled access. A database backup without its old encryption keys cannot restore provider connections. To rotate encryption keys, add a new version and select it for future writes; retain older keys until old credentials have been re-encrypted or reconnected.

Before upgrading, back up, run the automated checks and inspect generated SQL migrations. Apply migrations once before starting upgraded API/jobs. For rollback, keep code compatible with the applied schema or restore a coordinated database backup during a maintenance window. Do not run `drizzle-kit push` against production.

### Project views upgrade

Deploy the API and web app together when introducing project Overview, Sources and Notifications. The web app uses the new authenticated `/api/projects/:id/dashboard` and `/api/projects/:id/overview` endpoints. There are no new environment variables, migrations or provider permissions. Existing connected sources and collected history populate the views; an empty chart stays empty until collection or an App Store report is available.

### Project connections upgrade

Apply migration 0004 with `pnpm db:migrate` before deploying the API and web app together. No new secrets or provider permissions are needed. Connection creation now requires `projectId`; clients must create a project first. Existing single-project connections are assigned automatically, unattached connections receive a named project, and already-shared connections retain collection with a legacy warning. New source attachments must use a project-owned connection.

Validation: type checking, 42 backend/database tests, production build, API/web Worker dry runs and `git diff --check` pass. Browser tests were updated but not run locally for this change.

## Planned/aspirational — Google Play, Lemon Squeezy, Slack and Discord rollout

Apply migration `0011_webhook_destinations` with `pnpm db:migrate` before upgrading API/jobs. It adds a nullable encrypted destination secret and preserves existing destinations. Deploy API, jobs and web together. No new environment variables, bindings or installation OAuth registrations are required; credentials are entered per connection/destination. Follow [monitoring setup](monitoring-integrations.md) and [channel setup](integrations.md#slack-and-discord). Verify each provider and message receipt separately after deployment; source and fixture checks alone do not establish acceptance.

## Planned/aspirational — ten-provider rollout

Apply additive migrations 0005–0010, configure optional OAuth registration pairs and MONITOR_ALLOWED_HOSTS on API and jobs, and deploy compatible API/jobs/web revisions together. Existing MAX_SOURCES overrides remain valid; the default is 25. Follow [the monitoring release procedure](monitoring-integrations.md#plannedaspirational--coordinated-release-and-live-acceptance). Browser tests were not authorized for this implementation; external registrations, deployment and real provider acceptance remain separate gates.

## Five-minute polling release

Completed account polls and daily-summary readiness checks repeat after five minutes. Daily checks are capped at the upcoming local daily time so a late-night report is not skipped. Keep the one-minute Cron for notification, webhook, import and recovery responsiveness; it publishes only due work. Publication uses bounded sendBatch calls for up to 100 distinct messages per batch, and consumers retain batches of three. Cloudflare still bills each message's operations individually. The longer polling interval reduces message volume; batching reduces publication overhead.

Deploy jobs and web for this change. No migration, environment variable, API rollout or queue setting is required. Existing jobs adopt the interval after their next successful run. Cloudflare's minute tick can add up to a minute plus processing time; measure actual operation usage after rollout.

## Reliability upgrade — rollout procedure

The maintained installation applied migrations 0012–0013, verified runtime ledger access and deployed the coordinated release on 2026-10-23. See [the release record](status.md#coordinated-reliability-and-landing-release--2026-10-23) for exact revisions and acceptance boundaries. The following procedure still applies to other installations.

Apply migrations **0012_workflow_reliability** and **0013_account_overview** using `pnpm db:migrate`, then deploy compatible API/jobs/web builds together. The first indexes observation event provenance; the second indexes non-anonymous accounts by source and occurrence time. Both preserve records. Standard index creation can hold write locks; plan a maintenance window appropriate to table size. New API readiness stays unsuccessful on an older migration ledger. If migration and runtime roles differ, grant the runtime role read access to the ledger (replace `app_runtime` with the actual role):

```sql
GRANT USAGE ON SCHEMA signs_of_life_migrations TO app_runtime;
GRANT SELECT ON signs_of_life_migrations.__drizzle_migrations TO app_runtime;
```

Do not grant migration/schema-write privileges to the runtime role. No new environment variables, runtime bindings or provider scopes are required.

Allow at least 30 seconds termination grace for the Node API so it can drain requests and close the database. The supplied Compose stack uses 35 seconds and checks `/api/ready` before starting the web service. Rebuild/distribute the Better Auth connector where installed to gain normalized timestamp continuation; packaging is included in `pnpm build`, publication is separate.

Before rollout run `pnpm check` against an isolated loopback `_test` database, or `pnpm check:isolated` with PostgreSQL server tools on PATH. Run API/jobs/web Worker bundle dry runs for Cloudflare. Browser testing requires task authorization; no browser or live provider acceptance was performed for this implementation. After rollout independently verify schema readiness, collection progress, backlog diagnostics and actual destination receipt.
