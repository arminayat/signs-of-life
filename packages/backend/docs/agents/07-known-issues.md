# Backend known issues

## Implemented today

- **Resolved/covered: unsafe ambiguous-send retries.** Symptom: duplicate Telegram/SMTP message after worker interruption → cause: non-idempotent external send → fix: runner marks interrupted sending uncertain; Resend retries use same delivery ID within 23 hours and eight provider attempts → prevention: preserve tests/jobs.test.ts and delivery-retry.test.ts.
- **Resolved/covered: another project's deliveries crowd out history.** Cause: filtering after a global latest-100 read → fix: project dashboard passes projectId into snapshot so SQL filters deliveries first → prevention: tests/project-overview.test.ts.

## Implemented today — monitoring regressions

- **Resolved/covered:** Apple reconnect appeared healthy but its collector stayed failed → no re-enqueue → reconnect calls resumeConnection without changing history → retain monitoring-security tests.
- **Resolved:** Supabase Connect appeared with only a client ID → capability check omitted secret → config now requires both credentials.
- **Resolved/covered:** stale refresh could restore disconnected credentials → unconditional secret write → active/ciphertext/lease CAS plus conditional lease release → retain disconnect-race tests.
- **Active provider boundary:** RevenueCat has no project-wide historical billing-event feed → aggregates cannot reconstruct missed webhooks → import native chart history, label event coverage incomplete and require authenticated webhooks. No email/customer-string fallback is allowed.

- **Resolved/covered:** an expired worker overwrote a newer worker’s error → error handling was outside the page lease fence → job_lease_lost exits without health/checkpoint mutation → stale-worker health regression test.
