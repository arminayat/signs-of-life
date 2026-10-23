# Workspace improvement ideas

## Implemented today and remaining proposals

| Idea                                                                               | Why / impact                                                                                                                                                                                  | Effort | Affected area                                                                                   | Status |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ------ |
| Move Authentication contract to core and decouple auth adapter from backend Config | Align intended dependency boundary with code; avoid backward type dependency                                                                                                                  | Medium | core, adapters/auth.ts, backend/services.ts/authentication.ts, auth tests and architecture docs | done   |
| Add a lightweight KB completeness/link check to CI if drift becomes recurring      | Current protocol relies on agents; no automated KB validation hook runs after arbitrary edits                                                                                                 | Small  | Root docs/agents, AGENTS.md, shared CI                                                          | open   |
| Add an isolated test database bootstrap/preflight                                  | A stale local TEST_DATABASE_URL currently produces many downstream failures before the actual setup issue is clear; fail once with actionable setup while preserving loopback/_test isolation | Small  | Shared test tooling, tests/helpers.ts, contribution docs                                        | done   |

The [repository review](../repository-review-2026-10-22.md) links locally reproduced collection/recovery defects and source-derived efficiency opportunities across the eight children. Detailed findings and current implementation status live in each owning child's 06/07 files. It does not establish deployment or live provider acceptance.

## Implemented today

The ten-provider expansion has source implementations; setup/live acceptance is separately tracked in docs/monitoring-integrations.md. Local scheduling/configuration fixes are complete; project-local backlog entries remain in child KBs.
