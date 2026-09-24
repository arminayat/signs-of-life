# Workspace known issues

## Implemented today

- **Open documentation/code boundary mismatch:** architecture prose lists Authentication among core contracts → source defines it in packages/adapters/src/auth.ts, with db imports and a backend Config type dependency → current KB documents the exception; code refactor is not done → prevention: inspect imports and route future boundary work via improvement-ideas.md.
- **Active acceptance footgun:** checked-in readiness/config or an old passing release is mistaken for live feature acceptance → cause: source, deployment and recipient receipt are distinct → established approach: use docs/status.md as historical evidence only; refresh hosted revision, schema, login, collection and delivery independently → prevention: never copy old live-state/test-count claims into current numbered state.
- **Active configuration boundary:** platform Supabase Auth and Supabase monitoring OAuth use different credentials/callbacks → symptom: login configured but monitoring unavailable → prevention/workaround: follow root docs/integrations.md and backend env map; configure each required integration independently.
- **Handled schema/deployment rename risk:** changing ledger/resource/Compose names can create empty resources or replay migrations → implemented DB fix renames old ledger first and migration 0003 renames schemas; operator cutover still needs root docs/renaming.md → prevention: preserve applied SQL, DB volumes, secrets and encryption versions.
- **Open scheduling gaps are child-owned:** migration-created projects lack daily jobs (db 07); Apple reconnect does not enqueue terminated collectors (backend 07). Code paths confirm these gaps; no runtime reproduction or corrective mutation was performed during KB setup.

## Planned/aspirational — log maintenance

Each new entry needs symptom → root cause → actual fix/workaround (or explicitly none) → prevention and status. Do not label an untested proposal resolved; prune obsolete entries.
