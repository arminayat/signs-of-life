# Core conventions

## Implemented today

Source uses named exports, extensionless relative imports, strict TypeScript, semicolons and double quotes. Provider/job differences are discriminated unions, with interfaces for I/O boundaries.
Snapshot omits connection secret/refreshLease and destination unsubscribeHash/secret at the type level; db must also remove these at runtime. ReportSource returns null for unavailable reports and [] for complete reports without relevant rows. AccountEvent retains anonymous observations.

## Planned/aspirational — maintenance rules

Keep runtime/provider SDKs and SQL out of core. Change interfaces with all db/backend/web callers and contract tests in the same change. Keep status strings accurate: persisted Delivery.status is string, not a constrained enum. Do not imply types validate external payloads.

Calendar validation uses the project timezone for dashboard range limits and rejects normalized invalid dates such as February 30. Calendar labels and provider reporting dates remain distinct; never convert a native provider report label by subtracting a project timezone offset. Worker mutation calls require a Job; test fixtures acquire real claims instead of relaxing production signatures.
