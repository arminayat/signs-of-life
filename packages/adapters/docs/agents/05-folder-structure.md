# Adapters folder structure

## Implemented today

src/ contains seven focused modules: auth.ts, supabase-source.ts, apple-source.ts, channels.ts, smtp.ts, crypto.ts, http.ts. package.json is a private workspace marker; AGENTS.md/docs/agents provide memory.
A provider plugin registry, local tests/, routes/, SDK output and barrel index are not present. Tests live at workspace root.

## Planned/aspirational — placement rules

Place another provider in a focused source module only when needed; share transport mechanics through http.ts and domain contracts through core. Add a top-level folder only for a demonstrated new responsibility and update this map.
