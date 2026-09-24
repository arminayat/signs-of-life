# Core overview

## Implemented today

Internal library of domain types, the MonitorStore persistence interface, provider contracts and date helpers. Callers import TypeScript source directly; package.json is private with no exports map, build or publish script.
Flow: adapters normalize observations to model.ts types → backend uses store.ts contracts → db implements persistence → web consumes safe snapshot/overview types.
No database connection, HTTP server, credential storage or scheduled executor exists here.

## Planned/aspirational

No committed standalone SDK roadmap is present. Moving Authentication into this boundary is a candidate recorded at workspace level; it currently lives in adapters/src/auth.ts.
