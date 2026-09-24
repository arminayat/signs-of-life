# Workspace improvement ideas

## Planned/aspirational

| Idea                                                                               | Why / impact                                                                                  | Effort | Affected area                                                                                   | Status |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ------ |
| Move Authentication contract to core and decouple auth adapter from backend Config | Align intended dependency boundary with code; avoid backward type dependency                  | Medium | core, adapters/auth.ts, backend/services.ts/authentication.ts, auth tests and architecture docs | open   |
| Add a lightweight KB completeness/link check to CI if drift becomes recurring      | Current protocol relies on agents; no automated KB validation hook runs after arbitrary edits | Small  | Root docs/agents, AGENTS.md, shared CI                                                          | open   |

Project-local proposals live in child 06-improvement-ideas.md: db imported-project scheduling; backend Apple reconnect/Supabase capability check; web unused imports. They are not silently included in this documentation task.
Curate entries after changes; mark done/remove shipped work and keep only useful proposals. No roadmap dates or externally approved work are implied.
