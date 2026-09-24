# API runtime architecture

## Implemented today

Private TypeScript ESM workspace package with no own dependency/build scripts. Root Node >=22.16.0, pnpm 11.0.5, tsx 4.23.13 and Wrangler 4.130.0 supply execution. Cloudflare compatibility date is 2026-09-11 with nodejs_compat.
Uses @hono/node-server 2.1.1 and shared backend createApi. ApiBindings includes Hyperdrive DATABASE and optional provider settings.
Config validation/secret names are in packages/backend/docs/agents/operations.md. Node reads .env via root scripts; Cloudflare gets secrets/bindings. Same DB and compatible encryption/auth settings must be used by API and jobs.
Root pnpm typecheck checks these sources; root tests exercise shared behavior. .github/workflows/check.yml runs checks, browser fixtures, three Worker dry runs and separate Compose verification. No independent child test suite exists.
