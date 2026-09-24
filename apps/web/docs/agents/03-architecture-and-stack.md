# Web architecture and stack

## Implemented today

Root pins React/ReactDOM 19.3.0, Vite 8.3.0, HeroUI 3.2.4, Tailwind 4.3.3, React Router 7.18.3 and TanStack Query 5.102.8. Dependencies/build scripts live at root; apps/web/package.json is a private marker.
index.html loads src/main.tsx; StrictMode wraps QueryClientProvider and BrowserRouter. src/data.ts imports core types and maps server Dates to JSON strings; project-overview imports core time helper. No runtime backend/DB import enters browser code.
Vite root is apps/web, dev port 5173 strict loopback, file watching polls every 300ms, /api proxy to 8787, output dist with sourcemaps. Config comes from /api/config; no application VITE_* variable is read. Theme is the only explicit localStorage state (key theme); forms use component state.
Root pnpm build builds this app. Playwright config uses isolated 5217/8797 fixture servers and desktop/mobile Chromium with actual API/test DB and fake providers. CI also bundles the Cloudflare asset/API forwarding Worker.
