# Product Monitor

Product Monitor is a standalone open-source repository. It is not part of Kapier.

Read `README.md` and `docs/architecture.md` before changing behavior. Deployment and provider setup are documented in `docs/deployment.md` and `docs/integrations.md`. `docs/status.md` records verified acceptance and external prerequisites.

- React + Vite, HeroUI and Tailwind own the dashboard. Hono owns request handling; workers own scheduled collection and notification delivery.
- Core application logic depends on the interfaces in `packages/core/src`. Keep provider SDKs in adapters and Drizzle queries in the database package.
- Application tables use private PostgreSQL schemas. Never add customer database writes, Auth hooks, monitored user email collection or first-open instrumentation.
- Keep files under approximately 500 lines. Prefer focused modules over generic plugin/repository machinery.
- Browser verification is authorized for this project. Use isolated test identities and a database ending in `_test`; never connect browser fixtures to production.
- Keep credentials, provider payloads, generated deployment secrets and test artifacts out of Git. Do not reuse another product's integration credentials.
- Run `pnpm check`, relevant browser tests and `git diff --check` before release. Cloudflare changes require bundle dry runs. Maintain behavior/deployment documentation in the same change.
- Distinguish source implementation, automated verification, deployment and live provider acceptance in reports. A provider acceptance response is not proof that a message reached an inbox.
