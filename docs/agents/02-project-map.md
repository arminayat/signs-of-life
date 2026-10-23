# Project routing map

## Implemented today

Read this first, then the linked child's AGENTS.md and relevant memory; always skim its known-issues file.

| Project               | Path / entry point                                                               | Responsibility                                       | Change here when you need to…                                                     | Key boundaries / owners                                                  |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Web                   | [apps/web](../../apps/web/AGENTS.md)                                             | Dashboard, public landing page, CSS, static/API bridge | Change a screen, landing page, interaction, chart, theme or frontend assets       | Dashboard uses /api; landing is static and links to the application origin |
| API runtime           | [apps/api](../../apps/api/AGENTS.md)                                             | Node HTTP server, Worker fetch lifecycle             | Change listening address, API Worker binding/lifecycle                            | No business routes here; delegate them to backend                        |
| Jobs runtime          | [apps/jobs](../../apps/jobs/AGENTS.md)                                           | Node loop, Cron and Queue transport                  | Change dispatch/consumer settings, cleanup invocation or worker lifetime          | Payload behavior in backend; leases/due state in db                      |
| Core                  | [packages/core](../../packages/core/AGENTS.md)                                   | Domain types, provider/store ports, date helpers     | Change shared data contracts, job kinds or time semantics                         | No SQL/provider SDKs; owns Authentication contract                       |
| Database              | [packages/db](../../packages/db/AGENTS.md)                                       | Schemas, migrations, transactions, read models, jobs | Add persisted fields, alter queries/tenant constraints, fix claims/retention      | Sole application SQL owner; customer DB untouched                        |
| Adapters              | [packages/adapters](../../packages/adapters/AGENTS.md)                           | Auth/provider HTTP, crypto, parsing, sends           | Change provider protocol, normalization, encryption or transport                  | Core results; auth implementation additionally imports db                |
| Backend               | [packages/backend](../../packages/backend/AGENTS.md)                             | Hono handlers, Services composition, use cases       | Add endpoint/policy, configure capability, change collection or delivery behavior | Uses core interfaces, calls adapters/db; hosted by API/jobs              |
| Better Auth connector | [packages/better-auth-connector](../../packages/better-auth-connector/AGENTS.md) | Distributable read-only customer server plugin       | Change connector protocol, adapter mapping, token rotation or compatibility       | No SOL runtime imports, customer writes/hooks or operator-login changes  |

Cross-cutting changes:

- New provider: core types if needed → adapter + contract tests → backend lifecycle/config/collector → db changes only if necessary → web setup/status. Runtime edits only for new bindings.
- Schema/API response change: db/core + backend + web consumers; apply migrations before compatible API/jobs/web deployment.
- Notification reliability: backend runner/collectors + db stores; provider wire semantics in adapters; Queue transport in jobs.
- Deployment/tooling: root package.json/lock/workspace, .github/workflows/check.yml, Dockerfile, compose.yaml, deploy/nginx.conf, scripts/ plus affected app wrangler.jsonc.
- Public landing deployment: apps/web/landing, vite.landing.config.ts and wrangler.landing.jsonc belong to the existing Web child. Its assets-only Worker deploys separately from the authenticated application and requires no API/jobs/database change.
- Operator setup/acceptance: root docs/deployment.md, integrations.md, renaming.md, status.md; do not infer live state from config.

## Implemented today — excluded inventory

artifacts/release-scan is an ignored generated copy outside pnpm workspace globs, not a maintained project. node_modules, dist, dist-landing, output and test artifacts are not child projects. apps/ and packages/ are grouping folders without their own manifests or source entrypoints, so no intermediate KB layer is needed.
