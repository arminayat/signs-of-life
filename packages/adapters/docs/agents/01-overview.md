# Adapters overview

## Implemented today

Internal integrations library implementing account/report sources, authentication, encryption and notification transports. Backend composition selects implementations; adapters normalize provider output into core types and stable errors.
Supabase Management API polls accounts read-only; Apple Sales and Trends yields daily download totals; Telegram, Resend and Node SMTP send notifications. Better Auth and Supabase Auth implement operator login separately.
No route registration, scheduler or application monitoring-table persistence here. Better Auth is the exception: its adapter uses db auth tables.

## Planned/aspirational

Additional providers, Telegram groups and arbitrary database querying are not present. Authentication's current dependency boundary is tracked at workspace level.
