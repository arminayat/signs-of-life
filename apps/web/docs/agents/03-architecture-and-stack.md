# Web architecture and stack

## Implemented today

Root pins React/ReactDOM 19.3.0, Vite 8.3.0, HeroUI 3.2.4, Tailwind 4.3.3, React Router 7.18.3 and TanStack Query 5.102.8. Dependencies/build scripts live at root; apps/web/package.json is a private marker.
index.html loads src/main.tsx; StrictMode wraps QueryClientProvider and BrowserRouter. Route screens and nested project screens use React.lazy with RouteContent loading/error boundaries; failed chunks offer reload recovery without unmounting navigation. src/data.ts imports core types and maps server Dates to JSON strings; project-overview imports core time helper. No runtime backend/DB import enters browser code.
Vite root is apps/web, dev port 5173 strict loopback, file watching polls every 300ms, /api proxy to 8787, output dist with sourcemaps. Config comes from /api/config; no application VITE_* variable is read. Theme is the only explicit localStorage state (key theme); forms use component state.
Root pnpm build builds this app. Playwright config uses isolated 5217/8797 fixture servers and desktop/mobile Chromium with actual API/test DB and fake providers. CI also bundles the Cloudflare asset/API forwarding Worker.

Cloudflare serves matching static assets before the Worker; only /api/* uses run_worker_first. Vite copies public/_headers into dist so asset responses receive the CSP, nosniff and referrer policy; src/cloudflare.ts applies the same policy when its asset fallback runs. API response headers remain backend-owned.

The public landing page is a separate static entry within this child, not a second React application. `vite.landing.config.ts` builds `landing/index.html` and its CSS into `dist-landing`; `pnpm dev:landing` uses loopback port 5174. `pnpm build:landing` builds it alone, and root `pnpm build` includes it. No JavaScript, runtime dependencies, API proxy, provider bindings or environment variables are needed. `wrangler.landing.jsonc` deploys only these assets as `signs-of-life-landing`; CI checks its bundle separately. It is outside the supplied application's Docker runtime.
