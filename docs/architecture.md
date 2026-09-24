# Architecture

The dashboard is static React/Vite using HeroUI and Tailwind. It calls a same-origin Hono API under `/api`. The API handles authentication, tenant authorization and configuration. Separate workers collect sources and deliver notifications.

## Provider interfaces

`MonitorStore`, `Authentication`, `AccountSource`, `ReportSource`, `Channel`, `EmailTransport` and `SecretBox` contain the replaceable contracts. The composition layer selects implementations. No Cloudflare bindings appear inside application use cases. No browser gets a database credential.

PostgreSQL is the v1 database engine. Drizzle schemas and migrations live in `signs_of_life` and `signs_of_life_identity`, outside Supabase's default exposed Data API schemas. Hosting can change between Supabase, Neon and an ordinary PostgreSQL server without changing application queries. Other SQL engines require a persistence adapter and their own migrations, not just a connection-string change.

Better Auth is the default identity provider and stores its records through Drizzle. Supabase Auth is an alternative for platform login, independent of Supabase's monitoring-source OAuth connection. External identities map `(issuer, subject)` to an application user UUID. Nothing links identities by email.

## Durable execution

PostgreSQL is the source of truth for jobs, schedules, attempts, leases and deliveries. Jobs are claimed with a transaction and `FOR UPDATE SKIP LOCKED`. Lease tokens fence completion, and expired claims are recoverable. Recurring collectors reschedule themselves.

Cloudflare Cron dispatches due job IDs through Cloudflare Queues. Dispatch stamps expire, so a failed or dead-lettered message can be recovered from the database. The Node worker claims the same persisted jobs directly. Queue infrastructure is not required for self-hosting.

Account events, cursor progress and delivery jobs are written in one transaction. Source event keys and per-destination delivery keys prevent repeated notifications during overlap reads or duplicate queue dispatches. Collection uses bounded requests and catch-up cursors.

External sends cannot be made atomic with PostgreSQL. Telegram and SMTP timeouts, or interrupted sends, become `uncertain`. Resend uses its idempotency key for retries within its provider window. `accepted` means provider acceptance, not confirmed receipt by the person. Each channel has its own delivery record.

Notification retries stop after eight provider attempts. The first send time bounds Resend retries to 23 hours, including retries pending after an outage. Any earlier ambiguous result remains uncertain if later attempts fail to resolve it.

## Collection semantics

Supabase polls `auth.users` through the read-only Management API. It reads ID, creation time, provider and anonymous status. New unconfirmed accounts count; login events, updates and conversions of existing anonymous accounts do not. A five-minute overlap catches late transactions; very late commits or accounts deleted between polls can be missed. Monitoring starts at source connection time, without historical alerts.

Apple reports are shared by sources attached to a vendor connection within a workspace. Raw reports are parsed and discarded. An available complete report with no rows for a selected app produces zero metrics; unavailable reports stay pending. Seven reporting dates are rechecked, with monotonic metric revisions for corrections. Historical import does not flood notifications. Daily delivery uses the project's timezone; message dates remain Apple's report dates.

## Security and retention

Application services enforce workspace ownership; composite foreign keys prevent cross-workspace source and destination references. Credentials are AES-GCM encrypted with per-record authenticated context. Encryption key maps support rotation. Keep the active and older keys with database backups.

Email verification requires a POST confirmation. Telegram connection tokens are single-use and expire after ten minutes. Webhooks require provider signatures or the installation's Telegram secret. Public unsubscribe GET requests only render a confirmation page; POST disables the destination. Rate limits cover destination creation, verification and test messages.

Event/delivery history lasts 30 days; selected-app metrics last 90 days. Disconnect clears provider credentials and stops collection. Project/workspace deletion cascades owned records. Deleting a workspace leaves the external login account with its identity provider; the UI describes deletion of the monitoring workspace only.

Anonymous account IDs are remembered without notifications, so a later observed conversion does not become a new-account alert. If an anonymous account is created and converted entirely between polls, polling alone cannot distinguish it from a new permanent account. Deduplication records around a stalled cursor are retained through prolonged outages; visible event history is limited to 30 days. Pending deliveries are retained until they reach a terminal outcome.

The Connections dashboard resolves active Supabase connection labels from the existing project catalog. Each project displays its organization name followed by its project name. Grants covering multiple projects show one organization/project pair per line; unavailable or empty catalogs fall back to the saved connection label. Organization metadata is optional: if that lookup fails, project names remain available. This also applies to previously connected accounts without a migration or reconnection.

The Add a source dialog uses the same cached catalog, showing only distinct organization names in the connection selector and app/project names in the subsequent source selector. Supabase catalogs load when the dialog opens, so connections can be identified before selecting one.

## Project views

Entering a project collapses workspace navigation to an icon rail and opens a second sidebar with Overview, Sources and Notifications. Each view has a persistent URL under `/projects/:id`; the project root redirects to Overview. On small screens both navigation groups become compact rows. Leaving a project restores the full workspace sidebar.

Overview reads `/api/projects/:id/overview`, which authorizes the project against the signed-in workspace and aggregates 30 calendar days directly in PostgreSQL. Supabase counts exclude anonymous accounts and group observed events by the project's timezone. They represent accounts observed since source connection, not total registered users or historical imports. App Store charts use Apple's reporting dates and stored corrected metrics. Missing reports remain absent, reported zeros remain zero, and days with only some source reports are marked partial. Dates before collection and dates after the latest successful account collection remain blank unless an event was observed. Charts include daily-value tables.

Notifications shows project-scoped recent deliveries, notification pause/resume, and a modal for preferences and destination routing. Its dashboard request scopes deliveries before the latest-100 limit, so other projects cannot crowd out this project's history. Workspace-level dashboard behavior is unchanged. Sources retains source connection/removal controls. This change needs no migration, new environment variable, or provider permission; deploy the API and web app together.
