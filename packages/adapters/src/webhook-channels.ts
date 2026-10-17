import { AppError, type Channel } from "../../core/src/model";
import { boundedText, type Http } from "./http";

export type WebhookChannelKind = "slack" | "discord";

export function webhookAddress(
  kind: WebhookChannelKind,
  value: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("invalid_webhook_url");
  }
  const validPath =
    kind === "slack"
      ? url.hostname === "hooks.slack.com" &&
        /^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(
          url.pathname,
        )
      : url.hostname === "discord.com" &&
        /^\/api(?:\/v10)?\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(
          url.pathname,
        );
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !validPath ||
    value.includes("\\")
  )
    throw new AppError("invalid_webhook_url");
  return url.href;
}

export function webhookChannel(
  kind: WebhookChannelKind,
  http: Http = fetch,
): Channel {
  return {
    async send(address, notification) {
      let url: URL;
      try {
        url = new URL(webhookAddress(kind, address));
      } catch {
        return { status: "failed", code: "invalid_webhook_url" };
      }
      const text = `${notification.title}\n\n${notification.text}`;
      if (kind === "discord") url.searchParams.set("wait", "true");
      try {
        const response = await http(url.href, {
          method: "POST",
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "slack"
              ? {
                  text: text
                    .slice(0, 4000)
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;"),
                  mrkdwn: false,
                  link_names: false,
                  unfurl_links: false,
                  unfurl_media: false,
                }
              : {
                  content: text.slice(0, 2000),
                  allowed_mentions: { parse: [] },
                  flags: 4,
                },
          ),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 429) {
          let delay = Number(response.headers.get("retry-after"));
          if (kind === "discord" && !(delay > 0)) {
            try {
              const body = JSON.parse(await boundedText(response, 100_000));
              delay = Number(body.retry_after);
            } catch {
              /* A rate-limit response is known not to have sent. */
            }
          } else await response.body?.cancel();
          return {
            status: "retry",
            afterSeconds:
              Number.isFinite(delay) && delay > 0
                ? Math.max(1, Math.min(86400, Math.ceil(delay)))
                : 60,
            code: `${kind}_rate_limit`,
          };
        }
        if (response.status >= 500) {
          await response.body?.cancel();
          return { status: "uncertain", code: `${kind}_server_error` };
        }
        if (!response.ok) {
          await response.body?.cancel();
          return { status: "failed", code: `${kind}_http_${response.status}` };
        }
        const body = await boundedText(response, 100_000);
        if (kind === "slack")
          return body.trim() === "ok"
            ? { status: "accepted" }
            : { status: "uncertain", code: "slack_outcome_unknown" };
        const data = JSON.parse(body);
        return typeof data.id === "string" && /^\d+$/.test(data.id)
          ? { status: "accepted", providerId: data.id }
          : { status: "uncertain", code: "discord_outcome_unknown" };
      } catch {
        return { status: "uncertain", code: `${kind}_outcome_unknown` };
      }
    },
  };
}
