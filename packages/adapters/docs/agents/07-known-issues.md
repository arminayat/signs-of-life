# Adapters known issues

## Implemented today

- **Resolved/covered: organization catalog loss.** Symptom: accessible Supabase projects disappear when organization lookup fails → cause: optional metadata treated as required → fix: listSupabaseCatalog catches organization failures and still returns projects with nullable organizationName; matches slug or legacy ID → prevention: tests/adapters.test.ts.
- **Active constraint: ambiguous sends.** Symptom: timeout does not say whether a message arrived → cause: external send cannot be atomic with local state → implemented approach: Telegram network/5xx and ambiguous SMTP failures return uncertain; Resend returns an idempotent retry result → prevention: do not force these outcomes to failed/success; backend owns retry windows.
- **Resolved/covered: corrupt Apple TSV looks like zero.** Cause: permissive parsing could mask missing columns/invalid rows → fix: parseSalesReport throws apple_report_format_changed or apple_report_row_invalid → prevention: keep malformed-report tests; distinguish HTTP 404 null from an empty valid report.
- **Active configuration constraint:** SMTP on Cloudflare cannot run through this composition → config rejects it and Node alone imports smtpTransport → prevention: use Resend on Cloudflare (tests/auth.test.ts).

## Implemented today — monitoring footguns

- **Resolved/covered:** PostHog count double-counted repeat people across days → count sums intervals → request BoldNumber aggregated_value separately; never synthesize period unique users.
- **Resolved/covered:** modern Stripe charge payloads omit invoice linkage → treating omission as standalone payment duplicates invoice alerts → pin API reads to 2024-06-20 and hydrate incomplete charge events before normalization.
- **Resolved/covered:** RevenueCat refunds looked like cancellations → provider uses CANCELLATION/CUSTOMER_SUPPORT → classify refund; do not infer refund amount from original price. Billing-error cancellation is ignored in favor of BILLING_ISSUE.
- **Active coverage constraints:** Auth0 dense identical-timestamp history needs a paid-plan minimal-field export; failure stays visible instead of silently truncating. WorkOS event windows are at most 29 days and retention is 90 days; existing-user history excludes deleted accounts.
- **Security boundary:** Better Auth targets require an operator hostname allowlist, public DNS, HTTPS, no redirects, 20-second/4 MB limits. Node pins the checked address; Workers use public fetch with global_fetch_strictly_public and no private network binding. Keep deployment flags and transport together.

- **Resolved/covered:** temporary provider unavailability ignored Retry-After → only 429 carried delay metadata → 503 also propagates the bounded delay; Stripe charge hydration uses five concurrent reads and 25-event live pages → transport/adapter regression tests.
