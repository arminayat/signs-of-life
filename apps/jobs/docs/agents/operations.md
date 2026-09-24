# Jobs runtime operations

## Implemented today

From root: pnpm dev:worker uses .env and tsx watch. Compose starts jobs after migration. Cloudflare signs-of-life-jobs binds DATABASE Hyperdrive and JOBS queue, with a separate signs-of-life-dead-letter queue. Every-minute Cron does dispatch and hourly cleanup.
The Node host needs no external queue. It waits for the active iteration after SIGINT/SIGTERM, then closes its pool. SMTP is supported only through Node composition; Cloudflare configuration rejects it.

## Planned/aspirational — operating rules

Use root pnpm check and git diff --check before release, plus pnpm exec wrangler deploy --dry-run --config apps/jobs/wrangler.jsonc for Cloudflare changes. Inspect due jobs, expired leases, source errors and uncertain deliveries for recovery; never resend uncertain messages blindly.
Follow root docs/deployment.md for migrations, shared encryption keys and provider credentials. Do not run both old/new deployments unintentionally during cutover. No provider acceptance was verified by creating this KB.
