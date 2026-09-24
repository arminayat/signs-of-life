# API runtime overview

## Implemented today

Thin backend/API host for the shared Hono application. src/node.ts serves a long-lived Node process; src/cloudflare.ts composes request-local services using Hyperdrive, then forwards to createApi and schedules pool closure.
Business routes and authorization live in packages/backend, SQL in packages/db, providers in packages/adapters. This app does not run collectors or serve the dashboard.

## Planned/aspirational

No app-local route framework or independent API domain is planned. Keep this runtime boundary thin.
