docs/agents/ is this layer's persistent agent memory and is authoritative for how this code behaves.

## Index

- [01-overview.md](docs/agents/01-overview.md) — Purpose and boundaries.
- [02-surface-area.md](docs/agents/02-surface-area.md) — Endpoint, input/output and effects.
- [03-architecture-and-stack.md](docs/agents/03-architecture-and-stack.md) — Dependencies and build.
- [04-conventions-and-patterns.md](docs/agents/04-conventions-and-patterns.md) — Adapter and paging conventions.
- [05-folder-structure.md](docs/agents/05-folder-structure.md) — Actual structure and placement.
- [06-improvement-ideas.md](docs/agents/06-improvement-ideas.md) — Curated improvement backlog.
- [07-known-issues.md](docs/agents/07-known-issues.md) — Debugged footguns and acceptance limits.
- [public-api.md](docs/agents/public-api.md) — Exports, protocol and usage.
- [integrations.md](docs/agents/integrations.md) — Better Auth and consumer integration.

## OPERATING PROTOCOL

- BEFORE thinking about or making ANY change, read the relevant docs/agents/ files first and always skim [07-known-issues.md](docs/agents/07-known-issues.md).
- Start with the [workspace project map](../../docs/agents/02-project-map.md) for cross-package work, then read each affected child's AGENTS.md and memory before touching its code.
- AFTER any change or new learning, update the relevant memory in the SAME turn, before finishing: non-obvious bugs/gotchas → 07-known-issues.md; noticed but unimplemented improvements → 06-improvement-ideas.md; behavior, architecture, structure or convention changes → matching state file. Rewrite stale state; do not append changelog clutter. Update type-specific files when their subject changes.
- Update workspace memory only when relationships, boundaries, project routing or shared conventions change. Keep local details here and point to their owner rather than duplicating logs.
- Code is the source of truth. If memory and code disagree, fix memory and flag the gap. Label non-trivial claims implemented today or planned/aspirational; a section label applies to its contents. Code-present does not mean deployed or accepted by a live provider.

## Update triggers

Changed product behavior, architectural boundary, folder convention, tooling, UI direction, added/removed cross-project link, debugged issue or spotted improvement. Curate logs; mark resolved/done and prune obsolete entries.

## Layer and file selection

Implemented today: SINGLE PROJECT, library/server-plugin child of the root WORKSPACE. All seven numbered core files plus public-api.md and integrations.md apply. No nested projects. Follow root guardrails; browser testing requires explicit authorization.
