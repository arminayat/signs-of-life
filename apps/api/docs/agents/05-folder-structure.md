# API runtime folder structure

## Implemented today

- src/node.ts: Node Hono server.
- src/cloudflare.ts: Worker fetch bridge.
- wrangler.jsonc: checked-in deployment config.
- worker-configuration.d.ts: binding declarations referenced by entrypoint.
- package.json: private workspace marker; AGENTS.md/docs/agents/: memory.
  Local tests/, migrations/, dist/ source output and route modules are not present here. Tests, Dockerfile, compose.yaml and command scripts live at root.

## Planned/aspirational — placement rules

Runtime-only helpers belong in src/. Route/job behavior goes to backend; SQL goes to db. Add a top-level folder only for an actual new ownership boundary, and update the workspace map.
