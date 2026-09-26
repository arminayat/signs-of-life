# Web folder structure

## Implemented today

- src/main.tsx: shell, login, routing, theme; src/data.ts: HTTP/query/mutation helpers.
- src/ui.tsx: reusable UI wrappers; src/catalog.ts: catalog shape/query.
- src/projects.tsx: workspace projects/create flow.
- src/project-detail.tsx: project routing/sidebar; project-sources.tsx, project-overview.tsx, project-notifications.tsx: project views.
- src/project-settings.tsx, source-dialog.tsx, connections.tsx: feature forms/integration controls.
- src/project-chart.tsx: SVG chart plus daily-value table.
- src/destinations.tsx and other-pages.tsx: destination, activity, settings and verification screens.
- src/styles.css, responsive.css, project.css, content-frame.css: tokens/base, responsive/login, project, header/footer styling.
- src/cloudflare.ts, wrangler.jsonc, worker-configuration.d.ts: asset/API forwarding deployment.
- index.html, vite.config.ts, package.json: boot/build/package metadata.
- public/favicon.svg and public/_headers: static icon and Cloudflare asset response headers, copied by Vite into dist/.
  Local components/, pages/, hooks/, api/ and local tests/ are not present. dist/ is generated output, not source.

## Planned/aspirational — placement rules

Keep feature UI beside its feature file; shared UI stays in ui.tsx until a coherent split is useful. Add a top-level folder only for a concrete responsibility; update this map and route inventory. Do not copy a framework's conventional folder layout into documentation unless it exists.

## Implemented today — monitoring modules

src/monitor-connection.tsx, monitor-status.tsx, monitor-views.tsx, monitor-overview.tsx and monitor-chart.tsx are focused setup/state/report modules; src/monitoring.css owns their responsive layout. Existing project-overview.tsx remains the Supabase/Apple chart implementation. Shared provider metadata comes from core/provider-registry.ts.
