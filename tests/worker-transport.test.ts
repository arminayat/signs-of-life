import { createRequire } from "node:module";
import { expect, it } from "vitest";

// Exercise the deployed runtime's Request implementation. Node fetch accepts
// redirect:error, whereas Workers requires manual handling of redirect status.
const require = createRequire(import.meta.url);
const dependency = (name: string) =>
  require(require.resolve(name, { paths: [require.resolve("wrangler")] }));
const { build } = dependency("esbuild");
const { Miniflare, convertV4MiniflareOptions } = dependency("miniflare");

it.each([200, 302])(
  "provider and channel transport handles HTTP %i inside Workers without following redirects",
  async (status) => {
    const built = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import { request } from './packages/adapters/src/monitoring/http';
          import { googlePlayReport } from './packages/adapters/src/monitoring/google-play-reports';
          import { webhookChannel } from './packages/adapters/src/webhook-channels';
          export default { async fetch() {
            const results = await Promise.allSettled([
              request(fetch, 'https://provider.example.test/json'),
              googlePlayReport(fetch, new URL('https://storage.googleapis.com/report'), {}, {remaining: 1000}),
              webhookChannel('slack').send('https://hooks.slack.com/services/TTEST/BTEST/fixture', {title:'Fixture',text:'Test'}, 'fixture'),
              webhookChannel('discord').send('https://discord.com/api/webhooks/123/fixture', {title:'Fixture',text:'Test'}, 'fixture')
            ]);
            return Response.json(results.map(result => result.status === 'fulfilled'
              ? result.value : {error: result.reason.code || result.reason.message}));
          }};
        `,
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
    });
    let calls = 0;
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: "2026-09-11",
        script: built.outputFiles[0].text,
        outboundService: (request: Request) => {
          calls++;
          const host = new URL(request.url).hostname;
          if (status === 302)
            return new Response(null, {
              status,
              headers: { location: "https://redirect.example.test/private" },
            });
          if (host === "hooks.slack.com") return new Response("ok");
          if (host === "discord.com") return Response.json({ id: "123" });
          if (host === "storage.googleapis.com")
            return new Response(Buffer.from("\ufeffDate", "utf16le"));
          return Response.json({ ok: true });
        },
      }),
    );
    try {
      const result = await (await mf.dispatchFetch("http://localhost")).json();
      expect(calls).toBe(4);
      expect(result).toEqual(
        status === 200
          ? [
              { ok: true },
              "Date",
              { status: "accepted" },
              { status: "accepted", providerId: "123" },
            ]
          : [
              { error: "provider_http_302" },
              { error: "provider_http_302" },
              { status: "failed", code: "slack_http_302" },
              { status: "failed", code: "discord_http_302" },
            ],
      );
    } finally {
      await mf.dispose();
    }
  },
);
