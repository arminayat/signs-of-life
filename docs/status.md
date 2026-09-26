# Implementation and acceptance

This document distinguishes implemented behavior, automated verification and live acceptance. Update it before release.

## Implemented

- React/Vite dashboard with HeroUI, Tailwind, light/dark themes and responsive layouts.
- Hono API, Drizzle PostgreSQL schema/migrations, tenant-scoped repositories and credential encryption.
- Better Auth default and Supabase Auth alternative; explicit identity migration and versioned session cookies.
- Read-only Supabase OAuth account source and Apple Sales and Trends reporting source.
- Telegram and email destinations, verification, routing, tests, unsubscribe and delivery history.
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

## External acceptance still required

- Hosted GitHub login acceptance and an installation-owned Supabase monitoring OAuth registration.
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
