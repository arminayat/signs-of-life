# Core architecture and stack

## Implemented today

ES-module TypeScript library using date-fns-tz 3.2.0 for local date/time helpers; standard Intl validates zones. Root package.json and pnpm-lock.yaml pin tools (TypeScript 7.0.2, pnpm 11.0.5, Node >=22.16.0).
model.ts is shared by store.ts; core has no imports from db, adapters or backend. Date-valued server records become JSON strings in apps/web/src/data.ts.
No environment variables or runtime composition here. Root tests/adapters.test.ts exercises dates/DST; other suites consume the contracts. Root pnpm typecheck verifies all consumers; pnpm check also runs tests and web build.
