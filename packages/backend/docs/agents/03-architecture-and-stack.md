# Backend architecture and stack

## Implemented today

Root-pinned Hono 4.13.7, Zod 4.6.1 and Svix 2.4.0; TypeScript ES modules. Services holds MonitorStore, SecretBox, AccountSource, ReportSource, channels, fetch and Config. ApiServices adds Authentication imported from adapters.
compose() wires PostgreSQL and real providers; nodeServices() validates process.env and adds SMTP. Cloudflare supplies env explicitly. No Cloudflare binding enters use cases.
SQL state is authoritative; Queue messages carry only job IDs. HTTP handlers authorize tenant/project ownership before trusted internal store operations. Server-rendered unsubscribe HTML and auth callbacks are exceptions to the JSON API.
Tests are root api, jobs, apple-jobs, delivery-retry, auth and project-overview suites. Root check runs typecheck, Vitest and web build; runtime packages own deployment configs. See operations.md for env and pipeline-flows.md for timing.

## Implemented today — expanded monitoring

Services adds a dedicated public connector transport. Ten adapters implement core ProviderAdapter while SQL stays in db. Refresh leases plus ciphertext comparison prevent stale token writes after disconnect/rotation; collection commits check the claimed job lease. Provider budgets and Retry-After are persisted per connection.
