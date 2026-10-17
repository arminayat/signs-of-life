import { describe, expect, it, vi } from "vitest";
import {
  webhookAddress,
  webhookChannel,
} from "../packages/adapters/src/webhook-channels";

const urls = {
  slack: "https://hooks.slack.com/services/TTEST/BTEST/fixtureToken",
  discord: "https://discord.com/api/webhooks/123456789/fixture_token",
};
const notification = {
  title: "Product update",
  text: "<!channel> @everyone <@123> & news",
};

describe("incoming webhook channels", () => {
  it.each(["slack", "discord"] as const)(
    "rejects untrusted %s URLs before HTTP",
    async (kind) => {
      const http = vi.fn();
      const invalid = [
        "http://127.0.0.1/private",
        "https://localhost/private",
        urls[kind].replace("https:", "http:"),
        urls[kind].replace(".com/", ".com.attacker.test/"),
        urls[kind].replace("https://", "https://username:password@"),
        urls[kind].replace(".com/", ".com:8443/"),
        `${urls[kind]}?redirect=https://attacker.test`,
        `${urls[kind]}#secret`,
        `${urls[kind]}/messages/123`,
        urls[kind].replace("fixture", "%66ixture"),
        urls[kind === "slack" ? "discord" : "slack"],
      ];
      for (const address of invalid) {
        expect(() => webhookAddress(kind, address)).toThrow(
          "invalid_webhook_url",
        );
        expect(
          await webhookChannel(kind, http).send(address, notification, "id"),
        ).toEqual({
          status: "failed",
          code: "invalid_webhook_url",
        });
      }
      expect(http).not.toHaveBeenCalled();
    },
  );

  it("escapes Slack mentions and requires its acknowledgement", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    expect(
      await webhookChannel("slack", http).send(urls.slack, notification, "id"),
    ).toEqual({ status: "accepted" });
    const [url, request] = http.mock.calls[0];
    expect(url).toBe(urls.slack);
    expect(request?.redirect).toBe("manual");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      text: "Product update\n\n&lt;!channel&gt; @everyone &lt;@123&gt; &amp; news",
      mrkdwn: false,
      link_names: false,
      unfurl_links: false,
      unfurl_media: false,
    });
    expect(
      await webhookChannel(
        "slack",
        async () => new Response("unexpected"),
      ).send(urls.slack, notification, "id"),
    ).toEqual({ status: "uncertain", code: "slack_outcome_unknown" });
  });

  it("waits for Discord message acceptance and disables all mentions and embeds", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "987654321" }));
    expect(
      await webhookChannel("discord", http).send(
        urls.discord,
        {
          title: "Title",
          text: "@everyone".repeat(1000),
        },
        "id",
      ),
    ).toEqual({ status: "accepted", providerId: "987654321" });
    const [url, request] = http.mock.calls[0];
    expect(url).toBe(`${urls.discord}?wait=true`);
    expect(request?.redirect).toBe("manual");
    const body = JSON.parse(String(request?.body));
    expect(body.content).toHaveLength(2000);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.flags).toBe(4);
    expect(
      webhookAddress("discord", urls.discord.replace("/api/", "/api/v10/")),
    ).toContain("/api/v10/webhooks/");
  });

  it.each(["slack", "discord"] as const)(
    "retries only definite %s rate limits",
    async (kind) => {
      for (const status of [400, 403, 404, 410, 302]) {
        const outcome = await webhookChannel(
          kind,
          async () => new Response("private provider payload", { status }),
        ).send(urls[kind], notification, "id");
        expect(outcome).toEqual({
          status: "failed",
          code: `${kind}_http_${status}`,
        });
      }
      for (const status of [500, 502, 503])
        expect(
          await webhookChannel(
            kind,
            async () => new Response("provider payload", { status }),
          ).send(urls[kind], notification, "id"),
        ).toEqual({ status: "uncertain", code: `${kind}_server_error` });
      expect(
        await webhookChannel(
          kind,
          async () =>
            new Response("slow down", {
              status: 429,
              headers: { "retry-after": "3.5" },
            }),
        ).send(urls[kind], notification, "id"),
      ).toEqual({
        status: "retry",
        afterSeconds: 4,
        code: `${kind}_rate_limit`,
      });
      const network = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error(`timeout ${urls[kind]}`));
      const outcome = await webhookChannel(kind, network).send(
        urls[kind],
        notification,
        "id",
      );
      expect(outcome).toEqual({
        status: "uncertain",
        code: `${kind}_outcome_unknown`,
      });
      expect(JSON.stringify(outcome)).not.toContain(urls[kind]);
      expect(network).toHaveBeenCalledTimes(1);
    },
  );

  it("handles Discord JSON rate limits and treats missing acceptance as uncertain", async () => {
    expect(
      await webhookChannel("discord", async () =>
        Response.json({ retry_after: 2.1 }, { status: 429 }),
      ).send(urls.discord, notification, "id"),
    ).toEqual({ status: "retry", afterSeconds: 3, code: "discord_rate_limit" });
    for (const response of [
      new Response(null, { status: 204 }),
      Response.json({}),
      Response.json({ id: 42 }),
      new Response("x".repeat(100_001)),
    ])
      expect(
        await webhookChannel("discord", async () => response).send(
          urls.discord,
          notification,
          "id",
        ),
      ).toEqual({ status: "uncertain", code: "discord_outcome_unknown" });
  });

  it.each(["slack", "discord"] as const)(
    "bounds %s Retry-After so the worker can safely reschedule",
    async (kind) => {
      const outcome = await webhookChannel(
        kind,
        async () =>
          new Response(null, {
            status: 429,
            headers: { "retry-after": "1e300" },
          }),
      ).send(urls[kind], notification, "id");
      expect(outcome).toEqual({
        status: "retry",
        afterSeconds: 86400,
        code: `${kind}_rate_limit`,
      });
    },
  );

  it("also bounds Discord rate limits supplied in the JSON body", async () => {
    expect(
      await webhookChannel("discord", async () =>
        Response.json({ retry_after: 1e300 }, { status: 429 }),
      ).send(urls.discord, notification, "id"),
    ).toEqual({
      status: "retry",
      afterSeconds: 86400,
      code: "discord_rate_limit",
    });
  });
});
