# Upgrading to Signs of Life

The display name is **Signs of Life**, package and resource names use
`signs-of-life`, and PostgreSQL uses `signs_of_life`,
`signs_of_life_identity` and `signs_of_life_migrations` as private schemas.
Fresh installations use a database named `signs_of_life` and an isolated
`signs_of_life_test` database for tests.

## Existing databases

Stop API and job processes and take a database backup before upgrading. Preserve
`AUTH_SECRET` and every encryption key. Update the code, then run `pnpm db:migrate`
with the existing database URL. The migration runner first renames the legacy
`pm_migrations` ledger so Drizzle does not replay applied migrations. Migration
0003 renames `pm` and `pm_identity` in place, preserving rows, constraints and
provider credentials. Re-running the migration is supported. Original migration
files and snapshots retain their historical names deliberately.

The SQL migration does not rename the database itself or its login role. To
rename an existing database, connect to `postgres` as its owner/admin after
stopping all clients, then use `ALTER DATABASE old_name RENAME TO signs_of_life;`
with the actual old database name. Rename the test database separately to
`signs_of_life_test`. Update `DATABASE_URL`, `TEST_DATABASE_URL`, and any
Hyperdrive or local Wrangler connection strings to match. Database roles are
installation-owned; new Docker installations use `signs_of_life`.

The new authentication cookie namespace signs users out once. Their accounts,
projects, destinations and integration connections remain intact. Keep all three
new schemas private and update backup/restore scripts and any schema allowlists.

## Existing Docker installations

Changing the Compose project name creates a different named volume. Do not start
the renamed stack expecting the old volume to be attached automatically. Export
and restore it first, using a private backup path:

```sh
docker compose -p product-monitor stop api jobs web
docker compose -p product-monitor exec -T db pg_dump -U monitor -d monitor --format=custom > /private/path/database.dump
docker compose -p product-monitor down
docker compose up -d db
# Wait for the new database service to become healthy before restoring.
docker compose exec -T db pg_restore -U signs_of_life -d signs_of_life --no-owner --no-privileges < /private/path/database.dump
docker compose up --build -d
```

These commands assume the previous default database/user were `monitor` and the
new defaults are `signs_of_life`; substitute the actual names for customized
installations. Keep `POSTGRES_PASSWORD`, encryption keys and authentication
secrets configured. Do not delete the old volume until the new stack passes
readiness, login and data checks. Never use `down --volumes` during this upgrade.

## Hosted services and integrations

Create the `signs-of-life-jobs` and `signs-of-life-dead-letter` queues and
deploy `signs-of-life-api`, `signs-of-life-jobs` and `signs-of-life` in that
order. Worker names identify new resources: existing Worker secrets and routes
are not copied by changing Wrangler configuration. Install the existing secrets
on the new Workers, configure Hyperdrive for the migrated database, and stop the
old collectors before starting the new ones. Drain old queues and retire old
Workers only after cutover verification.

If changing the public hostname, update `PUBLIC_URL`, OAuth app homepage/callback
URLs, Telegram and Resend webhook URLs, and the sender identity. Update provider
display names to Signs of Life. Provider-issued client IDs, tokens, signing
secrets and keys should retain their values. Existing emailed verification links
need the old hostname to continue routing until they expire.

The repository and default `SOURCE_URL` use
`https://github.com/arminayat/signs-of-life`. Existing clones can update with
`git remote set-url origin https://github.com/arminayat/signs-of-life.git`.
