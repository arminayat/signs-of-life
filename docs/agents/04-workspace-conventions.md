# Workspace conventions

## Implemented today

Root package.json owns shared dependencies and commands. Runtime/internal-library child manifests are private ESM package markers; the Better Auth connector has its own build, exports and peer dependencies for distribution. pnpm-workspace.yaml includes apps/* and packages/*; pnpm-lock.yaml lockfileVersion 9 records resolution. Root pins pnpm 11.0.5, Node >=22.16.0 and TypeScript 7.0.2.
Source uses named exports, relative extensionless imports, strict TypeScript, semicolons/double quotes and focused modules. Root tsconfig checks apps/packages/scripts/tests without emitting; there is no enforced package export boundary. .prettierignore excludes generated migrations/artifacts and secrets. No ESLint configuration is present.
Commands from repository root:

| Command                                    | Implemented effect                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| pnpm dev; dev:api; dev:web; dev:worker     | Concurrent full stack or individual tsx/Vite process; Node scripts read .env                 |
| pnpm stop                                  | scripts/stop-dev.mjs discovers this checkout's listeners/process ancestors and sends SIGTERM |
| pnpm typecheck; test; build                | TypeScript, Vitest, Vite production assets                                                   |
| pnpm check                                 | typecheck → test → build; excludes browser tests, formatting and Worker dry runs             |
| pnpm test:e2e                              | Playwright desktop/mobile fixture tests; separate from check                                 |
| pnpm db:generate; db:migrate; auth:migrate | Generate Drizzle SQL; apply migrations; explicit identity mapping                            |
| pnpm format; format:check                  | Prettier write/check                                                                         |

Tests live at root. Vitest database tests use real PostgreSQL with fake provider interfaces; the rename suite requires temporary database creation. Playwright fixture guard requires NODE_ENV=test and database name ending in _test. CI independently runs check, e2e, Worker dry runs and Docker readiness/routing.

## Planned/aspirational — shared maintenance rules

Read root README.md and docs/architecture.md before behavior changes as well as relevant KB. Use YAGNI; keep files near/under 500 lines and split by coherent responsibility. SQL stays in db, provider transport in adapters, domain contracts in core, use cases in backend, runtime bindings in apps.
Do not browser-test changes unless explicitly requested in the task. When authorized, use isolated identities and _test DB; never production fixtures. Before release run pnpm check, relevant authorized browser tests and git diff --check; Cloudflare changes require bundle dry runs. Report any skipped gate.
Preserve existing uncommitted work. Keep secrets, provider payloads and generated artifacts out of Git. Do not borrow another product's credentials. Maintain behavior/deployment docs with relevant changes.
For a new child, first establish actual manifest/source and responsibility, then build its KB and add it to project map. Add top-level folders only for a concrete cross-project responsibility; no speculative frameworks or duplicate docs indexes.

## Implemented today — connector build and acceptance

Root pnpm build/check includes the independently packaged Better Auth connector build. Its prepack cleans only its generated dist directory, then emits ESM/declarations and includes LICENSE. Run pnpm test (not bare vitest) to load test environment variables. Every new provider needs a real connection/read smoke test before live-verified status; automated fixture evidence is recorded separately in docs/status.md.
