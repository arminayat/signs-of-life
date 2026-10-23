# Backend known issues

## Implemented today

- **Resolved/covered: ambiguous-send outcomes.** Interrupted non-idempotent sends become uncertain. Resend retries preserve prior uncertainty even after permanent rejection, routing cancellation or a missing channel; a pre-send attempt cap prevents a ninth send after an interrupted outcome write. Retain tests/backend-reliability.test.ts, delivery-retry.test.ts and jobs.test.ts.
- **Resolved/covered: another project's deliveries crowd out history.** Cause: filtering after a global latest-100 read → fix: project dashboard passes projectId into snapshot so SQL filters deliveries first → prevention: tests/project-overview.test.ts.

## Implemented today — monitoring regressions

- **Resolved in source: needless minute recurrence.** Completed account polls and daily-summary readiness checks now wait five minutes; prompt delivery and catch-up schedules stay independent. Daily checks are capped at today's upcoming exact local daily time so a five-minute delay cannot skip a 23:59 window. Retain monitoring-cadence regressions for timezone/DST scheduling, completed versus partial pages, and historical termination. Queue acknowledgement still does not prove application success, and usage savings require post-deployment measurement.

- **Resolved/covered:** Apple reconnect appeared healthy but its collector stayed failed → no re-enqueue → reconnect calls resumeConnection without changing history → retain monitoring-security tests.
- **Resolved:** Supabase Connect appeared with only a client ID → capability check omitted secret → config now requires both credentials.
- **Resolved/covered: refresh races.** Supabase and expanded monitoring now compare active connection ciphertext and the current refresh lease before replacement, then release only that lease. A reconnect cannot be overwritten by an old grant and a newer lease cannot be cleared; retain reconnect/disconnect tests.
- **Active provider boundary:** RevenueCat has no project-wide historical billing-event feed → aggregates cannot reconstruct missed webhooks → import native chart history, label event coverage incomplete and require authenticated webhooks. No email/customer-string fallback is allowed.

- **Resolved in source: stale workers.** Supabase/Apple collection, metric results, delivery updates, webhook removal, daily fanout and worker-health writes require a job argument and transactional current-lease checks. Provider-error persistence also catches job_lease_lost without overwriting newer state. Retain DB interleaving tests and backend-reliability stale-error coverage; a lease fence does not make external sends atomic.

- **Resolved test-isolation issue:** static fake webhook URLs hit the global recipient throttle when the lifecycle suite is rerun → workspace cleanup intentionally does not remove recipient rate-limit keys → tests generate unique provider-shaped URLs per fixture while preserving production throttling. Verified with consecutive webhook-destination suites.

- **Resolved/covered:** Discord could render underscores in verification codes as Markdown emphasis, making the copied code incorrect → Discord verification messages wrap only the code in inline-code formatting; Slack retains plain text with Markdown disabled → webhook-destination regression verifies an underscore-bearing code is preserved and confirms successfully.

- **Resolved in source: needless minute recurrence.** Completed account polls and daily-summary readiness wait five minutes; catch-up pages keep their existing fast continuation. The upcoming exact local daily time caps a daily delay to avoid skipping 23:59. `tests/monitoring-cadence.test.ts` covers completion, backlog, historical termination, midnight and DST. Actual usage savings require post-deployment measurement.
- **Resolved/covered: delayed native reports absent from summaries.** Native summaries revisit the previous 14 project-calendar dates, exclude notification-start history and skip existing date/view delivery keys. The delayed-publication regression now sends each eligible date once. The bounded window deliberately avoids unlimited replay after longer outages; historical charts remain available.
- **Resolved/covered: optional matching blocks primary observations.** Credential retrieval and lookup share the same recoverable reconnect/permission/not-found boundary. An unavailable optional Stripe grant leaves RevenueCat observations unresolved instead of discarding or indefinitely blocking them. Exact-reference matching remains required.
- **Resolved/covered: unsubscribe capability in error logs.** API errors log the matched route template instead of the raw pathname; the failing-unsubscribe regression confirms its token is absent.
- **Resolved in source: project-local range bounds.** Overview and metric-query validation use core validateCalendarRange with the owned project timezone, matching the frontend range builder. Scheduled live/history report refreshes use calendarRange with that same timezone; otherwise midnight offsets create different metric cache keys. Provider-native date labels remain unchanged. Retain timezone boundary, leap-date and scheduled-calendar tests (both offsets, DST and 365-day history).
