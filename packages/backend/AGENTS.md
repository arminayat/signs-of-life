docs/agents/ is this layer's persistent agent memory and is authoritative for how this code behaves.

## Index

- [01-overview.md](docs/agents/01-overview.md) — Purpose, implemented end-to-end flow, boundaries and absent features.
- [02-surface-area.md](docs/agents/02-surface-area.md) — Entry points, routes or functions, inputs, mutations and external effects.
- [03-architecture-and-stack.md](docs/agents/03-architecture-and-stack.md) — Current dependencies, runtime/data boundaries and tooling.
- [04-conventions-and-patterns.md](docs/agents/04-conventions-and-patterns.md) — Observed code patterns and maintenance rules.
- [05-folder-structure.md](docs/agents/05-folder-structure.md) — Actual directory map and placement rules.
- [06-improvement-ideas.md](docs/agents/06-improvement-ideas.md) — Curated local proposals with impact, effort, area and status.
- [07-known-issues.md](docs/agents/07-known-issues.md) — Retained failure modes, causes, fixes and open code-confirmed gaps.
- [api-contracts.md](docs/agents/api-contracts.md) — Complete endpoint inventory, payloads, authentication and errors.
- [data-model.md](docs/agents/data-model.md) — Records, schemas, relationships and persistence invariants.
- [pipeline-flows.md](docs/agents/pipeline-flows.md) — Triggers, data progression, retry and partial-failure behavior.
- [operations.md](docs/agents/operations.md) — Configuration, execution, verification and recovery rules.
- [security-access.md](docs/agents/security-access.md) — Authentication, capability, secret and tenant boundaries.
- [integrations.md](docs/agents/integrations.md) — External-system ownership, credentials, effects and test boundaries.

## OPERATING PROTOCOL

- BEFORE thinking about or making ANY change, read the relevant docs/agents/ files first and always skim [07-known-issues.md](docs/agents/07-known-issues.md).
- Start with the [workspace project map](../../docs/agents/02-project-map.md) for cross-package work, then read each affected child's AGENTS.md and memory before touching its code.
- AFTER any change or new learning, update the relevant memory in the SAME turn, before finishing: non-obvious bugs/gotchas → 07-known-issues.md; noticed but unimplemented improvements → 06-improvement-ideas.md; behavior, architecture, structure or convention changes → matching state file. Rewrite stale state; do not append changelog clutter. Update type-specific files when their subject changes.
- Update workspace memory only when relationships, boundaries, project routing or shared conventions change. Keep local details here and point to their owner rather than duplicating logs.
- Code is the source of truth. If memory and code disagree, fix memory and flag the gap. Label non-trivial claims implemented today or planned/aspirational; a section label applies to its contents. Code-present does not mean deployed or accepted by a live provider.

## Update triggers

Changed product behavior, architectural boundary, folder convention, tooling, UI direction, added/removed cross-project link, debugged issue or spotted improvement. Curate logs; mark resolved/done and prune obsolete entries.

## Layer and project rules

Implemented today: this is a SINGLE PROJECT child (backend-API / data pipeline / internal library) within the root pnpm WORKSPACE; it has no nested source projects. All commands run from repository root unless explicitly stated. Follow [root AGENTS.md](../../AGENTS.md), preserve unrelated changes, use YAGNI and keep files around 500 lines or less. Browser tests require explicit task authorization and isolated identities/_test databases. Report source changes, verification, deployment and live acceptance separately.
