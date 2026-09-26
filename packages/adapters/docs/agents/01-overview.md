# Adapters overview

## Implemented today

Internal integrations library implementing account/report sources, authentication, encryption and notification transports. Backend composition selects implementations; adapters normalize provider output into core types and stable errors.
Supabase Management API polls accounts read-only; Apple Sales and Trends yields daily download totals; Telegram, Resend and Node SMTP send notifications. Better Auth and Supabase Auth implement operator login separately.
No route registration, scheduler or application monitoring-table persistence here. Better Auth is the exception: its adapter uses db auth tables.

## Planned/aspirational

Telegram groups and arbitrary customer database querying are not present. Authentication's current dependency boundary is tracked at workspace level.

## Implemented today — expanded monitoring

monitoring/ implements Stripe, Polar, Paddle, RevenueCat, PostHog, GA4, Better Auth, WorkOS, Clerk and Auth0. Native reports are aggregate-only; no customer identity matching or profile persistence. RevenueCat has webhook events and native chart history, not a project-wide event replay feed.
