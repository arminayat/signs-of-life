# Connector architecture

## Implemented today

Standalone ESM TypeScript package, version 0.1.0, peer Better Auth exactly 1.7.4 and Zod ^4. Uses better-auth/api createAuthEndpoint, Web Crypto SHA-256 and the configured Better Auth adapter. The root lockfile supplies test dependencies; no imports from Signs of Life runtime/core/db.

pnpm --dir packages/better-auth-connector build emits dist/index.js and declarations; prepack builds. Root tests/better-auth-connector.test.ts uses actual Better Auth 1.7.4 and a mapped memory adapter, including anonymous fields. Root pnpm check also checks source. No environment reader or automatic token provisioning is present.
