# Cross-project architecture

## Implemented today

The same-origin web app calls Hono /api. Cloudflare web uses ASSETS and API bindings; Node development uses Vite's /api proxy; Docker nginx proxies /api to the API container. API/jobs share backend composition and PostgreSQL.
Dependency direction: web → core (safe types/time); apps/api and apps/jobs → backend; backend → core + db + adapters; db → core; adapters → core. Exception: adapters/auth.ts imports db auth schema/client type and backend Config type. Authentication is declared in adapters, not core; the architecture document's broader core-interface intent is not fully implemented.
Contracts:

- (issuer,subject) identifies an operator; app identity mapping is independent of provider-source OAuth. One personal workspace per owner; no email-based identity merging.
- New connections belong to projects. Migration 0004 preserves legacy multi-project null ownership; new source attachment cannot use that exception. Destinations remain workspace-wide, routed per project.
- DB commits account events, cursor progress, fanout and delivery jobs atomically; report dates/selected-app metrics are transactional. Core defines shapes; db owns physical constraints.
- Jobs are persisted; Queue carries {id}. Claims use row locks/leases and token-fenced finish. Node calls the same runner directly. Dispatch acceptance is not execution completion.
- External sends cannot join the DB transaction. Delivery records preserve accepted/failed/uncertain/cancelled states; source polling, notification fanout and provider receipt are different stages.
- Browser snapshots omit ciphertext, refresh leases and unsubscribe hashes, and redact verification text. Project dashboard restricts deliveries before the cap; other snapshot arrays remain workspace-wide. Overview uses separate 30-day aggregation.
  Deployment topology: three Workers with Hyperdrive/Queues or Compose's PostgreSQL+migrate+API+jobs+nginx. Both runtime paths execute the same backend/db/provider code; SMTP is Node-only. Root docs/deployment.md owns procedures; child operations files own local runtime semantics.

## Planned/aspirational

The desired pure core Authentication boundary is recorded in improvement-ideas.md. No generalized plugin runtime, shared remote service from Kapier, event bus or separate orchestration engine is present.
