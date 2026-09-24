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
