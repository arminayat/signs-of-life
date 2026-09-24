# Deployment

Use separate integration credentials and encryption keys for each installation. Configure one canonical `PUBLIC_URL`; all UI, auth and API routes share that origin.

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

Check `/api/health` for process health and `/api/ready` for a database-backed readiness check. Verify login and a real notification separately.

## Cloudflare

The hosted deployment consists of three Workers:

1. `signs-of-life-api`: Hono with a Hyperdrive database binding.
2. `signs-of-life-jobs`: Cron/Queues with the same Hyperdrive configuration.
3. `signs-of-life`: static React assets with a service binding to the API.

The maintained installation uses `https://sol.arminayat.dev` as its canonical origin. The web Worker declares this hostname as a custom domain; deploying it creates a specific DNS record without changing the zone's wildcard record. API and job configs already use this origin. The all-zero Hyperdrive IDs remain placeholders until a hosted database is provisioned. Keep generated instance-specific configs and secrets out of Git, or commit only deliberately public non-secret configuration.

1. Provision a standard PostgreSQL database. Keep `signs_of_life` and `signs_of_life_identity` out of exposed Data API schemas.
2. Configure Hyperdrive for that database **with query caching disabled**, because job leases and authentication require fresh reads.
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
