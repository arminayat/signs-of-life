# Backend improvement ideas

## Planned/aspirational

| Idea                                                               | Impact                                                                                               | Effort | Area                                                  | Status |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- | ------ |
| Reactivate terminated Apple collector jobs on credential reconnect | Restoring an existing connection should resume its sources without needing another source attachment | Small  | routes-integrations.ts + Apple lifecycle test; see 07 | open   |
| Make Supabase availability require both OAuth credentials          | Avoid offering Connect when only client ID is configured                                             | Small  | api.ts / config.ts + API test; see 07                 | open   |

Migration-created project scheduling is owned by db's backlog; Authentication contract placement is a workspace-level proposal.
