# API runtime surface area

## Implemented today

| Source / entry                  | Inputs and behavior                                                        | Effects                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| src/node.ts                     | process.env → nodeServices → Hono serve; HOST default 127.0.0.1, PORT 8787 | Long-lived DB pool, HTTP API; SIGINT/SIGTERM close server/pool then exit                                      |
| src/cloudflare.ts default fetch | Request, ApiBindings, execution context                                    | Overrides DATABASE_URL with env.DATABASE.connectionString; builds auth/API; ctx.waitUntil(close()) in finally |
| wrangler.jsonc                  | Worker signs-of-life-api, nodejs_compat, Hyperdrive DATABASE               | Declares runtime deployment; no deployment occurs on import                                                   |

Every /api route is implemented in packages/backend; see [complete contracts](../../../../packages/backend/docs/agents/api-contracts.md). Public health/config/auth routes and tenant APIs all pass through this host. No scheduled or Queue handler is present.
