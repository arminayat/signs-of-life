# Contributing

Read `AGENTS.md` and `docs/architecture.md`. Open an issue to discuss substantial product or provider additions before implementing them.

Use Node 22 and pnpm 11. Keep dependencies pinned, run the relevant tests against isolated PostgreSQL, and include migrations for schema changes. Avoid provider-specific behavior in application services. A new adapter needs contract tests and documented runtime/configuration support.

Pull requests should explain the user-visible change, why it is needed and what was verified. Do not include tokens, personal data, real provider reports, or deployment secrets. Contributions are provided under AGPL-3.0-only.
