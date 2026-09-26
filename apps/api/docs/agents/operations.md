# API runtime operations

## Implemented today

From repository root: pnpm dev:api runs tsx watch with .env; default loopback port 8787. pnpm dev runs API/web/jobs together. Docker runtime command is pnpm exec tsx apps/api/src/node.ts; Compose sets HOST=0.0.0.0 and waits for migrations.
Cloudflare signs-of-life-api has no workers.dev route and uses Hyperdrive DATABASE. Public web Worker calls its API service binding. Configuration supports Better Auth or Supabase Auth and disabled/Resend/Node SMTP email.

## Planned/aspirational — operating rules

Run root pnpm check and git diff --check before release; relevant browser checks require explicit task authorization and isolated _test fixtures. Cloudflare runtime/config changes also need pnpm exec wrangler deploy --dry-run --config apps/api/wrangler.jsonc.
Follow root docs/deployment.md: apply migrations before deployment, use correct Hyperdrive with caching disabled, install secrets outside vars, deploy API/jobs before web. API and web must agree on project-owned connection contracts. Do not deploy as part of KB maintenance.

## Implemented today — monitoring rollout

Both runtime configurations enable nodejs_compat and global_fetch_strictly_public. New OAuth client settings must be available to API and jobs for refresh; Better Auth hosts need MONITOR_ALLOWED_HOSTS. Apply additive migrations 0005–0010 before compatible API/jobs/web deployment. See root docs/monitoring-integrations.md for registration and live acceptance requirements.
