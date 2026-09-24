# Adapters surface area

## Implemented today

Paths relative to packages/adapters; factories default to fetch unless a test HTTP function is passed.

| Source / exports                                                                  | Behavior and input                                                                            | External effects / persistence                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| src/auth.ts: Authentication, betterAuthentication, supabaseAuthentication         | enabled, identity, login, logout, handle contract                                             | Auth provider calls, cookies, Better Auth database records |
| src/supabase-source.ts: supabaseSource, listSupabaseProjects, listSupabaseCatalog | Token/ref/cursor/until → normalized accounts; projects enriched by optional organization name | Read-only Management API requests; no local writes         |
| authorizeSupabase, exchangeSupabase, emptyCursor                                  | PKCE URL; code or refresh grant → expiring tokens; zero-ID cursor                             | OAuth exchange only; caller encrypts/persists              |
| src/apple-source.ts: appleSource, parseSalesReport                                | Key/vendor/date → metrics or null; TSV → per-app totals                                       | Signed GET and bounded gzip parsing; raw report discarded  |
| src/channels.ts: telegramChannel, emailChannel, resendTransport                   | Address, text, delivery idempotency key, optional unsubscribe URL                             | Real external sends; normalized DeliveryOutcome            |
| src/smtp.ts: smtpTransport                                                        | smtp/smtps URL and sender → EmailTransport                                                    | Node SMTP send                                             |
| src/crypto.ts: secretBox, randomToken, hashToken, equalSecret                     | Versioned AES-GCM, 32-byte random capabilities, SHA-256 comparisons                           | Computation only                                           |
| src/http.ts: Http, boundedText, jsonResponse                                      | Bounded body read and normalized HTTP error                                                   | Cancels response stream; no persistence                    |

No CLI, public HTTP routes or schedules exist in this child.
