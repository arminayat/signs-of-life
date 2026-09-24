# Backend conventions

## Implemented today

Factory functions accept Services/ApiServices; routes validate unknown input with Zod and assert typed AppError conditions. api.ts centralizes secure headers, body limit, errors, origin checks and identity context. Order matters: health/config/auth/public routes precede authenticated middleware.
Handlers use workspaceId from session context, never a request-supplied tenant ID. Most durable work is enqueued, not performed during requests; provider validation/catalog/OAuth are synchronous exceptions.
Error logs include stable event/path/job/kind/code fields and avoid raw provider error payloads. Route groups import shared schemas/ApiEnv from api.ts; this existing import cycle is not a generic plugin system.

## Planned/aspirational — maintenance rules

Keep SQL in db and provider transport/signing in adapters. Preserve public webhook/capability auth exceptions when changing middleware. Add focused modules near their route/use case; update core contracts and tests when behavior changes. Do not promise exactly-once external sends.
