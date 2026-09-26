# Database improvement ideas

## Planned/aspirational

| Idea                                                                                        | Impact                                                                                                               | Effort       | Area                                                             | Status |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------- | ------ |
| Backfill daily jobs for projects created by migration 0004, with an upgrade regression test | Imported Apple connections can collect metrics after source creation but their new project lacks daily notifications | Small/medium | New corrective migration + root branding/Apple job tests; see 07 | done   |

Implemented today: additive migration 0006 and upgrade regression coverage complete this item; applied older SQL remains unchanged.
