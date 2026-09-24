# Core known issues

## Implemented today — retained contract footguns

- **Active constraint: unavailable versus zero.** Symptom: missing Apple reports appear as zero → cause: collapsing null and [] → existing convention: ReportSource.report returns null for unavailable, db writes zero only for an available report → prevention: preserve both cases through callers (tests/apple-jobs.test.ts).
- **Resolved/covered: reporting dates shifted by local timezone.** Symptom: daily schedule and Apple date disagree → cause: these are separate clocks → existing approach: dailyReady/localDay use the project zone; reportingDates uses previous UTC dates → prevention: retain DST assertions in tests/adapters.test.ts.
