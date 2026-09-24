# Adapters conventions

## Implemented today

Factories accept dependencies (HTTP functions or transports), return core interfaces, enforce request timeouts and normalize errors. Account payloads are validated by Zod; TSV parser rejects malformed rows. boundedText defaults to 2 MB, channel JSON to 100 KB, decompressed Apple reports to 32 MB.
Provider secrets are explicit arguments; crypto uses the owning record ID or challenge hash as authenticated context. No monitored-user email is queried.

## Planned/aspirational — maintenance rules

Keep provider-specific HTTP/signing/parsing here; keep retries/schedules in backend and persistence in db. Never log provider payloads, authorization headers, cookie values, private keys or Telegram token-containing URLs. Add contract tests for new normalization/failure paths. Keep smtp.ts out of Cloudflare composition.
