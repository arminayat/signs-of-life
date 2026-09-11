import type {
  Channel,
  DeliveryOutcome,
  EmailTransport,
} from "../../core/src/model";
import { boundedText, type Http } from "./http";
function retry(response: Response): DeliveryOutcome {
  return {
    status: "retry",
    afterSeconds: Math.max(
      5,
      Math.min(3600, Number(response.headers.get("retry-after")) || 60),
    ),
    code: `provider_http_${response.status}`,
  };
}
export function telegramChannel(token: string, http: Http = fetch): Channel {
  return {
    async send(address, notification) {
      try {
        const response = await http(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: address,
              text: `${notification.title}\n\n${notification.text}`.slice(
                0,
                4000,
              ),
              link_preview_options: { is_disabled: true },
            }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        const body = JSON.parse(await boundedText(response, 100_000));
        if (response.status === 429)
          return {
            status: "retry",
            afterSeconds: Math.max(1, body.parameters?.retry_after ?? 60),
            code: "telegram_rate_limit",
          };
        if (response.status >= 500)
          return { status: "uncertain", code: "telegram_server_error" };
        if (!response.ok || !body.ok)
          return { status: "failed", code: `telegram_http_${response.status}` };
        return {
          status: "accepted",
          providerId: String(body.result.message_id),
        };
      } catch {
        return { status: "uncertain", code: "telegram_outcome_unknown" };
      }
    },
  };
}
export function emailChannel(transport: EmailTransport): Channel {
  return {
    send: (address, notification, idempotencyKey, unsubscribeUrl) =>
      transport.send({
        to: address,
        subject: notification.title,
        text: notification.text,
        idempotencyKey,
        unsubscribeUrl,
      }),
  };
}
export function resendTransport(
  apiKey: string,
  from: string,
  http: Http = fetch,
): EmailTransport {
  return {
    async send(message) {
      try {
        const response = await http("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text:
              message.text +
              (message.unsubscribeUrl
                ? `\n\nManage notifications: ${message.unsubscribeUrl}`
                : ""),
            headers: message.unsubscribeUrl
              ? {
                  "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                }
              : undefined,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          return retry(response);
        }
        if (!response.ok) {
          await response.body?.cancel();
          return { status: "failed", code: `resend_http_${response.status}` };
        }
        const data = JSON.parse(await boundedText(response, 100_000));
        return { status: "accepted", providerId: data.id };
      } catch {
        return {
          status: "retry",
          afterSeconds: 60,
          code: "resend_retry_idempotent",
        };
      }
    },
  };
}
