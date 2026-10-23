# Core improvement ideas

## Implemented today

Worker mutation contracts require a current Job; legacy collection, metric results, health, delivery state, daily fanout and inbox/provider-backoff mutations no longer omit ownership. `tests/helpers.ts` acquires real claims for direct fixture setup; production services use the strict contract. Database and backend own the corresponding enforcement and use cases.

The pure Authentication interface now lives in core/src/authentication.ts. ProviderAdapter optionally exposes a focused `definition` lookup for providers with saved report definitions; the existing `definitions` catalog remains supported. Monitoring configuration, delivery eligibility and job diagnostics have focused store reads.

## Planned/aspirational

No additional project-local improvement is prioritized. Keep shared contracts tied to actual callers and preserve the distinction between persistence/provider success and end-user receipt.
