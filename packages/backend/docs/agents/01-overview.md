# Backend overview

## Implemented today

Shared Hono application, configuration/composition and monitoring use cases consumed by both Node and Cloudflare runtimes.
Flow: authenticate operator → resolve application identity/workspace → create project → attach encrypted provider connection → create source and collector job → collect observations/metrics → fan out durable deliveries → send through verified destinations. Configuration and dashboards are synchronous HTTP; collection/delivery run through runOne.
No customer database writes, Auth hooks, first-open tracking, billing, team-membership API or additional providers are present.

## Planned/aspirational

No separate feature roadmap is encoded here. Known reconnect/configuration gaps are retained in 07; cross-package architectural exceptions are tracked at workspace level.
