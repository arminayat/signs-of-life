# API runtime improvement ideas

## Implemented today

| Idea                                          | Impact                                                                                                                                                                         | Effort | Area        | Status |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------- | ------ |
| Drain HTTP requests before closing PostgreSQL | Avoid interrupted in-flight mutations during Node shutdown/redeployment; await server.close, then close the pool, with a bounded drain deadline and idempotent signal handling | Small  | src/node.ts | done   |

The runtime regression holds an actual local HTTP request open during shutdown, verifies the database remains available, and verifies repeated shutdown calls exit once. Schema-aware readiness belongs to backend/db and remains distinct from provider acceptance.
