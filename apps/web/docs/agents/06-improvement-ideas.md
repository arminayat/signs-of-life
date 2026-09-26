# Web improvement ideas

## Planned/aspirational

| Idea                                                               | Impact                                                                             | Effort | Area             | Status |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------ | ---------------- | ------ |
| Remove unused imports left in projects.tsx after feature splitting | Clarifies actual page dependencies; root typecheck does not enforce noUnusedLocals | Small  | src/projects.tsx | open   |

No UI redesign or new provider screen is implied. Keep project-local ideas here and shared contract issues in backend/workspace logs.

## Implemented today — observed build limitation

The production web bundle exceeds Vite’s 500 kB advisory threshold.

## Planned/aspirational

| Idea                                      | Impact                              | Effort | Area                          | Status |
| ----------------------------------------- | ----------------------------------- | ------ | ----------------------------- | ------ |
| Split heavy project/report views by route | Reduce initial dashboard JavaScript | Medium | Web router and provider views | open   |
