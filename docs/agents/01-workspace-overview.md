# Workspace overview

## Implemented today

Scope: these guides describe the inspected working tree. The content-frame/footer UI, removal of PageHeader eyebrow text, Vite's 300ms watch polling and pnpm stop helper are implemented locally but remain in separate uncommitted changes. Their source files/configuration are not included in the knowledge-base commit; on a clean checkout, treat those details as planned/aspirational until the corresponding source changes land. Reconcile this note when they do.

Signs of Life is a standalone AGPL-3.0-only pnpm workspace for account alerts and app download reports across an operator's products. It is not part of Kapier. Classification is WORKSPACE because pnpm-workspace.yaml includes apps/* and packages/*, with seven child manifests and source trees. None has a nested source workspace.

- **apps/web — frontend/UI:** React dashboard, project views, destination controls, light/dark theme and static hosting bridge.
- **apps/api — backend/API runtime:** Node server and Cloudflare fetch entrypoint for shared Hono behavior.
- **apps/jobs — data pipeline/operations runtime:** Node direct job loop or Cloudflare Cron/Queue dispatch and consumption.
- **packages/core — internal library:** domain/provider/store contracts and date helpers.
- **packages/db — database/internal library:** PostgreSQL schema, migrations, identity resolution, transactional collection/delivery and durable jobs.
- **packages/adapters — integrations/internal library:** operator auth, Supabase/Apple sources, Telegram/Resend/SMTP and cryptography.
- **packages/backend — backend/API and pipeline library:** configuration/composition, endpoints, authorization and job use cases.
  End-to-end: operator signs in → application identity resolves to personal workspace → creates project → connects provider from Sources → selects source → background collectors persist observations/metrics → project routing fans out to verified destinations → workers send → UI displays independent delivery outcomes.
  Source implementation supports Supabase read-only account polling and Apple Sales and Trends. It does not contain customer database writes, Auth hooks, first-open instrumentation, monitored-user email collection, team memberships, billing, Redis or another SQL engine.

## Planned/aspirational and acceptance limits

No additional feature roadmap is committed by this KB. Open improvements are proposals, not implemented behavior. Code supports live integrations, but source, automated checks, deployment and provider receipt are separate facts. Root docs/status.md is a historical acceptance record and must be revalidated for status requests; this KB setup did not query hosted systems.
