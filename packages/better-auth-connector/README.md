# Signs of Life connector for Better Auth

Implemented today: a server plugin for **Better Auth 1.7.4**, exposing a token-authenticated, read-only account list. No schema additions, writes, auth hooks or browser instrumentation. Automated compatibility tests use 1.7.4; other versions are not yet supported.

Build locally with `pnpm --dir packages/better-auth-connector build` and distribute with `pnpm --dir packages/better-auth-connector pack`. The package is not yet published to npm.

```ts
import { betterAuth } from "better-auth";
import { signsOfLife } from "@signs-of-life/better-auth-connector";

export const auth = betterAuth({
  // Your existing database and authentication options.
  plugins: [
    signsOfLife({ tokens: [process.env.SIGNS_OF_LIFE_TOKEN!], name: "My app" }),
  ],
});
```

Generate a dedicated random token of at least 32 characters, for example `openssl rand -hex 32`. Enter the app's existing auth base URL (usually `https://example.com/api/auth`) and this token in Signs of Life. The installation operator must allowlist the connector hostname. Never use a Better Auth session/signing secret for the connector.

Probe `GET <auth-base>/signs-of-life/v1/users?limit=1` with `Authorization: Bearer <connector-token>`. The response contains only `version`, the configured application name, stable account IDs, creation timestamps, anonymous status when the anonymous plugin is present, and an opaque `next` cursor. Send `from`, `until`, `limit` (1–200) and `after` to paginate. Keep the range fixed. Null `next` ends the scan; a final empty page is normal.

The plugin uses Better Auth's adapter abstraction, including configured table/field mappings. Equal timestamps paginate by account ID; deletions do not shift offset positions. Existing-user history cannot reconstruct deleted accounts, and delayed insertion with an old timestamp can be missed beyond the monitoring overlap.

For rotation, deploy `tokens: [newToken, oldToken]`, reconnect Signs of Life using the new token, verify a successful collection, then remove the old token. Do not log authorization headers or endpoint responses. Apply normal application-level rate limiting to this endpoint.
