# Core public API

## Implemented today

This is an internal source-level API, not a published SDK. Import the defining file; no package export map or semver compatibility guarantee is implemented.

- model.ts exports every domain type/port listed in 02 plus AppError/assert.
- store.ts exports Project, Connection, Source, Destination, Delivery, Job, Metric, Challenge, Snapshot, ProjectOverview, MonitorStore.
- time.ts exports localDay(now, timezone), calendarRange(now, timezone, days), validateCalendarRange(range, now, timezone, maxDays=365), dailyReady(now, timezone, time), reportingDates(now, days=7), validTimezone(value), shortAccount(id).
  For a caller in packages/backend/src, an existing import pattern is:

```ts
import { reportingDates } from "../../core/src/time";
const dates = reportingDates(new Date()); // yesterday and six earlier UTC dates
```

MonitorStore methods carry workspace IDs on public reads/mutations; worker-only update methods can accept IDs alone after trusted resolution. See db memory for actual transaction and authorization behavior.

## Implemented today — expanded monitoring

monitoring.ts, provider-registry.ts and monitor-store.ts are source-level imports. Amounts and provider measurements use decimal strings. Null, zero, unsupported, partial and unavailable are distinct; period unique users/rates must come from providers. Observation.candidate never grants a verified identity; backend authenticates a referenced object before setting reference.

ChannelKind includes telegram, email, slack and discord. Destination.secret is nullable encrypted webhook data; Snapshot omits secret and unsubscribeHash. Google Play and Lemon Squeezy use the existing ProviderAdapter interface and credential/resource metadata. No new job kinds are needed.

Observation.occurredAtSource="payment_webhook" is emitted only for authenticated invoice payment transitions. It permits correction of an imported invoice-creation fallback and notification through the existing one-time canonical claim; it is never accepted as a client field.

`authentication.ts` exports the pure Authentication interface; adapters implement it. `ProviderAdapter.definition?` supports one saved definition lookup without traversing a catalog. MonitoringStore adds `monitoringState` for configuration without cached report bodies. MonitorStore adds focused `deliveryEligibility`, atomic `reserveDueJobs`/`releaseDispatch`, `jobDiagnostics`, fenced `updateConnectionHealth`/`fanoutForJob`, and a boolean backlog result from `cleanup`. Worker write signatures require Job ownership; configuration mutations are separate.

`calendarRange` derives inclusive bounds from the project's local date. `validateCalendarRange` accepts only real, canonical YYYY-MM-DD labels, rejects reversed/future ranges and enforces the 365-day retention boundary in that timezone. Calendar arithmetic uses UTC as a representation of date labels so daylight-saving transitions do not shift them. Provider reporting labels remain provider-defined; `reportingDates` still returns previous UTC Apple reporting dates.
