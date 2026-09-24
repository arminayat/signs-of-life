# Workspace structure

## Implemented today

| Path                                                                         | Owner / contents                                                                                                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| apps/api, apps/jobs, apps/web                                                | Deployable runtime/UI children; read their AGENTS.md                                                                                      |
| packages/core, packages/db, packages/adapters, packages/backend              | Shared implementation children; read their AGENTS.md                                                                                      |
| tests/*.test.ts, tests/helpers.ts                                            | Unit/provider contracts, real PostgreSQL lifecycle/queue/migration tests and isolated fixtures                                            |
| tests/e2e/dashboard.spec.ts, tests/browser-server.ts                         | Browser verification and guarded real API/Vite test host                                                                                  |
| scripts/migrate.ts, migrate-identities.ts                                    | Operator schema/identity entrypoints                                                                                                      |
| scripts/ci-container-env.mjs                                                 | Generates local CI fixture configuration                                                                                                  |
| scripts/stop-dev.mjs                                                         | Checkout-scoped development process stop helper                                                                                           |
| deploy/nginx.conf, Dockerfile, compose.yaml                                  | Portable container topology and same-origin asset/API hosting                                                                             |
| .github/workflows/check.yml                                                  | Shared CI, Worker dry runs and container verification                                                                                     |
| docs/architecture.md, deployment.md, integrations.md, renaming.md, status.md | Human architecture, operator setup/upgrade and historical acceptance                                                                      |
| docs/agents/                                                                 | Cross-project state, routing and curated logs; AGENTS.md is its index                                                                     |
| Root manifests/configs                                                       | package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.json, drizzle.config.ts, vitest.config.ts, playwright.config.ts, .env.example |
| README.md, CONTRIBUTING.md, SECURITY.md, LICENSE                             | Product entry, contribution/security policy and licensing                                                                                 |

Ignored node_modules/, artifacts/, output/, test-results/, playwright-report/, .wrangler/ and built dist/ content is not maintained source. .env/.dev.vars/local JSONC files can contain secrets; do not ingest their values into memory.
Top-level src/, a separate infra/IaC project, docs/agents/README.md, a shared design-system package, Redis and customer instrumentation packages are not present.

## Planned/aspirational — structure updates

Describe actual new/removed folders here; route detailed contents to child KBs. Root tests/scripts/deploy are shared tooling rather than independent manifest-bearing projects.
