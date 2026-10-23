# Cross-project architecture

## Implemented today

The same-origin web app calls Hono /api. Cloudflare web uses ASSETS and API bindings; Node development uses Vite's /api proxy; Docker nginx proxies /api to the API container. API/jobs share backend composition and PostgreSQL.
The public landing page is a second build inside apps/web, deployed through a separate assets-only Worker. It links to the application origin and has no API, auth or database dependency. Its source and visual behavior belong in the Web child KB; it is not a ninth workspace child.
Dependency direction: web → core (safe types/time); apps/api and apps/jobs → backend; backend → core + db + adapters; db → core; adapters → core. The auth adapter also imports db auth schema/client types. Authentication is defined in core/authentication.ts; the adapter owns its minimal AuthenticationConfig and has no backend import.
Contracts:

- (issuer,subject) identifies an operator; app identity mapping is independent of provider-source OAuth. One personal workspace per owner; no email-based identity merging.
- New connections belong to projects. Migration 0004 preserves legacy multi-project null ownership; new source attachment cannot use that exception. Destinations remain workspace-wide, routed per project.
- DB commits account events, cursor progress, fanout and delivery jobs atomically; report dates/selected-app metrics are transactional. Core defines shapes; db owns physical constraints.
- Jobs are persisted; Queue carries {id}. Claims use row locks/leases; worker result, error, health, fanout and delivery writes require the current claim, as does completion. Node calls the same runner directly. Dispatch acceptance is not execution completion.
- External sends cannot join the DB transaction. Delivery records preserve accepted/failed/uncertain/cancelled states; source polling, notification fanout and provider receipt are different stages.
- Browser snapshots omit ciphertext, refresh leases and unsubscribe hashes, and redact verification text. Project dashboard restricts deliveries before the cap; other snapshot arrays remain workspace-wide. Overview uses range-aware Supabase/Apple aggregation and source-specific normalized provider reports (7/30/90/365/custom).
  Application deployment topology: three Workers with Hyperdrive/Queues or Compose's PostgreSQL+migrate+API+jobs+nginx. Both runtime paths execute the same backend/db/provider code; SMTP is Node-only. The separate public landing assets Worker is outside both application runtime paths. Root docs/deployment.md owns procedures; child operations files own local runtime semantics.

## Planned/aspirational

No generalized plugin runtime, shared remote service from Kapier, event bus or separate orchestration engine is present.

## Implemented today — monitoring boundary

core owns monitoring.ts, monitor-store.ts and provider-registry.ts. adapters/monitoring owns protocols; backend owns OAuth/collection/report orchestration; db owns normalized persistence; web owns configuration and rendering. The Better Auth connector is independently distributable and uses the customer application’s existing adapter. It does not participate in Signs of Life login.

Imports and live collection have separate persisted cursors, errors and a fixed notification baseline. Webhooks authenticate before normalized inbox/job insertion. Event identity and source provenance are distinct; cross-provider matching requires authenticated object lookup. No combined unique-user/MRR/funnel or FX calculation exists. Additive migrations through 0013 precede a coordinated API/jobs/web rollout; detailed setup and external acceptance gates are in docs/monitoring-integrations.md.

Core ChannelKind also includes Slack/Discord. Backend seals destination URLs and decrypts for adapters; db migration 0011 adds nullable destination secret and excludes it from snapshots. Existing challenge/delivery contracts support channel-code verification. Google Play and Lemon Squeezy use the existing monitoring boundary and require no new runtime bindings.
