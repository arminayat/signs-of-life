# Workspace improvement ideas

## Planned/aspirational

| Idea                                                                               | Why / impact                                                                                  | Effort | Affected area                                                                                   | Status |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ------ |
| Move Authentication contract to core and decouple auth adapter from backend Config | Align intended dependency boundary with code; avoid backward type dependency                  | Medium | core, adapters/auth.ts, backend/services.ts/authentication.ts, auth tests and architecture docs | open   |
| Add a lightweight KB completeness/link check to CI if drift becomes recurring      | Current protocol relies on agents; no automated KB validation hook runs after arbitrary edits | Small  | Root docs/agents, AGENTS.md, shared CI                                                          | open   |

## Implemented today

The ten-provider expansion has source implementations; setup/live acceptance is separately tracked in docs/monitoring-integrations.md. Local scheduling/configuration fixes are complete; project-local backlog entries remain in child KBs.
