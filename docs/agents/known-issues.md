# Workspace known issues

## Implemented today

- **Resolved Authentication boundary mismatch:** core/authentication.ts owns the contract; adapters/auth.ts owns its minimal configuration type and still legitimately imports db for identity persistence. No adapter imports backend configuration. Keep the dependency direction when extending login.
- **Active acceptance footgun:** checked-in readiness/config or an old passing release is mistaken for live feature acceptance → cause: source, deployment and recipient receipt are distinct → established approach: use docs/status.md as historical evidence only; refresh hosted revision, schema, login, collection and delivery independently → prevention: never copy old live-state/test-count claims into current numbered state.
- **Active configuration boundary:** platform Supabase Auth and Supabase monitoring OAuth use different credentials/callbacks → symptom: login configured but monitoring unavailable → prevention/workaround: follow root docs/integrations.md and backend env map; configure each required integration independently.
- **Handled schema/deployment rename risk:** changing ledger/resource/Compose names can create empty resources or replay migrations → implemented DB fix renames old ledger first and migration 0003 renames schemas; operator cutover still needs root docs/renaming.md → prevention: preserve applied SQL, DB volumes, secrets and encryption versions.
- **Resolved scheduling gaps:** migration 0006 repairs missing project daily jobs, and Apple reconnect requeues collection without resetting source history. Keep upgrade and reconnect regression tests; source implementation does not imply production migration/deployment.

- **Resolved test setup diagnostics:** a stopped test database now causes one actionable preflight error. `pnpm check:isolated` creates and removes a disposable loopback cluster; PostgreSQL server tools must precede client-only tools on PATH. Restricted loopback sockets require execution permission. Database URLs are guarded as loopback/_test, and installation credentials are unchanged. Setup registers signal handlers before creating resources and checks cancellation around asynchronous commands, so setup-stage SIGTERM reaches cleanup; a controlled subprocess regression covers this case.

- **Verified Wrangler authentication workaround:** macOS Keychain exit 51 prevented both reading the existing profile and saving a fresh OAuth key. A separately authorized named profile stored in an owner-only plaintext file successfully deployed all three Workers. Keep the global Keychain setting unchanged; select the named profile and set `CLOUDFLARE_AUTH_USE_KEYRING=false` for each command using that profile. A normal command without this override may still hit the Keychain failure. Plaintext storage requires operator consent; this workaround does not repair the macOS Keychain itself.
  Wrangler 4.130.0 accepts `--profile` for deployment but rejects it for `whoami`; use the repository-bound active profile for that read-only command. The existing profile also deployed the separate landing assets Worker; no new credentials were created.

## Planned/aspirational — log maintenance

Each new entry needs symptom → root cause → actual fix/workaround (or explicitly none) → prevention and status. Do not label an untested proposal resolved; prune obsolete entries.
