# Web overview

## Implemented today

Working-tree scope: the rounded content frame, footer version/GitHub/theme controls, eyebrow removal and polling watcher described in these guides are local implementation, not part of the knowledge-base commit. In a clean checkout, treat them as planned/aspirational until their separate source changes land. In particular, src/content-frame.css may be absent there; re-check main.tsx, ui.tsx and vite.config.ts before changing those details.

React SPA for operators to monitor multiple products. A validated session opens Projects; creating a project opens Sources; connect provider credentials, select source, create/verify destinations and route notifications; Overview charts show observed accounts/downloads; Activity shows delivery outcomes.
main.tsx renders login on session 401 and bypasses session query for /verify. No fake connected state, password form or production auth bypass exists. Cloudflare serves built assets and forwards /api/*; nginx is the Docker equivalent.

## Planned/aspirational

No separate mobile app, team management, billing or analytics beyond stored observations/reports is present. Live provider acceptance must be checked separately from this UI and historical docs/status.md.
