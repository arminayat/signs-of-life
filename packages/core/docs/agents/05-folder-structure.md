# Core folder structure

## Implemented today

- src/model.ts: domain types, provider ports and errors.
- src/store.ts: persisted record types, safe read models and MonitorStore.
- src/time.ts: shared date/time and account-label helpers.
- package.json: private workspace package marker.
- AGENTS.md and docs/agents/: this child's agent memory.
  Local tests/, dist/, index.ts barrel and CLI entrypoint are not present. Tests/tooling live at workspace root.

## Planned/aspirational — placement rules

Put shared domain contracts here only when there is a caller. Keep feature formatting in web and use cases in backend. Add a top-level folder only for a concrete responsibility and update this map.

## Implemented today — expanded monitoring

src/monitoring.ts owns provider contracts; src/provider-registry.ts owns browser-safe setup metadata; src/monitor-store.ts owns the monitoring persistence interface. These are internal source exports, not a plugin loader.
