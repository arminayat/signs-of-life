docs/agents/ is this layer's persistent agent memory and is authoritative for how this code behaves.

## Index

- [01-workspace-overview.md](docs/agents/01-workspace-overview.md) — Purpose, child summaries, implemented flow and absent scope.
- [02-project-map.md](docs/agents/02-project-map.md) — Routing table: where each kind of change belongs and ownership boundaries.
- [03-cross-project-architecture.md](docs/agents/03-cross-project-architecture.md) — Dependency direction, contracts, data flow and runtime topology.
- [04-workspace-conventions.md](docs/agents/04-workspace-conventions.md) — Shared tools, commands, verification and maintenance rules.
- [05-workspace-structure.md](docs/agents/05-workspace-structure.md) — Actual root directory map and rules for adding structure.
- [improvement-ideas.md](docs/agents/improvement-ideas.md) — Curated cross-project proposals with impact, effort and status.
- [known-issues.md](docs/agents/known-issues.md) — Cross-cutting footguns, fixes, acceptance limits and child issue routing.

## OPERATING PROTOCOL

- **BEFORE thinking about or making ANY change**, read the relevant docs/agents/ files first and always skim [known-issues.md](docs/agents/known-issues.md).
- This is a **WORKSPACE**. Start with [02-project-map.md](docs/agents/02-project-map.md), route to the right project, then read THAT project's AGENTS.md and relevant docs/agents/ files (including its 07-known-issues.md) before touching it.
- **AFTER any change or new learning**, update the relevant memory in the **SAME turn, before finishing**:
  - Fixed/encountered non-obvious bug or gotcha → local 07-known-issues.md, or root known-issues.md if cross-cutting.
  - Improvement noticed but not implemented → local 06-improvement-ideas.md, or root improvement-ideas.md if cross-project.
  - Changed behavior, architecture, structure or conventions → matching numbered state file and relevant type-specific guide. Rewrite stale state; never append changelog clutter.
- Update workspace-level memory **only** when cross-project relationships, boundaries, project routing or shared conventions changed. Keep detailed local facts in the owning child's KB and link down.
- **Code is the source of truth. If KB and code disagree, fix the KB.** Documentation describes intent until checked against code. Label non-trivial claims **implemented today** or **planned/aspirational**; a section label applies to its contents. Implementation is not proof of deployment or live provider acceptance.
- Curate living logs: mark resolved/done, remove obsolete entries, and never present a proposed fix as verified. Reconcile existing files rather than duplicating them. AGENTS.md is the index; do not create docs/agents/README.md.

## Update triggers

Changed product behavior, new architectural boundary, folder convention, tooling change, UI direction, new/removed cross-project link, debugged issue or spotted improvement.

## Project guardrails

Signs of Life is a standalone open-source repository. It is not part of Kapier.

Read [README.md](README.md) and [docs/architecture.md](docs/architecture.md) before changing behavior. Deployment/provider setup is in [docs/deployment.md](docs/deployment.md) and [docs/integrations.md](docs/integrations.md); [docs/status.md](docs/status.md) records historical verification and external prerequisites.

- React + Vite, HeroUI and Tailwind own the dashboard. Hono owns request handling; workers own scheduled collection and notification delivery.
- Core contracts belong in packages/core/src; keep provider SDKs in adapters and Drizzle queries in db. The existing Authentication location exception is documented in cross-project architecture.
- Application tables use private PostgreSQL schemas. Never add customer database writes, Auth hooks, monitored-user email collection or first-open instrumentation.
- Use YAGNI and focused modules; keep files around 500 lines or less.
- Do not browser-test changes unless explicitly requested for the task. When authorized, use isolated identities and a database ending in _test; never connect fixtures to production.
- Keep credentials, provider payloads, generated deployment secrets and test artifacts out of Git. Do not reuse another product's integration credentials.
- Before release run pnpm check, relevant authorized browser tests and git diff --check. Cloudflare changes require bundle dry runs. Maintain behavior/deployment documentation with the change; report skipped verification gates.
- For substantial changes, report what changed in the system and user experience, verification, and any required setup, environment variable, migration or deployment step.
- Distinguish source implementation, automated verification, deployment and live provider acceptance. A provider acceptance response does not prove a message reached an inbox.

## Layer and file selection

Implemented today: root WORKSPACE with eight SINGLE PROJECT children under apps/ and packages/. Child KBs include all seven numbered core files and relevant type-specific guides; their AGENTS.md files list the final selection. apps/ and packages/ are grouping directories, not independent projects. Ignored artifacts/release-scan is generated output, not a maintained child.

Implemented today: this operating protocol requires agents to maintain memory; automatic post-edit hooks and a CI memory checker are not present.
