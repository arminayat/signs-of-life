# Integration setup

Every installation supplies its own credentials. Keep secrets in `.env` for Node or Wrangler secret storage for Cloudflare; never put them in Vite variables, Wrangler `vars`, logs, or Git.

## GitHub login with Better Auth

Create a GitHub OAuth app for this installation:

- Homepage: your `PUBLIC_URL`.
- Authorization callback: `PUBLIC_URL/api/auth/callback/github`.
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the API host.
- Set `AUTH_PROVIDER=better-auth`, a random `AUTH_SECRET`, and `AUTH_SESSION_VERSION=1`.

Better Auth uses Drizzle tables in the private `pm_identity` schema. Only GitHub login is enabled; there is no password login or production development bypass.

## Supabase Auth alternative

Set `AUTH_PROVIDER=supabase`, `SUPABASE_AUTH_URL` and the project's publishable/anon `SUPABASE_AUTH_KEY`. Enable GitHub in that Auth project's dashboard with its own GitHub OAuth app. GitHub's callback is the Supabase project's `/auth/v1/callback`; allow `PUBLIC_URL/api/auth/callback` in Supabase's redirect allowlist.

Sessions remain in secure, HttpOnly cookies (Secure on HTTPS). The server calls `getUser` to validate them. This provider is only for Product Monitor login; it is independent of the Supabase monitoring integration below.

To switch providers while keeping users and projects, follow [identity migration](deployment.md#switching-authentication).

## Supabase monitoring OAuth

Register a Supabase OAuth integration. Configure **only** these scopes on that OAuth app:

- `organizations:read`
- `projects:read`
- `database:read`

Set the redirect URI to `PUBLIC_URL/api/connections/supabase/callback`. Set `SUPABASE_OAUTH_CLIENT_ID` and `SUPABASE_OAUTH_CLIENT_SECRET` on the API and job hosts. Supabase configures scopes at app registration; the old authorization URL `scope` parameter is deprecated.

Customers click Connect Supabase, consent, and select their project. Product Monitor probes the read-only endpoint before saving a source. If `auth.users` cannot be read through that endpoint, the connection is unsupported: do not work around this by requesting write access, API secrets or hooks.

The account query only selects ID, creation time, provider and anonymous status. No email address is fetched. Polling is approximate and can miss very late commits or accounts deleted between polls. Reconnect retains source cursors; disconnect removes stored tokens.

## App Store Connect

Customers create a team App Store Connect API key with access to Sales and Trends/Sales and Reports, and enter:

- Issuer ID
- Key ID
- `.p8` private key
- Vendor number from Payments and Financial Reports

The server signs short-lived JWTs and reads daily summary Sales reports. No App Analytics report-request creation or app instrumentation is used. App selection uses recent report rows, with a numeric Apple app ID fallback when the app is absent. A complete report without rows for the selected app is zero; an unavailable report is pending.

Do not reuse private keys from unrelated installations. Raw gzip/TSV reports are discarded after bounded parsing.

## Telegram

Create an installation-owned bot and configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without `@`), and a random `TELEGRAM_WEBHOOK_SECRET` of at least 32 characters.

Register `PUBLIC_URL/api/webhooks/telegram` as the bot webhook with Telegram's `setWebhook` API, including the same `secret_token`. Use a private operator script or HTTP client that does not print the token or place it in shell history. Configure only the `message` update type.

In Product Monitor, create a Telegram destination, open its expiring link, and press Start in a private chat. Return to the dashboard and wait for the verified status. Group/channel chats are intentionally unsupported in this version. Select the destination in the project's notification preferences, then send a test.

Telegram has no send idempotency key. Timeouts and interrupted sends are marked uncertain instead of retried blindly.

## Email

### Resend

Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM`. Verify the sender domain in your Resend account before enabling public recipients. Configure a Resend webhook at `PUBLIC_URL/api/webhooks/resend` for `email.bounced` and `email.complained`, and set its signing secret as `RESEND_WEBHOOK_SECRET`.

Resend works on both Node and Cloudflare. Delivery IDs are used as idempotency keys. Retries are bounded; an expired provider idempotency window is never treated as safe to resend.

### SMTP

Set `EMAIL_PROVIDER=smtp`, `SMTP_URL` and `MAIL_FROM` on Node deployments. For example, `smtp://mailpit:1025` for the Compose development mail profile, or `smtps://USER:PASSWORD@mail.example.com:465` for authenticated TLS. URL-encode credentials. SMTP is rejected at Cloudflare startup.

The Node transport enforces connection/greeting/socket timeouts, disables file and URL attachments, and uses normal TLS certificate validation. Its accepted status means the SMTP server accepted the message, not that an inbox received it. SMTP bounce handling is managed by the operator's mail infrastructure; only Resend has automated bounce callbacks in v1.

Email destinations must explicitly confirm a verification link before they receive monitoring updates. Verification sends and test notifications are rate-limited. Unsubscribe disables the destination across projects. No tracking pixels are added.

Anonymous account IDs are remembered without notifications, so a later observed conversion does not become a new-account alert. If an anonymous account is created and converted entirely between polls, polling alone cannot distinguish it from a new permanent account. Deduplication records around a stalled cursor are retained through prolonged outages; visible event history is limited to 30 days. Pending deliveries are retained until they reach a terminal outcome.
