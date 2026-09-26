# Connector folder structure

## Implemented today

src/index.ts owns plugin, token check and paging. package.json owns published files/exports/peer range; tsconfig.json owns standalone JS/declaration build. LICENSE carries the repository AGPL license. README.md owns installation, probe and rotation. dist/ is ignored build output. AGENTS.md and docs/agents/ own persistent memory. Tests live at root tests/better-auth-connector.test.ts. No database, client, hooks or migrations folders exist.

## Planned/aspirational

Add a top-level folder only for a demonstrated new responsibility; update this map and root routing.
