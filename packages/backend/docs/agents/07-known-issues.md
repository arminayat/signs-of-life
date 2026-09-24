# Backend known issues

## Implemented today

- **Open, code-confirmed; reproduction not run: Apple reconnect does not requeue a terminated collector.** Symptom: credentials show connected but a job terminated while disconnected stays failed → cause: runner treats connection_not_found_or_disconnected as terminal; Apple POST saves credentials without enqueue; Supabase callback explicitly enqueues existing sources → fix/workaround: none implemented/verified for Apple reconnect → prevention: add a reconnect lifecycle test and reactivate the job (06).
- **Open, code-confirmed: Supabase availability is only a client-ID check.** Symptom: /api/config can advertise sources.supabase=true but Connect fails supabase_oauth_not_configured → cause: api.ts checks client ID, services.ts requires ID and secret → current operational workaround: configure both; not a new live verification → prevention: align availability check (06).
- **Resolved/covered: unsafe ambiguous-send retries.** Symptom: duplicate Telegram/SMTP message after worker interruption → cause: non-idempotent external send → fix: runner marks interrupted sending uncertain; Resend retries use same delivery ID within 23 hours and eight provider attempts → prevention: preserve tests/jobs.test.ts and delivery-retry.test.ts.
- **Resolved/covered: another project's deliveries crowd out history.** Cause: filtering after a global latest-100 read → fix: project dashboard passes projectId into snapshot so SQL filters deliveries first → prevention: tests/project-overview.test.ts.
