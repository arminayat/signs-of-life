# Jobs runtime overview

## Implemented today

Background execution host for the collection/delivery pipeline. Node claims PostgreSQL jobs directly in a loop; Cloudflare Cron dispatches due IDs and Queue consumption calls the same backend runOne.
PostgreSQL retains jobs, schedules and leases; Queue messages are transport hints, not the source of truth. No public HTTP server, browser UI or provider-specific business logic lives here.

## Planned/aspirational

No separate workflow engine or worker dashboard is present. Keep pipeline behavior in packages/backend.
