# Adapters known issues

## Implemented today

- **Resolved/covered: organization catalog loss.** Symptom: accessible Supabase projects disappear when organization lookup fails → cause: optional metadata treated as required → fix: listSupabaseCatalog catches organization failures and still returns projects with nullable organizationName; matches slug or legacy ID → prevention: tests/adapters.test.ts.
- **Active constraint: ambiguous sends.** Symptom: timeout does not say whether a message arrived → cause: external send cannot be atomic with local state → implemented approach: Telegram network/5xx and ambiguous SMTP failures return uncertain; Resend returns an idempotent retry result → prevention: do not force these outcomes to failed/success; backend owns retry windows.
- **Resolved/covered: corrupt Apple TSV looks like zero.** Cause: permissive parsing could mask missing columns/invalid rows → fix: parseSalesReport throws apple_report_format_changed or apple_report_row_invalid → prevention: keep malformed-report tests; distinguish HTTP 404 null from an empty valid report.
- **Active configuration constraint:** SMTP on Cloudflare cannot run through this composition → config rejects it and Node alone imports smtpTransport → prevention: use Resend on Cloudflare (tests/auth.test.ts).
