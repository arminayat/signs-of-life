# Adapters architecture and stack

## Implemented today

Root-pinned Better Auth/drizzle adapter 1.7.4, @supabase/ssr 0.12.7, supabase-js 2.116.0, jose 6.2.12, nodemailer 10.0.3 and Zod 4.6.1. Uses Web Crypto, fetch, AbortSignal and DecompressionStream; SMTP is Node-only.
Core types define source/channel results and the Authentication contract. auth.ts owns the minimal AuthenticationConfig input and imports db auth schema/database for Better Auth storage; no adapter imports backend Config. Other adapters take explicit parameters rather than reading environment variables.
Provider configuration names and runtime selection are owned by backend/config.ts; see integrations.md here for mapping. Root tests/adapters.test.ts, auth.test.ts and smtp.test.ts verify contracts, encryption and a local SMTP exchange. No independent build/deployment.
