# API runtime conventions

## Implemented today

Node composition is process-long; Cloudflare composition is per request. APIBindings are referenced through worker-configuration.d.ts and ExportedHandler. Node-only dependencies enter through backend/node.ts.

## Planned/aspirational — maintenance rules

Add routes and application policy to backend, not this host. Always close per-request pools via execution context even on errors. Preserve same-origin forwarding and shared config validation. Keep secrets out of wrangler vars and generated deployment artifacts.
