# Backend folder structure

## Implemented today

- src/api.ts: Hono root and shared validators.
- src/routes-integrations.ts, routes-destinations.ts, routes-public.ts: route families.
- src/config.ts, compose.ts, node.ts, authentication.ts: runtime-neutral configuration and composition, plus Node-only SMTP wrapper.
- src/services.ts: dependency types and connection/token helpers.
- src/runner.ts, collectors.ts: durable job behavior.
- AGENTS.md, docs/agents/: local memory.
  No migrations/, controllers/, models/, ORM repository tree, local tests/ or standalone entrypoint is present. db owns SQL; runtime entrypoints live under apps.

## Planned/aspirational — placement rules

Add a route family or use-case module only when needed; avoid generic plugin/repository scaffolding. Any new top-level folder requires a concrete boundary and this map update.

## Implemented today — expanded monitoring

src/routes-monitoring.ts, monitoring-access.ts, monitoring-jobs.ts, monitoring-matches.ts and monitoring-summary.ts own generalized monitoring behavior. Provider protocols stay in adapters/monitoring, SQL in db, portable types/registry in core. No customer app login hooks are introduced.
