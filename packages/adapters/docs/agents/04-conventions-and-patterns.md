# Adapters conventions

## Implemented today

Factories accept dependencies (HTTP functions or transports), return core interfaces, enforce request timeouts and normalize errors. Account payloads are validated by Zod; TSV parser rejects malformed rows. boundedText defaults to 2 MB, channel JSON to 100 KB, decompressed Apple reports to 32 MB.
Provider secrets are explicit arguments; crypto uses the owning record ID or challenge hash as authenticated context. No monitored-user email is queried.

## Planned/aspirational — maintenance rules

Keep provider-specific HTTP/signing/parsing here; keep retries/schedules in backend and persistence in db. Never log provider payloads, authorization headers, cookie values, private keys or Telegram token-containing URLs. Add contract tests for new normalization/failure paths. Keep smtp.ts out of Cloudflare composition.

## Implemented today — normalized monitoring

Use bounded request/object/array validators and allowlist every returned field. Keep provider IDs only when needed for durable deduplication; hash auth account IDs on ingestion. Monetary values are decimal text with provider-specific minor-unit rules (including Stripe ISK/UGX). Keep null/missing/unavailable distinct from zero; never sum daily unique-user/rate/stock metrics. OAuth and resource discovery belong here; workspace policy and storage belong above/below this boundary respectively.
