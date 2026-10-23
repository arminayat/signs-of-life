# Database conventions

## Implemented today

postgresStore spreads focused job/collection/overview stores, then implements lifecycle methods. Public reads are workspace scoped. Workspace locks serialize capacity checks; project locks serialize routing changes. Identity inserts handle unique-key races and discard the losing provisional user.
Transaction-aware delivery helpers accept Executor so event insertion, cursor advancement, fanout and delivery jobs can commit together. Account pages insert events and delivery/jobs in batches; destinations are selected once per page. Unique keys make overlap reads and repeated dispatch safe. Worker mutations require a current Job and lock it through the transaction; test fixtures obtain real synthetic claims rather than bypassing this guard. Connection health takes an update lock directly to avoid concurrent shared-lock upgrades. Worker transactions lock parents before children (workspace, job, project, connection, source, monitor state), and canonical monitor event keys are sorted before writes to avoid reverse-order alias contention. Apple transactions lock all legacy shared-project parents and source rows before metric writes.
Connection/project and source/workspace foreign keys enforce tenant boundaries, but not every internal table uses a composite tenant key. Same-project connection ownership is checked in backend routes, not in createSource.

## Planned/aspirational — maintenance rules

Keep SQL here and public authorization in backend. Never pass untrusted IDs into worker-only update helpers. Keep src/store.ts focused (currently near the 500-line guideline); split the next coherent addition rather than creating a generic repository framework. Preserve applied migration history.
