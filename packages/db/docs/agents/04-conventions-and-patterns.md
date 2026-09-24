# Database conventions

## Implemented today

postgresStore spreads focused job/collection/overview stores, then implements lifecycle methods. Public reads are workspace scoped. Workspace locks serialize capacity checks; project locks serialize routing changes. Identity inserts handle unique-key races and discard the losing provisional user.
Transaction-aware delivery helpers accept Executor so event insertion, cursor advancement, fanout and delivery jobs can commit together. Unique keys make overlap reads and repeated dispatch safe.
Connection/project and source/workspace foreign keys enforce tenant boundaries, but not every internal table uses a composite tenant key. Same-project connection ownership is checked in backend routes, not in createSource.

## Planned/aspirational — maintenance rules

Keep SQL here and public authorization in backend. Never pass untrusted IDs into worker-only update helpers. Keep src/store.ts focused (currently near the 500-line guideline); split the next coherent addition rather than creating a generic repository framework. Preserve applied migration history.
