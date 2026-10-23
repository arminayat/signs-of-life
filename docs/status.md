# Implementation and acceptance

This document distinguishes implemented behavior, automated verification and live acceptance. Update it before release.

## Four additional integrations — 2026-10-17

### Implemented today — local source

- Google Play Console discovers apps from private reporting buckets and provides install, uninstall and country-specific rating reports. Reports retain provider dates, missing/partial states and publication delay; no individual install alerts are inferred.
- Lemon Squeezy discovers stores and reconciles orders/subscription invoices, with authenticated billing webhooks and environment isolation. Initial purchases and refunds share stable identities; signed invoice recovery can advance a silently imported event and notify once. Partial refunds count a refunded payment without inventing amounts. No customer profiles or raw payloads are retained.
- Slack and Discord destinations encrypt webhook URLs, verify channel access with an expiring code, and support project routing and test messages. Pending destinations cannot be selected for routing. Ambiguous sends remain uncertain. Google Play country filters can be entered and are visible in saved view labels.
- Additive migration **0011_webhook_destinations** adds a nullable encrypted destination secret. No new environment variables or runtime bindings are required. Apply `pnpm db:migrate`, then restart/deploy compatible API, jobs and web builds; customer credentials and channel webhook URLs are configured through the dashboard. See [setup](monitoring-integrations.md) and [channel setup](integrations.md#slack-and-discord).

### Automated verification — local and CI

- `pnpm check` passes: TypeScript, **232 tests across 25 files**, connector build and web production build. PostgreSQL tests ran against a temporary isolated PostgreSQL 18 database ending in `_test`, with fixture providers. Coverage includes fresh/legacy/repeated migrations, Google token/report handling, Lemon payment/refund transitions, duplicate delivery prevention, channel URL validation, encrypted snapshots and channel verification (including Discord Markdown-safe codes).
- API, jobs and web Cloudflare bundle dry runs pass. A real local workerd transport regression verifies successful requests and rejected redirects; provider/channel requests use manual redirect handling because Workers rejects redirect:error. The existing Vite main-chunk size advisory remains; route splitting is tracked in the web backlog.
- Release commit `93f647b4dddf2a7b5f17bc97282436a39940d3b5` was pushed to main. [GitHub Actions run 39058143751](https://github.com/arminayat/signs-of-life/actions/runs/39058143751) passed check and container jobs, including its existing isolated browser suite. No local or production application browser testing was performed.

### Deployed and verified — 2026-10-17

- A private PostgreSQL backup and restoration keys were saved before applying `0011_webhook_destinations` through the repository migration runner. All 12 migration hashes match source; project/source/connection/destination counts and encrypted connection credential digest were preserved. The nullable text column and runtime SELECT/INSERT/UPDATE grants were verified.
- API, jobs and web were deployed from the isolated release commit, preserving hosted variables. Worker versions: API `633fd311-c405-46a2-aca4-e77a14d024de`, jobs `1f30b726-1803-403f-b77b-41547f4703fd`, web `e0b24cb5-2f53-496b-8ee2-1554b5a6ef5b`.
- Hosted health/readiness return HTTP 200 with the release revision. Config enables Google Play, Lemon Squeezy, Slack and Discord. Root/deep-link HTML and referenced JS/CSS match the release build byte-for-byte; unauthenticated projects/destinations return 401. Post-deploy database inspection found no source errors or failed jobs; six jobs were pending.
- Real Google reports, Lemon billing events and observed Slack/Discord messages remain separate acceptance steps. No real provider or recipient acceptance is claimed. Earlier sections below are historical evidence for their stated revisions.

## Implemented

- React/Vite dashboard with HeroUI, Tailwind, light/dark themes and responsive layouts.
- Hono API, Drizzle PostgreSQL schema/migrations, tenant-scoped repositories and credential encryption.
- Better Auth default and Supabase Auth alternative; explicit identity migration and versioned session cookies.
- Read-only Supabase OAuth account source and Apple Sales and Trends reporting source.
- Telegram, email, Slack and Discord destinations, verification, routing, tests and delivery history; email unsubscribe.
- Cloudflare API/static/job entrypoints, durable database jobs, Queues dispatch and Node job runner.
- Docker Compose, configuration examples, CI and operator documentation.

## Verified during implementation

- Drizzle migrations apply to isolated local PostgreSQL 18.
- 37 backend tests pass using real PostgreSQL and fake external providers, including both authentication adapters, concurrent first-login resolution, OAuth callback replay, retry limits, a local SMTP protocol exchange, and fresh/legacy database rename migrations.
- Six desktop/mobile browser tests pass using an isolated fixture host and actual API/database operations.
- All three Cloudflare bundles build in Wrangler deployment dry runs. The local Cloudflare runtime also passes readiness, signed Better Auth session, project creation/readback and workspace deletion checks.
- GitHub Actions passes the full checks and builds/starts the complete Docker stack with PostgreSQL 17, migration, API, jobs and frontend. Container readiness and SPA routing pass. The `9a19f2f` release check passed in run `35986972446`.
- The AGPL repository is public at https://github.com/arminayat/signs-of-life. A staged-source secret scan passed before publication.

## Signs of Life rename verification

- The app, notification copy, packages, cookies, deployment templates and documentation use Signs of Life.
- Migration 0003 renames application/auth schemas; the migration runner preserves and renames the existing migration ledger. Fresh installation, existing user/project preservation, foreign-key cascades and repeated migration are covered by PostgreSQL tests.
- Both local application and test databases were backed up and renamed to `signs_of_life` and `signs_of_life_test`. Before/after row counts and content digests match for all 21 tables in the application database. The renamed test database passes the complete automated suite.
- Type checking, all 36 backend tests, all six isolated desktop/mobile browser tests, production build and all three Cloudflare bundle dry runs pass for the rename.
- The local checkout was renamed to `signs-of-life`; PostgreSQL and the development app restart from that path. The API readiness endpoint returns HTTP 200 and the web page title is Signs of Life.
- The GitHub repository was renamed to `arminayat/signs-of-life`. Commit `7e4937d` published the rename, and its GitHub Actions checks passed. Hosted migrations, resource cutover and provider display names remain deployment steps described in the [rename guide](renaming.md).

## Hosted deployment preparation

- The intended public hostname is `https://sol.arminayat.dev`; API and job configuration use this canonical origin, and the web Worker declares it as a custom domain.
- The `signs-of-life-jobs` and `signs-of-life-dead-letter` Cloudflare queues exist. Production auth and encryption secrets have been generated outside Git.
- The production GitHub OAuth app `Signs of Life` is registered with homepage `https://sol.arminayat.dev` and callback `https://sol.arminayat.dev/api/auth/callback/github`. Its client credentials are stored outside Git; hosted login has not been tested.
- The dedicated Supabase `sol` PostgreSQL project (`riqmsygjapubslqpnadn`) is healthy in West EU (Ireland). All four Drizzle migrations have been applied, creating the private application and identity schemas. A restricted runtime role has table access without superuser privileges. Data API settings expose `public` and `graphql_public`, not the application schemas.
- Hyperdrive `signs-of-life-db` connects to the direct database endpoint with verified TLS, a ten-connection limit and query caching disabled.
- API, jobs and web Workers were deployed from `9a19f2f`; the web Worker owns the `sol.arminayat.dev` custom domain. The public page serves Signs of Life, `/api/health` and database-backed `/api/ready` return HTTP 200 with that revision, and `/api/config` reports GitHub login enabled. Starting login returns a GitHub authorization URL and a session cookie; the callback has not been completed with a real account.

## Supabase monitoring setup — 2026-09-24

- Published the installation-owned `Signs of Life` OAuth app in the `sol` organization with only `organizations:read`, `projects:read` and `database:read` permissions.
- Registered `https://sol.arminayat.dev/api/connections/supabase/callback` and stored the client ID and secret in both `signs-of-life-api` and `signs-of-life-jobs` Worker secret stores.
- The live `/api/config` now reports `sources.supabase=true`; `/api/ready` passes on revision `9a19f2f`. No application code deployment or database migration was needed.
- The same OAuth app also allows the localhost callback. A distinct local client secret is stored only in the ignored `.env`; after restarting the local stack, `/api/config` reports `sources.supabase=true` and `/api/ready` returns HTTP 200.
- Customer authorization, project selection and real account collection have not yet been verified. Registration alone does not grant access to a monitored project.

## External acceptance still required

- A completed Supabase monitoring authorization/project connection. Hosted GitHub login was verified separately in the 2026-10-04 acceptance attempt below.
- A Telegram bot/webhook and received test notification.
- Resend sender verification and a received email notification.
- A real App Store Sales and Trends report matched to the app's reporting dashboard.
- Read-only connection to Kapier with evidence that its database/Auth configuration is unchanged.
- Hosted readiness, login and collection/delivery checks against the deployed revision.

Fixtures, dry runs and provider acceptance responses do not satisfy these live checks. No Kapier files or provider configuration have been changed by this project setup.

## Project views — 2026-09-24

- Project URLs now open Overview by default, with a dedicated sidebar for Overview, Sources and Notifications. Workspace navigation collapses to icons while inside a project and expands on exit; mobile navigation uses compact rows.
- Notifications retains pause/resume and recent deliveries, with preferences edited in a modal. Delivery history is scoped to the project before applying its 100-record limit.
- Overview displays 30-day KPIs and daily charts for observed Supabase accounts, App Store initial downloads and redownloads. Tenant-authorized PostgreSQL aggregates avoid the dashboard event-feed cap; chart tables distinguish missing reports from zero reports and label partial App Store coverage.
- `pnpm check` passes (type checking, 41 backend tests, production build). Eight isolated desktop/mobile browser tests pass, including navigation/deep-link reload, preference persistence, populated KPIs/chart tables, empty states and overflow checks. API and web Cloudflare bundle dry runs and `git diff --check` pass.
- No database migration, environment variable or provider-permission change is required. API and web were deployed together from `4363bdd55632862855e1c58596d7becaa389aab9`; the jobs Worker is unchanged.
- Live API version `a8e06a11-01ad-4e1f-b2c4-3516933b3e5a` and web version `1c15c1e3-6ce5-4843-8d64-1945ba962843` serve `https://sol.arminayat.dev`. Health and database readiness return HTTP 200 with the release revision; live HTML, JavaScript and CSS match the release build. Overview, Sources and Notifications deep links return the SPA, and both new API endpoints reject unauthenticated requests with HTTP 401.
- GitHub Actions [run 36008359310](https://github.com/arminayat/signs-of-life/actions/runs/36008359310) passes application checks and container readiness/routing. A bounded API error tail observed no failed invocations. Production authenticated project data and real provider collection/delivery remain separate acceptance checks.

## Project-owned connections deployment — 2026-09-24

- Workspace Connections navigation is removed. Creating a project opens Sources, where Supabase and App Store Connect onboarding creates a project-owned connection and continues to source selection.
- Migration 0004 was applied to production after a private PostgreSQL backup. The existing connection is project-owned, its credential is retained, and no source has a mismatched project. The migration ledger now contains five entries.
- API version `1ad4b89b-a985-4519-9be9-b28db036dc2b` and web version `083803ed-606c-4317-be0d-2126054490c0` deploy revision `8ca21d1` at `https://sol.arminayat.dev`. Jobs retain their previous deployment.
- Health, database readiness and configuration return HTTP 200 with revision `8ca21d1`. Served HTML, JavaScript and CSS match the isolated release build byte-for-byte. Supabase monitoring remains enabled.
- Type checking, 42 backend/database tests and the production build pass. The initial CI run caught a missing GitHub icon export from overlapping local edits; the isolated release includes its required component. No local browser checks or live provider authorization were performed for this deployment.
- GitHub Actions [run 36038109807](https://github.com/arminayat/signs-of-life/actions/runs/36038109807) passes application checks, the repository's automated browser suite, all three Worker bundle checks, and Docker readiness/routing. A bounded 25-second API error tail observed no error events.

## Ten-provider expansion — 2026-09-26

### Implemented today — source

- Added Stripe, Polar, Paddle, RevenueCat, PostHog, GA4, Better Auth, WorkOS, Clerk and Auth0 monitoring, with credential/OAuth setup, actual resource discovery, independent import/live checkpoints and health, normalized billing webhooks, verified-reference deduplication and per-source event preferences. Existing operator authentication, Supabase and Apple remain supported.
- Overview now has configurable Growth, Revenue and Usage views, native metrics/funnels/cohorts and retained date ranges. Missing/partial/unsupported values, provider reporting basis and currencies remain distinct. Native daily series retain twelve months independently of query caches; history imports are silent.
- Added the distributable Better Auth server connector and its own agent KB; root routing now lists eight maintained children. Default source capacity is 25, with operator overrides preserved. Apple reconnect resumes collection; additive migrations 0005–0010 preserve records, repair missing daily jobs, separate environments and make notification claims atomic.

### Automated verification — isolated release and CI

- `pnpm check` passed: TypeScript, **132 tests across 18 files**, connector build and web production build. Tests use isolated PostgreSQL databases and fixture providers, including fresh/legacy/repeated migrations, auth history beyond one page, webhook authentication, OAuth state/refresh races, private-URL protections, muted-first-source deduplication, expired-worker fencing, money precision and retained metric series.
- API, jobs and web Cloudflare bundle dry runs passed with Wrangler 4.130.0. The connector build/pack was checked for its JS/types/README/license package contents. `git diff --check` and a 95-document agent-KB/local-link audit passed. No implementation module exceeds 500 lines.
- Vite reports its existing advisory that the main JavaScript chunk is above 500 kB (approximately 552 kB, 171 kB gzip); route splitting is recorded in the web backlog.
- No local or production browser testing was performed. The existing push-triggered GitHub Actions [run 36231903926](https://github.com/arminayat/signs-of-life/actions/runs/36231903926) passed its standard application checks, fixture browser suite, Worker bundle checks and Docker readiness/routing for release `41e421f`. A staged-source Gitleaks scan found no secrets.

### Implemented today — production deployment verified 2026-09-26

- Pushed feature commit `41e421f898a0d46a69338fed5fb3cb605af2f510` to `main`; built and deployed from an isolated checkout that excludes unrelated local UI/development changes.
- Backed up private application, identity and migration schemas plus restoration keys outside Git, then applied **0005–0010**. All eleven ledger hashes match the repository. Before/after counts preserved two projects, one source and one connection; the encrypted connection credential digest is unchanged. Every project has a daily job, and restricted-runtime-role project/overview/monitoring reads pass.
- API version `8d40411a-9a0d-459a-bd8e-034750d475ee` and jobs version `492ce033-265b-42cf-b051-0ab2183ee4a1` serve `41e421f`. Jobs were deployed before API/web; the minute Cron and queue producer/consumer remain configured. Existing secrets and operator variables were retained with `--keep-vars`.
- Hosted verification exposed an existing asset-routing gap: static pages bypassed the Worker's response headers. Follow-up commit `1d78050bf0a7a4efa3d72023157f276249097264` adds `public/_headers`; production build and web bundle dry run pass. Web version `906cf3cf-244d-41d6-9d50-37254ef167c2` deploys that fix at `https://sol.arminayat.dev`; API/jobs code is unchanged by the follow-up.
- Health/readiness/config return HTTP 200 with `41e421f`. Hosted root, Overview, Sources and Notifications HTML plus JavaScript/CSS match the isolated release build; HTML now includes CSP, nosniff and referrer policy. The three new protected monitoring/metric read routes reject unauthenticated requests with HTTP 401. Login initiation returns a GitHub authorization URL and cookie; the real-account callback was not completed.
- Existing source collection advanced from 09:10:36 to 09:16:33 UTC after deployment; daily jobs also advanced. The 09:17 UTC readback found no failed/error jobs, jobs overdue by five minutes, or source errors. Bounded connected API/jobs error tails observed no failed invocations; this is observation of the window, not a guarantee of future health.
- Hosted config reports all ten credential-based integrations and the 25-source default. Optional new-provider OAuth registrations remain absent; Telegram/email channels remain disabled. Supabase monitoring and operator login remain enabled.

### Planned/aspirational — provider setup and acceptance

- Configure optional installation OAuth client pairs on API/jobs and `MONITOR_ALLOWED_HOSTS` for Better Auth. Customer keys, webhook registration, connector installation and notification-channel setup remain external steps in [Monitoring integrations](monitoring-integrations.md). No npm publication or new provider credential registration was performed.
- **0/10 new providers are live-verified.** Each still needs a real isolated connection/catalog/read and relevant webhook/new-account/report acceptance; fixtures do not establish provider plan access or receipt at a notification destination.
- RevenueCat's API has no project-wide historical billing-event feed: native charts provide history, while events require webhooks and missed event payloads cannot be reconstructed from aggregates. Other provider retention limits and incomplete deleted-user history remain explicit. No invented Stripe MRR/churn, email matching or aggregate grand total is included.

## Customer-source acceptance attempt — 2026-10-04

- Hosted GitHub sign-in and creation of the requested customer monitoring project succeeded. Provider authorization and source selection did not complete: browser permissions subsequently denied access to Supabase and the hosted dashboard. A retry after explicit user authorization still reported saved site restrictions for both domains. No source or provider metric is accepted as verified by this attempt.
- The customer's existing database was checked read-only before the browser block. Aggregate counts are retained only in the ignored local acceptance report, not in Git. Existing mobile/web integration configuration was inspected without changing customer files or persisting credentials.
- `pnpm check` passes on the current local checkout: TypeScript, all 132 tests in 18 files, connector build and web production build. The initial sandboxed attempt failed because loopback database/SMTP access was denied; rerunning after the user changed execution permissions passed. `git diff --check` passes. The existing bundle-size advisory remains.
- Browser metric comparisons, real provider catalogs/reports and collection progress remain unverified. No application code, migration, deployment, webhook, notification destination or customer authentication configuration was changed. Existing unrelated local edits were preserved.

## Repository reliability implementation — 2026-10-22

### Implemented today — local working tree

All concrete fixes and efficiency/workflow improvements from [the repository review](repository-review-2026-10-22.md) are implemented across the eight children. This includes required worker write fencing and consistent transaction locks, credential refresh comparison, delayed-summary catch-up, delivery uncertainty preservation, provider normalization/quality fixes, bounded maintenance and batched dispatch/ingestion, schema-aware readiness, safer/faster dashboard behavior and disposable test-database tooling. Existing unrelated local edits are preserved; this is not a committed or deployed release.

### Automated verification — local only

- `pnpm check:isolated` passed against a fresh disposable PostgreSQL 18 cluster: TypeScript, **287 tests across 34 files**, Better Auth connector build and web production build. The cluster was stopped and removed. Tests include stale claims, disconnect/cache races, reverse-order cross-source aliases, concurrent health/page writes, project deletion, delayed summary dates, route log redaction, provider quality, connector timestamps, Google Play cancellation and cached React rendering.
- Bootstrap failure and SIGTERM probes propagated failure and removed their temporary clusters. An unavailable database produces one preflight message without credential disclosure. Test URL guards reject nonlocal/non-test endpoints and query-string overrides.
- API, jobs and web Worker bundle dry runs passed. Wrangler logs were redirected into task-local temporary files to avoid the sandbox's global log-directory restriction. No deployment commands without `--dry-run` were run.
- `docker compose config --quiet`, `git diff --check`, relative-link checks across 102 documents and the application-source size check passed; no maintained application source exceeds 500 lines. Docker containers were not run.
- Initial web JavaScript changed from **556.65 kB / 172.50 kB gzip** to **456.75 kB / 145.10 kB gzip** through lazy routes. Shared CSS is 429.48 kB / 42.53 kB gzip, plus the small overview stylesheet. These are build sizes, not browser performance measurements.
- A synthetic 50,000-event account-range query used 24 shared blocks / 0.147 ms after the new partial index versus 770 blocks / 6.45 ms before. This supports the index locally; production latency was not measured.

### Required rollout and unverified acceptance

Apply additive migrations **0012–0013** before coordinated API/jobs/web rollout. Index creation may hold write locks. If migration and runtime roles differ, grant runtime USAGE on the private migration schema and SELECT on its ledger as documented in [deployment.md](deployment.md). No new application environment variables or provider scopes are needed. The supplied Compose API allows 35 seconds for the bounded shutdown and checks schema-aware readiness; other hosts should allow at least 30 seconds. Rebuild/distribute the Better Auth connector for installed consumers; no package publication was performed.

No browser tests, CI run, production migration/deployment, live provider calls or recipient acceptance were performed. Previous dated hosted records remain historical; this local implementation does not update those claims.

## Implementation double-check — 2026-10-23

Independent Spec and Standards reviews of the uncommitted implementation identified three follow-up gaps, now corrected:

- Scheduled 30/365-day metric refreshes now use the owned project's calendar, matching UI/API ranges and cache keys around UTC midnight and DST. Four collector regressions reproduced the earlier mismatch before the fix and pass afterward.
- Isolated test setup registers interruption handlers before creating resources and uses cancellable-between-steps asynchronous commands. A controlled setup-stage SIGTERM regression reproduced the earlier default process exit and now verifies server-stop and temporary-cluster cleanup.
- Workspace, project and verification routes share loading/error boundaries. Rejected lazy imports show reload guidance while surrounding navigation remains mounted; navigating to another path clears the failed state. Typecheck/build verify integration; browser interaction acceptance remains unperformed.

Both reviewers confirmed their findings closed, with no remaining concrete checklist gaps. Final `pnpm check:isolated` passed **292 tests across 36 files**, TypeScript, connector packaging build and web production build. All three Worker dry runs and `git diff --check` passed. Initial JavaScript is **457.33 kB / 146.28 kB gzip**, still about 18% smaller uncompressed than the pre-review build. The disposable cluster was removed; test logs remain ignored artifacts. This double-check adds no migration, environment variable or provider permission beyond the previously documented rollout. No browser, deployment, production-database or live-provider verification was performed.

## Public landing page — 2026-10-23

### Implemented and deployed

- Added the static landing page within `apps/web/landing`, its independent Vite build and assets-only Cloudflare config. It inherits the dashboard theme, introduces the product with explicitly labeled sample data, groups implemented integrations and directs signup to the existing GitHub login at `https://sol.arminayat.dev/`. Native FAQ disclosures and all links work without JavaScript. No analytics, form endpoint, environment variable or migration was added.
- Deployed only `signs-of-life-landing`, version `653d6c0b-f888-4ab5-b2c0-2b726b017fd2`, at `https://soll.arminayat.dev/`. No dashboard/API/jobs or database release occurred; unrelated local reliability changes remain outside this deployment. Source changes remain in the local working tree.

### Verification and limits

- `pnpm check` first stopped on the unavailable test database. `pnpm check:isolated` then passed TypeScript, **292 tests in 36 files**, connector build, dashboard build and landing build using a disposable PostgreSQL 18 cluster, which was removed afterward.
- Landing Wrangler dry run, scoped Prettier and `git diff --check` passed. CI now includes the landing dry run, but CI was not run for this uncommitted change.
- Hallmark static lint reported **0 FAIL, 0 REFLEX, 0 WARN**. An independent source review identified chart contrast, notification format and heading-level issues; all were corrected. Token contrast checks and HTML checks covered anchor targets, unique IDs, app destinations, sample labels and the absence of JavaScript. No browser rendering, screenshots or interactive visual acceptance was performed, per repository instructions.
- HTTPS returned 200. Hosted HTML, CSS and favicon matched local build bytes; CSP, nosniff and referrer headers were present. Unknown paths and `/api/session` on the landing host returned 404. The existing application and public GitHub destination returned 200. This verifies serving and links, not new-user completion, provider connections, notification receipt or conversion performance.
- The current hosted config was checked read-only for copy: GitHub login and Slack/Discord enabled, email/Telegram disabled, all additional monitoring providers enabled through credentials. These settings are a point-in-time observation; integration setup and acceptance remain separate.

## Queue efficiency release — 2026-10-23

### Implemented and deployed

- Released scoped commit `e2de8d3d75faf87d19f00c839a8f9d8ec98397b7` from an isolated checkout of `main`, preserving unrelated uncommitted reliability and landing work. Completed account polling and daily-summary readiness now recur after five minutes; the upcoming exact local daily time caps a daily delay to preserve late-night reports. Catch-up pages, hourly aggregates and the minute dispatcher keep their existing schedules.
- Production previously sent due IDs individually. This release publishes up to 100 due messages with `sendBatch`, then marks each dispatched after successful publication. The consumer still receives up to three messages. Batching reduces publication overhead; Queue billing remains per message. The broader local reservation/maintenance overhaul is not part of this release.
- Jobs version `7977251e-c120-4880-aea0-a10b2d45dae5` and web version `b37402c8-aa02-4020-a44b-61ff61751678` serve this release at 100%. API version `633fd311-c405-46a2-aca4-e77a14d024de` remains on `93f647b`; its older public revision is expected. No migration, credential, queue setting, API or landing deployment occurred.

### Verification and limits

- Isolated release checks passed TypeScript, **253 tests in 27 files**, connector/web production builds, jobs/web Worker dry runs and `git diff --check`. The temporary PostgreSQL cluster was removed. New regressions cover completed/partial/history cadence, local midnight/DST, empty queue scans and failed batch publication.
- [GitHub Check run 39973816080](https://github.com/arminayat/signs-of-life/actions/runs/39973816080) passed for the exact release SHA, including its existing fixture E2E and container checks. No local or live browser testing was performed.
- Cloudflare deployment readback confirms 100% traffic and the jobs revision. Binding metadata matches the pre-release snapshot except intended jobs BUILD_REVISION/SOURCE_URL updates. The one-minute Cron is unchanged. HTTPS health/readiness returned 200; hosted HTML, JavaScript, CSS and favicon matched release-build hashes, including the updated five-minute setup text.
- At 15:00 UTC, queue backlog was zero. A bounded live tail captured one successful queue invocation with no exceptions, warning logs or error logs. This does not establish every provider's health or recipient delivery.
- Existing recurring jobs adopt the new interval on their next successful run. Daily usage reduction has not yet been measured over a representative post-release interval.

## Latest release preparation — 2026-10-23

The reliability implementation and public landing source have been reconciled with the five-minute polling release on main. Local verification passes TypeScript, **313 tests across 38 files**, connector/dashboard/landing builds, all four Worker dry runs and `git diff --check`. A scan of all release source files found no secrets. The scheduled-handler tests now exercise reservation-based dispatch while preserving empty-scan and failed-publication connection cleanup coverage. No local browser tests were run. Deployment evidence follows separately once rollout is complete.
