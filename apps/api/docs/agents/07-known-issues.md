# API runtime known issues

## Implemented today

- **Active deployment footgun: private Worker entrypoint.** Symptom: direct workers.dev access is unavailable → cause: workers_dev=false in wrangler.jsonc → intended access: public web Worker forwards /api/* via API service binding → prevention: keep web service name and API deployment aligned.
- **Active readiness limitation.** Symptom: /api/ready passes while provider setup/migration-dependent features fail → cause: store.health executes only SELECT 1 → workaround: separately verify schema version and authenticated/provider flows → prevention: never label readiness as full acceptance.
  No new runtime failure was reproduced during this documentation task.
