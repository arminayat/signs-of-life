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
- 36 backend tests pass using real PostgreSQL and fake external providers, including both authentication adapters, OAuth callback replay, retry limits, a local SMTP protocol exchange, and fresh/legacy database rename migrations.
- Six desktop/mobile browser tests pass using an isolated fixture host and actual API/database operations.
- All three Cloudflare bundles build in Wrangler deployment dry runs. The local Cloudflare runtime also passes readiness, signed Better Auth session, project creation/readback and workspace deletion checks.
- GitHub Actions passes the full checks and builds/starts the complete Docker stack with PostgreSQL 17, migration, API, jobs and frontend. Container readiness and SPA routing pass.
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
- No hosted PostgreSQL database, Hyperdrive configuration, Workers or custom-domain route has been deployed yet. The hostname currently falls through the zone's DNS-only wildcard record and returns 503.

## External acceptance still required

- A dedicated hosted database and non-placeholder Hyperdrive configuration.
- Hosted GitHub login acceptance and an installation-owned Supabase monitoring OAuth registration.
- A Telegram bot/webhook and received test notification.
- Resend sender verification and a received email notification.
- A real App Store Sales and Trends report matched to the app's reporting dashboard.
- Read-only connection to Kapier with evidence that its database/Auth configuration is unchanged.
- Hosted readiness, login and collection/delivery checks against the deployed revision.

Fixtures, dry runs and provider acceptance responses do not satisfy these live checks. No Kapier files or provider configuration have been changed by this project setup.
