# Web improvement ideas

## Implemented today — repository review

- Route and nested project screens load lazily with React/Suspense. Initial JavaScript is 457.33 kB (146.28 kB gzip), down from 556.65 kB (172.50 kB gzip). This is a build measurement, not browser timing evidence. Shared CSS remains approximately 429 kB; no speculative style-library replacement is proposed.
- Project-local range construction/validation, guarded saved-view editing, cached-data refresh notices and catalog reset after credential changes are implemented. See 07-known-issues.md and tests/web-reliability.test.ts.
- Pending metric queries poll every 15 seconds; completed/error results poll every five minutes. Monitoring status uses a lightweight response without report payloads. Fifty completed views imply ten periodic result reads/minute instead of 200, excluding other requests and refetch triggers.

## Planned/aspirational

- Align `main.tsx` login marketing copy with current integrations and configured channels. It still names only Supabase/App Store and Telegram/email, whereas the public landing page reflects the broader source inventory and current hosted Slack/Discord setup. Impact: consistent handoff after the landing CTA; effort: small. This remains unimplemented because the landing deploy is intentionally independent of unrelated dashboard changes.

Browser interaction and performance acceptance require explicit task authorization and remain separate from source/build/static rendering evidence.
