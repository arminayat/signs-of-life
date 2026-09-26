# Web integration boundary

## Implemented today

Only same-origin /api is called by application fetch (credentials:same-origin). src/data.ts prefixes routes, JSON-encodes bodies and throws ApiError on non-OK responses. Server config exposes feature availability without credentials.
Supabase and GitHub flows navigate to a server-provided authorization URL. Telegram verification opens a server-provided t.me link. Apple private key/vendor fields are posted to backend; catalog names/IDs come from backend, never direct provider API calls.
Cloudflare src/cloudflare.ts forwards /api/* to API service binding and serves other requests through ASSETS with CSP/nosniff/referrer headers; Docker nginx implements equivalent forwarding. External links use noreferrer. No analytics SDK, monitored-email collection or provider secret storage is present in browser source.

## Implemented today — expanded monitoring

All ten providers use backend credential/OAuth endpoints and the provider → connection → resource sequence. The browser never calls provider APIs directly. Secrets are transient form values posted to the API, never localStorage. Native reports stay source-specific, with definition, reporting zone, freshness, unit/currency and unavailable/partial states. No analytics instrumentation or formula/SQL editor exists.
