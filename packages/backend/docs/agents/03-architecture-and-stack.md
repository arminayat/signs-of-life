# Backend architecture and stack

## Implemented today

Root-pinned Hono 4.13.7, Zod 4.6.1 and Svix 2.4.0; TypeScript ES modules. Services holds MonitorStore, SecretBox, AccountSource, ReportSource, channels, fetch and Config. ApiServices adds the browser-safe Authentication contract from core; authentication adapters accept their own minimal configuration type.
compose() wires PostgreSQL and real providers; nodeServices() validates process.env and adds SMTP. Cloudflare supplies env explicitly. No Cloudflare binding enters use cases.
SQL state is authoritative; Queue messages carry only job IDs. HTTP handlers authorize tenant/project ownership before trusted internal store operations. Server-rendered unsubscribe HTML and auth callbacks are exceptions to the JSON API.
Tests are root api, jobs, apple-jobs, delivery-retry, auth and project-overview suites. Root check runs typecheck, Vitest and web build; runtime packages own deployment configs. See operations.md for env and pipeline-flows.md for timing.

## Implemented today — expanded monitoring

Services adds a dedicated public connector transport. Twelve adapters implement core ProviderAdapter while SQL stays in db. All OAuth refreshes, including Supabase, compare the ciphertext and refresh lease before replacement. Collector, metric, delivery, inbox and worker-health writes require the claimed job; the database checks its token, expiry and workspace inside each write transaction. Provider budgets and Retry-After are persisted per connection. An optional targeted metric-definition method avoids enumerating all PostHog insights for each selected report.
