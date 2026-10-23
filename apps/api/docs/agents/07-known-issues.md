# API runtime known issues

## Implemented today

- **Active deployment footgun: private Worker entrypoint.** Symptom: direct workers.dev access is unavailable → cause: workers_dev=false in wrangler.jsonc → intended access: public web Worker forwards /api/* via API service binding → prevention: keep web service name and API deployment aligned.
- **Implemented schema-aware readiness:** /api/ready now requires the latest application migration in the ledger and returns 503 when unavailable or unmigrated. It still does not prove authentication, provider setup, collection or recipient receipt; verify those independently.
- **Resolved/covered: shutdown before request drain.** Node now awaits HTTP completion before closing PostgreSQL, handles repeated signals once, force-closes connections at 25 seconds and caps total shutdown at 30 seconds. The local HTTP regression verifies response completion before pool closure. Hosts need a termination grace period that permits this drain.
