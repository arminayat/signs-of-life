# Jobs runtime operations

## Implemented today

From root: pnpm dev:worker uses .env and tsx watch. Compose starts jobs after migration. Cloudflare signs-of-life-jobs binds DATABASE Hyperdrive and JOBS queue, with a separate signs-of-life-dead-letter queue. Every-minute Cron does dispatch and hourly cleanup.
The dispatcher publishes only due jobs; its minute tick does not itself consume Queue operations. Backend collectors use five-minute completed account polls and daily-summary readiness checks, with an earlier local daily-time check when needed. Catch-up, deliveries and webhook processing keep prompt dispatch. Existing sendBatch calls publish up to 100 separate messages and consumers receive up to three per invocation; these reduce request/invocation overhead but Queue billing remains per message. Keep the small consumer batch because an individual collector may already run for 150 seconds. No cadence-specific migration, variable or queue setting is needed; deploy the jobs Worker or restart Node, then measure live operation volume and application health.
Dispatch reserves before publishing, orders by due time and drains up to 1,000 jobs or 45 seconds per tick. Cleanup occurs after dispatch, has independent error handling, and drains bounded batches at the hourly tick. Node maintenance retries pending/failed batches after one minute and otherwise waits an hour. Both runtimes emit worker_health with persisted pending/running/failed counts, expired leases, oldest due date and oldest active-source success date; this is application state, distinct from Queue acknowledgement or provider acceptance.
The Node host needs no external queue. It waits for the active iteration after SIGINT/SIGTERM, then closes its pool. SMTP is supported only through Node composition; Cloudflare configuration rejects it.

## Planned/aspirational — operating rules

Use root pnpm check and git diff --check before release, plus pnpm exec wrangler deploy --dry-run --config apps/jobs/wrangler.jsonc for Cloudflare changes. Inspect due jobs, expired leases, source errors and uncertain deliveries for recovery; never resend uncertain messages blindly.
Follow root docs/deployment.md for migrations, shared encryption keys and provider credentials. Do not run both old/new deployments unintentionally during cutover. No provider acceptance was verified by creating this KB.

## Implemented today — monitoring rollout

Both runtime configurations enable nodejs_compat and global_fetch_strictly_public. OAuth client settings must be available to API and jobs for refresh; Better Auth hosts need MONITOR_ALLOWED_HOSTS. Apply migrations through 0013 before compatible API/jobs/web deployment. Workflow reliability adds no environment variables or external queue requirement for Node. See root docs/deployment.md and docs/monitoring-integrations.md for rollout and live acceptance requirements.

Completed account polling and daily readiness repeat every five minutes; the minute Cron dispatches due work in bounded reservations of 100 messages. Empty scans publish nothing. Failed publication releases reservations, and expiry recovers abandoned reservations; database claims tolerate duplicate hints. Consumer batches remain three. Batching reduces publication overhead, not per-message billing.
