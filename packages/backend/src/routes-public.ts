import { adapterFor } from "./monitoring-access";
import { isMonitorKind, type Credentials } from "../../core/src/monitoring";
import { Hono } from "hono";
import { Webhook } from "svix";
import { z } from "zod";
import { assert } from "../../core/src/model";
import { equalSecret, hashToken } from "../../adapters/src/crypto";
import type { Services } from "./services";
export function publicRoutes(services: Services) {
  const app = new Hono();
  const { config, store } = services;
  app.post("/verify-email", async (c) => {
    assert(c.req.header("origin") === config.PUBLIC_URL, "invalid_origin", 403);
    const { token } = z
      .object({ token: z.string().min(30).max(100) })
      .parse(await c.req.json());
    const challenge = await store.useChallenge(await hashToken(token), "email");
    assert(challenge?.destinationId, "verification_link_expired_or_used");
    await store.updateDestination(
      challenge.workspaceId,
      challenge.destinationId,
      { verified: true, enabled: true },
    );
    return c.json({ success: true });
  });
  app.get("/unsubscribe/:token", (c) => {
    const token = z
      .string()
      .regex(/^[a-zA-Z0-9_-]{43}$/)
      .parse(c.req.param("token"));
    return c.html(
      `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe · Signs of Life</title><body style="font:18px system-ui;max-width:480px;margin:15vh auto;padding:24px"><h1>Pause email notifications?</h1><p>This will disable this email destination for all its projects.</p><form method="post" action="/api/unsubscribe/${token}"><button style="padding:12px 20px">Unsubscribe</button></form></body></html>`,
    );
  });
  app.post("/unsubscribe/:token", async (c) => {
    await store.unsubscribe(
      await hashToken(
        z
          .string()
          .regex(/^[a-zA-Z0-9_-]{43}$/)
          .parse(c.req.param("token")),
      ),
    );
    return c.html(
      '<!doctype html><html lang="en"><title>Unsubscribed</title><h1>Email notifications paused</h1><p>You can enable this destination again in Signs of Life.</p></html>',
    );
  });
  app.post("/webhooks/telegram", async (c) => {
    assert(
      config.TELEGRAM_WEBHOOK_SECRET &&
        (await equalSecret(
          c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "",
          config.TELEGRAM_WEBHOOK_SECRET,
        )),
      "invalid_webhook_signature",
      401,
    );
    const update = z
      .object({
        update_id: z.number().int(),
        message: z
          .object({
            text: z.string().optional(),
            chat: z.object({ id: z.number().int().safe(), type: z.string() }),
          })
          .optional(),
      })
      .parse(await c.req.json());
    if (update.message?.chat.type === "private") {
      const token = /^\/start(?:@\w+)? ([a-zA-Z0-9_-]{43})$/.exec(
        update.message.text ?? "",
      )?.[1];
      if (token) {
        const challenge = await store.useChallenge(
          await hashToken(token),
          "telegram",
        );
        if (challenge?.destinationId)
          await store.updateDestination(
            challenge.workspaceId,
            challenge.destinationId,
            {
              address: String(update.message.chat.id),
              verified: true,
              enabled: true,
            },
          );
      }
    }
    await store.receipt(`telegram:${update.update_id}`);
    return c.json({ ok: true });
  });
  app.post("/webhooks/monitor/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    const connection = await store.webhookConnection(id);
    assert(
      connection && isMonitorKind(connection.kind),
      "webhook_not_found",
      404,
    );
    assert(
      await store.rateLimit(`webhook:${id}`, 600, 60),
      "rate_limited",
      429,
    );
    const credentials = await services.secrets.open<Credentials>(
      connection.secret,
      id,
    );
    const adapter = adapterFor(
      services,
      connection.kind as import("../../core/src/monitoring").MonitorKind,
    );
    assert(adapter.webhook, "webhook_not_supported", 404);
    const observations = await adapter.webhook(
      credentials,
      await c.req.text(),
      c.req.raw.headers,
    );
    await store.acceptMonitorWebhook(connection, observations);
    return c.json({ accepted: true }, 202);
  });
  app.post("/webhooks/resend", async (c) => {
    assert(config.RESEND_WEBHOOK_SECRET, "resend_webhook_not_configured", 503);
    let event: unknown;
    try {
      event = new Webhook(config.RESEND_WEBHOOK_SECRET).verify(
        await c.req.text(),
        {
          "svix-id": c.req.header("svix-id") ?? "",
          "svix-timestamp": c.req.header("svix-timestamp") ?? "",
          "svix-signature": c.req.header("svix-signature") ?? "",
        },
      );
    } catch {
      return c.json({ error: "invalid_webhook_signature" }, 401);
    }
    const parsed = z
      .object({ type: z.string(), data: z.object({ email_id: z.string() }) })
      .parse(event);
    if (["email.bounced", "email.complained"].includes(parsed.type))
      await store.disableBounced(parsed.data.email_id);
    await store.receipt(`resend:${c.req.header("svix-id")}`);
    return c.json({ ok: true });
  });
  return app;
}
