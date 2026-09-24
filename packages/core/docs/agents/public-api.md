# Core public API

## Implemented today

This is an internal source-level API, not a published SDK. Import the defining file; no package export map or semver compatibility guarantee is implemented.

- model.ts exports every domain type/port listed in 02 plus AppError/assert.
- store.ts exports Project, Connection, Source, Destination, Delivery, Job, Metric, Challenge, Snapshot, ProjectOverview, MonitorStore.
- time.ts exports localDay(now, timezone), dailyReady(now, timezone, time), reportingDates(now, days=7), validTimezone(value), shortAccount(id).
  For a caller in packages/backend/src, an existing import pattern is:

```ts
import { reportingDates } from "../../core/src/time";
const dates = reportingDates(new Date()); // yesterday and six earlier UTC dates
```

MonitorStore methods carry workspace IDs on public reads/mutations; worker-only update methods can accept IDs alone after trusted resolution. See db memory for actual transaction and authorization behavior.
