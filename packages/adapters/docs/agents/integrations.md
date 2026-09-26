# Adapter integration contracts

## Implemented today

| Integration          | Auth/config supplied by backend                                        | Behavior / failure / test boundary                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth + GitHub | AUTH_SECRET, AUTH_SESSION_VERSION, PUBLIC_URL, GITHUB_CLIENT_ID/SECRET | Login disabled unless both GitHub values exist; no passwords or automatic email linking; OAuth tokens encrypted by Better Auth; DB sessions/rate limits                                           |
| Supabase Auth        | SUPABASE_AUTH_URL/KEY, PUBLIC_URL, session version                     | Server PKCE cookies, HttpOnly, SameSite lax, Secure on HTTPS; validates getUser; issuer is Auth URL                                                                                               |
| Supabase monitoring  | SUPABASE_OAUTH_CLIENT_ID/SECRET                                        | PKCE authorize/exchange/refresh; no scope URL parameter; read-only auth.users query (id, created_at, truncated provider, anonymous); 500-row ordered pages; HTTP timeouts 15–20s                  |
| Apple                | Customer issuerId/keyId/privateKey/vendorNumber encrypted by caller    | ES256 five-minute JWT; GET /v1/salesReports DAILY/SUMMARY/SALES; 404 means pending; 30s request; positive units in supported initial/redownload product codes; ignores refunds/non-download types |
| Telegram             | TELEGRAM_BOT_TOKEN                                                     | Private-chat destination is verified by backend webhook; sendMessage truncates to 4000 characters, disables previews; 429 retries, 5xx/timeouts uncertain                                         |
| Resend               | RESEND_API_KEY, MAIL_FROM                                              | POST /emails uses delivery ID as Idempotency-Key; 429/5xx/network retry; backend handles signed bounce webhook                                                                                    |
| SMTP                 | SMTP_URL, MAIL_FROM                                                    | Node nodemailer, normal TLS validation; no file/URL attachments; auth/envelope errors failed, ambiguous errors uncertain                                                                          |

Root docs/integrations.md specifies operator registration scopes (organizations:read, projects:read, database:read) and callbacks. These external settings are required policy, not verified by the OAuth URL builder.
Mocks: tests/helpers.ts substitutes auth, sources, reports and channels; tests/adapters.test.ts injects HTTP; tests/smtp.test.ts runs a local SMTP server. A fake acceptance or HTTP success does not prove live receipt.

## Implemented today — monitoring protocols

monitoring/ owns the ten providers; credentials and real permission boundaries are enumerated in core/provider-registry.ts and root docs/monitoring-integrations.md. Stripe API reads are pinned to 2024-06-20; invoice linkage is hydrated for modern event objects. Provider native calculations are preserved; PostHog period unique values and GA4 period results use separate requests. No raw profile/payload persistence is exposed by adapter outputs.
