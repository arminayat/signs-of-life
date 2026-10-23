# Core known issues

## Implemented today — retained contract footguns

- **Active constraint: unavailable versus zero.** Symptom: missing Apple reports appear as zero → cause: collapsing null and [] → existing convention: ReportSource.report returns null for unavailable, db writes zero only for an available report → prevention: preserve both cases through callers (tests/apple-jobs.test.ts).
- **Resolved/covered: reporting dates shifted by local timezone.** Symptom: daily schedule and Apple date disagree → cause: these are separate clocks → existing approach: dailyReady/localDay use the project zone; reportingDates uses previous UTC dates → prevention: retain DST assertions in tests/adapters.test.ts.
- **Resolved/covered: worker-contract gap.** Collection/report/metric writes, health, delivery outcomes, daily fanout, inbox completion and provider delays require a Job. Production callers cannot omit the claim; db validates ownership through commit. Direct test fixture setup obtains synthetic real claims, without a production bypass. Database-reliability tests cover stale writes, disconnect and metric freshness.

- **Resolved/covered: inconsistent calendar boundaries.** Server/client range bounds now use project-local strict calendar labels through `calendarRange` and `validateCalendarRange`; invalid normalized dates and future local dates are rejected. Provider reporting labels keep their existing timezone contract. Root calendar/API tests cover leap dates, UTC boundary differences and daylight-saving transitions.
