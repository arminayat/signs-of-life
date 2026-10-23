# Signs of Life

**Your products. In the loop.**

[Website](https://soll.arminayat.dev/) · [Open the app](https://sol.arminayat.dev/)

Upgrading an existing installation? Follow the [rename guide](docs/renaming.md)
to preserve your database and deployment resources.

Open-source account alerts and download reports for people building more than one thing. Organize products into projects, connect their data sources, and receive updates through Telegram, email, Slack or Discord.

- **Supabase:** OAuth connection and read-only account polling, approximately every five minutes. No hooks, database changes, or monitored user email collection.
- **App Store Connect:** initial downloads and redownloads from Sales and Trends, with pending-report handling and corrections.
- **Google Play Console:** device installs, uninstalls and country-specific ratings from read-only bulk reports; delayed reports stay pending.
- **Telegram, email, Slack and Discord:** verified destinations, per-project routing, test messages, pause controls and independent delivery history.
- **Portable:** React/Vite + HeroUI/Tailwind, Hono, Drizzle/PostgreSQL, Better Auth or Supabase Auth. Cloudflare and Docker runtimes share application logic.

## Run locally

For the standalone public landing page, run `pnpm dev:landing` after installing dependencies. It opens a local server at `http://127.0.0.1:5174` and requires no API or database. Its independent deployment is documented in [the deployment guide](docs/deployment.md#public-landing-page--implemented-today).

Requires Node 22.16+, pnpm 11 and PostgreSQL 17+. PostgreSQL 18 is also tested locally.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET and ENCRYPTION_KEYS in .env.
pnpm db:migrate
pnpm dev
```

Open `http://localhost:5173`. GitHub sign-in requires an OAuth app; see [integration setup](docs/integrations.md). A missing provider configuration is displayed as unavailable. The application has no production authentication bypass or fake connected state.

Run `pnpm stop` from this repository to stop its running local development stack.
The web dev server polls source files so hot reload still works when macOS file events are missed; this setting does not affect production builds.

Generate independent secrets:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Use the first output for `AUTH_SECRET`. Put the second in `ENCRYPTION_KEYS='{"v1":"BASE64_VALUE"}'`. Keep both private. Local test fixtures use separate, explicitly fake credentials.

For a complete container setup, see [Docker deployment](docs/deployment.md#docker).

## Verify

Create a dedicated loopback PostgreSQL database whose name ends in `_test`, then set `TEST_DATABASE_URL` in `.env` or the process environment. `pnpm test` checks availability once before running the suite and rejects nonlocal/non-test databases and query-string connection overrides.

Alternatively run `pnpm check:isolated`: it creates a temporary cluster, runs type checking, tests and builds, then stops/removes the cluster. Put PostgreSQL 17+ **server** tools (`postgres`, `initdb`, `pg_ctl`, `createdb`) on PATH; client-only packages are insufficient. On Homebrew, for example, prepend `/opt/homebrew/opt/postgresql@18/bin`. Local loopback sockets must be permitted. No installation database or credentials are changed; no browser tests run.

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The backend suite exercises real PostgreSQL transactions, tenant authorization, queue leases, source normalization and provider contracts. Its isolated test role needs migration/schema privileges plus CREATEDB and CREATEROLE for rename and restricted-role readiness probes; `pnpm check:isolated` supplies these only in its disposable cluster. Browser tests start an isolated fixture host and exercise the actual API and database. They do not contact live providers. Never use production credentials for these fixtures.

## Repository map

| Directory           | Owns                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `apps/web`          | React dashboard and Cloudflare static-assets entrypoint          |
| `apps/api`          | Node and Cloudflare Hono entrypoints                             |
| `apps/jobs`         | Node worker and Cloudflare cron/queue entrypoints                |
| `packages/core`     | Domain types, provider interfaces and scheduling helpers         |
| `packages/db`       | Drizzle schemas, migrations, repositories and transaction logic  |
| `packages/adapters` | Authentication, source providers, Telegram, email and encryption |
| `packages/backend`  | Request handling and application use cases                       |
| `tests`             | Unit, database integration and browser verification              |

Read [architecture](docs/architecture.md), [deployment](docs/deployment.md), [integrations](docs/integrations.md), and [current acceptance](docs/status.md) for details.

## License

All application code is available under **AGPL-3.0-only**. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses. There are no proprietary feature gates, required license services, or mandatory application telemetry.

## Implemented today — monitoring expansion

Twelve additional provider adapters, including Lemon Squeezy billing, configurable Growth/Revenue/Usage reports and a read-only Better Auth connector are included in source. Follow [setup and coverage documentation](docs/monitoring-integrations.md) before release: migrations through 0013, provider credentials/registrations, coordinated API/jobs/web deployment and individual live acceptance are required. Slack and Discord setup is in [Integration setup](docs/integrations.md#slack-and-discord).
