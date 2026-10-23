# Workspace overview

## Implemented today

Scope: these guides describe the committed implementation, including the content-frame/footer UI, simplified page headers, Vite watch polling, pnpm stop helper, reliability safeguards and independent public landing page. All are included in the 2026-10-23 release source. Current deployment evidence and separate provider acceptance limits are recorded in docs/status.md.

Signs of Life is a standalone AGPL-3.0-only pnpm workspace for account, billing and usage monitoring across an operator's products. It is not part of Kapier. Classification is WORKSPACE because pnpm-workspace.yaml includes apps/* and packages/*, with eight child manifests and source trees. None has a nested source workspace.

- **apps/web — frontend/UI:** React dashboard, project views, destination controls, light/dark theme, static hosting bridge and an independently built public HTML/CSS landing page.
- **apps/api — backend/API runtime:** Node server and Cloudflare fetch entrypoint for shared Hono behavior.
- **apps/jobs — data pipeline/operations runtime:** Node direct job loop or Cloudflare Cron/Queue dispatch and consumption.
- **packages/core — internal library:** domain/provider/store contracts and date helpers.
- **packages/db — database/internal library:** PostgreSQL schema, migrations, identity resolution, transactional collection/delivery and durable jobs.
- **packages/adapters — integrations/internal library:** operator auth, Supabase/Apple and twelve monitoring sources, Telegram/Slack/Discord/Resend/SMTP and cryptography.
- **packages/backend — backend/API and pipeline library:** configuration/composition, endpoints, authorization and job use cases.
- **packages/better-auth-connector — distributable library/server plugin:** read-only account endpoint for customer Better Auth applications; independent of operator login.

End-to-end: operator signs in → application identity resolves to personal workspace → creates project → connects provider from Sources → selects source → background collectors persist observations/metrics → project routing fans out to verified destinations → workers send → UI displays independent delivery outcomes.

Source implementation also supports Stripe, Polar, Paddle, RevenueCat, PostHog, GA4, Better Auth, WorkOS, Clerk and Auth0. Native reports remain source-specific; historical coverage is provider-dependent. No customer database writes, Auth hooks, instrumentation, monitored-user profile storage, team memberships, Redis or another SQL engine are present.

## Planned/aspirational and acceptance limits

No additional feature roadmap is committed by this KB. Open improvements are proposals, not implemented behavior. Code supports live integrations, but source, automated checks, deployment and provider receipt are separate facts. Root docs/status.md is a historical acceptance record and must be revalidated for status requests; this KB setup did not query hosted systems.
