# Project routing map

## Implemented today

Read this first, then the linked child's AGENTS.md and relevant memory; always skim its known-issues file.

| Project               | Path / entry point                                                               | Responsibility                                       | Change here when you need to…                                                     | Key boundaries / owners                                                  |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Web                   | [apps/web](../../apps/web/AGENTS.md)                                             | UI, router, query client, CSS, static/API bridge     | Change a screen, interaction, chart, theme or frontend assets                     | Browser uses safe core types and /api only; backend owns auth/validation |
| API runtime           | [apps/api](../../apps/api/AGENTS.md)                                             | Node HTTP server, Worker fetch lifecycle             | Change listening address, API Worker binding/lifecycle                            | No business routes here; delegate them to backend                        |
| Jobs runtime          | [apps/jobs](../../apps/jobs/AGENTS.md)                                           | Node loop, Cron and Queue transport                  | Change dispatch/consumer settings, cleanup invocation or worker lifetime          | Payload behavior in backend; leases/due state in db                      |
| Core                  | [packages/core](../../packages/core/AGENTS.md)                                   | Domain types, provider/store ports, date helpers     | Change shared data contracts, job kinds or time semantics                         | No SQL/provider SDKs; Authentication currently lives in adapters         |
| Database              | [packages/db](../../packages/db/AGENTS.md)                                       | Schemas, migrations, transactions, read models, jobs | Add persisted fields, alter queries/tenant constraints, fix claims/retention      | Sole application SQL owner; customer DB untouched                        |
| Adapters              | [packages/adapters](../../packages/adapters/AGENTS.md)                           | Auth/provider HTTP, crypto, parsing, sends           | Change provider protocol, normalization, encryption or transport                  | Core results; auth additionally imports db and backend Config type       |
| Backend               | [packages/backend](../../packages/backend/AGENTS.md)                             | Hono handlers, Services composition, use cases       | Add endpoint/policy, configure capability, change collection or delivery behavior | Uses core interfaces, calls adapters/db; hosted by API/jobs              |
| Better Auth connector | [packages/better-auth-connector](../../packages/better-auth-connector/AGENTS.md) | Distributable read-only customer server plugin       | Change connector protocol, adapter mapping, token rotation or compatibility       | No SOL runtime imports, customer writes/hooks or operator-login changes  |

Cross-cutting changes:

- New provider: core types if needed → adapter + contract tests → backend lifecycle/config/collector → db changes only if necessary → web setup/status. Runtime edits only for new bindings.
- Schema/API response change: db/core + backend + web consumers; apply migrations before compatible API/jobs/web deployment.
- Notification reliability: backend runner/collectors + db stores; provider wire semantics in adapters; Queue transport in jobs.
- Deployment/tooling: root package.json/lock/workspace, .github/workflows/check.yml, Dockerfile, compose.yaml, deploy/nginx.conf, scripts/ plus affected app wrangler.jsonc.
- Operator setup/acceptance: root docs/deployment.md, integrations.md, renaming.md, status.md; do not infer live state from config.

## Implemented today — excluded inventory

artifacts/release-scan is an ignored generated copy outside pnpm workspace globs, not a maintained project. node_modules, dist, output and test artifacts are not child projects. apps/ and packages/ are grouping folders without their own manifests or source entrypoints, so no intermediate KB layer is needed.
