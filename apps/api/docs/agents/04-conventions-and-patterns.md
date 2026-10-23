# API runtime conventions

## Implemented today

Node composition is process-long; shutdown drains HTTP before closing the database and is bounded to 30 seconds. Root Compose supplies 35 seconds termination grace and uses schema-aware readiness for its health check; Cloudflare composition is per request. APIBindings are referenced through worker-configuration.d.ts and ExportedHandler. Node-only dependencies enter through backend/node.ts.

## Planned/aspirational — maintenance rules

Add routes and application policy to backend, not this host. Always close per-request pools via execution context even on errors. Preserve same-origin forwarding and shared config validation. Keep secrets out of wrangler vars and generated deployment artifacts.
