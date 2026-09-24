# Web conventions

## Implemented today

Named function components and typed props; feature files are flat under src. data.ts owns api, ApiError, useDashboard, useConfig, useAction and user error/time formatting. Queries cache dashboard by workspace/project and poll every 15s; config/catalog stale time is 60s. Successful useAction invalidates the dashboard prefix, including overview, but not catalog.
Global query retry excludes ApiError status <500 and allows fewer than two retries; session query disables retry. Mutations parse FormData and use callback navigation/closure. Dialog/form state stays local; IDs/keys remount project and reconnect forms when needed.
HeroUI v3 compound components, onPress/isPending/isDisabled and controlled Checkbox patterns are used. Shared wrappers in ui.tsx handle labels, errors, status, dialogs and destructive confirmation. Native select and textarea are deliberate existing choices.

## Planned/aspirational — maintenance rules

Reuse ui/data/catalog before adding abstractions. Keep provider credentials out of Vite/env/storage; submit transient Apple key fields to API only. Preserve organization-only connection labels, then separate app/project selection. Keep missing data distinct from zero, and provider accepted distinct from received.
Do not run browser verification unless explicitly requested for the task; when authorized use isolated identities and _test DB only.
