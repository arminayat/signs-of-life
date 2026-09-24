# Backend access boundaries

## Implemented today

Hono secureHeaders and 128,000-byte body limit apply globally. Public/auth handlers precede origin/session middleware deliberately. Signed-in routes resolve tenant context from validated identity. Unsafe ordinary API calls require exact PUBLIC_URL Origin; public webhook/capability handlers have independent checks.
Email verification uses Origin plus single-use token; unsubscribe GET is read-only and POST uses a capability; Telegram uses a secret header and private-chat /start; Resend verifies raw-body Svix signatures.
Connections/challenges are encrypted with record-specific authenticated context. Destination addresses/operator auth emails exist; monitored account emails are not selected. Workspace deletion removes monitoring data but does not delete external identity-provider accounts.

## Planned/aspirational — security rules

Keep both application schemas private and use restricted runtime DB access. Never log credentials, raw reports, cookies, verification tokens or provider payloads. Preserve ownership checks before worker-only store calls. Do not describe database FKs alone as complete project authorization.
