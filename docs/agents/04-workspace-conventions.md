# Workspace conventions

## Implemented today

Root package.json owns shared dependencies and commands. Runtime/internal-library child manifests are private ESM package markers; the Better Auth connector has its own build, exports and peer dependencies for distribution. pnpm-workspace.yaml includes apps/* and packages/*; pnpm-lock.yaml lockfileVersion 9 records resolution. Root pins pnpm 11.0.5, Node >=22.16.0 and TypeScript 7.0.2.
Source uses named exports, relative extensionless imports, strict TypeScript, semicolons/double quotes and focused modules. Root tsconfig checks apps/packages/scripts/tests without emitting; there is no enforced package export boundary. .prettierignore excludes generated migrations/artifacts and secrets. No ESLint configuration is present.
Commands from repository root:

| Command                                    | Implemented effect                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| pnpm dev; dev:api; dev:web; dev:worker     | Concurrent full stack or individual tsx/Vite process; Node scripts read .env                 |
| pnpm dev:landing; build:landing           | Standalone static landing dev server on 5174 or production assets in apps/web/dist-landing |
| pnpm stop                                  | scripts/stop-dev.mjs discovers this checkout's listeners/process ancestors and sends SIGTERM |
| pnpm typecheck; test; build                | TypeScript, Vitest, connector build plus dashboard and landing Vite production assets       |
| pnpm check                                 | typecheck → test → build; excludes browser tests, formatting and Worker dry runs             |
| pnpm check:isolated                        | Temporary local PostgreSQL cluster → check → stop/remove; requires server tools on PATH      |
| pnpm test:e2e                              | Playwright desktop/mobile fixture tests; separate from check                                 |
| pnpm db:generate; db:migrate; auth:migrate | Generate Drizzle SQL; apply migrations; explicit identity mapping                            |
| pnpm format; format:check                  | Prettier write/check                                                                         |

Tests live at root. The test runner validates a loopback PostgreSQL URL ending in _test and checks connectivity before Vitest. The isolated bootstrap handles cancellation during setup and test execution, then closes/removes its cluster. Database tests use real PostgreSQL with fake provider interfaces; the rename suite requires temporary database creation. Playwright fixture guard requires NODE_ENV=test and database name ending in _test. CI independently runs check, e2e, Worker dry runs and Docker readiness/routing.

The public landing page is a second static build within apps/web, not a ninth workspace child. It uses existing Vite with no new runtime dependencies, a separate assets-only Wrangler config and an ignored dist-landing output. Keep its hosting independent of application auth/API and run its own Wrangler dry run before release. Detailed ownership and source structure live in the Web child KB; deployment procedures are in docs/deployment.md.

## Planned/aspirational — shared maintenance rules

Read root README.md and docs/architecture.md before behavior changes as well as relevant KB. Use YAGNI; keep files near/under 500 lines and split by coherent responsibility. SQL stays in db, provider transport in adapters, domain contracts in core, use cases in backend, runtime bindings in apps.
Do not browser-test changes unless explicitly requested in the task. When authorized, use isolated identities and _test DB; never production fixtures. Before release run pnpm check, relevant authorized browser tests and git diff --check; Cloudflare changes require bundle dry runs. Report any skipped gate.
Preserve existing uncommitted work. Keep secrets, provider payloads and generated artifacts out of Git. Do not borrow another product's credentials. Maintain behavior/deployment docs with relevant changes.
For a new child, first establish actual manifest/source and responsibility, then build its KB and add it to project map. Add top-level folders only for a concrete cross-project responsibility; no speculative frameworks or duplicate docs indexes.

## Implemented today — connector build and acceptance

Root pnpm build/check includes the independently packaged Better Auth connector build. Its prepack cleans only its generated dist directory, then emits ESM/declarations and includes LICENSE. Run pnpm test (not bare vitest) to load test environment variables. Every new provider needs a real connection/read smoke test before live-verified status; automated fixture evidence is recorded separately in docs/status.md.

The supplied Compose API service checks schema-aware `/api/ready` and allows 35 seconds to stop, covering the Node API's 30-second bounded shutdown. Other process hosts should provide equivalent termination grace.

Implemented today: CI rewrites the GitHub runner's slow Azure Ubuntu package mirror to the official HTTPS archive before installing Chromium system dependencies. The browser suite and all bundle/container checks remain enabled; this runner-only workaround does not change application dependencies.
