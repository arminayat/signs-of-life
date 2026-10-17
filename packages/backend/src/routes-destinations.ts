import { Hono } from "hono";
import { z } from "zod";
import { assert } from "../../core/src/model";
import { hashToken, randomToken } from "../../adapters/src/crypto";
import { webhookAddress } from "../../adapters/src/webhook-channels";
import { idSchema, textName, type ApiEnv } from "./api";
import type { Services } from "./services";
import type { Destination } from "../../core/src/store";
async function verifyDestination(services: Services, destination: Destination) {
  const { store, config } = services;
  assert(
    await store.rateLimit(`verify:${destination.id}`, 3, 3600),
    "verification_rate_limited",
    429,
  );
  const webhook =
    destination.kind === "slack" || destination.kind === "discord";
  const token = webhook ? randomToken().slice(0, 12) : randomToken(),
    hash = await hashToken(token);
  await store.challenge({
    hash,
    workspaceId: destination.workspaceId,
    destinationId: destination.id,
    purpose: webhook
      ? `webhook:${destination.kind}:${destination.id}`
      : destination.kind,
    secret: null,
    expiresAt: new Date(
      Date.now() + (destination.kind === "email" ? 86400_000 : 600_000),
    ),
  });
  if (destination.kind === "telegram")
    return {
      url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${token}`,
    };
  if (webhook) {
    // Discord interprets underscores as Markdown; code formatting preserves
    // every character when the operator copies the verification code.
    const displayCode = destination.kind === "discord" ? `\`${token}\`` : token;
    await store.enqueueDelivery({
      workspaceId: destination.workspaceId,
      projectId: null,
      destinationId: destination.id,
      key: `verify:${hash}`,
      purpose: "verification",
      notification: {
        title: "Verify your Signs of Life destination",
        text: `Enter this code in Signs of Life to enable notifications here:\n\n${displayCode}\n\nThis code expires in 10 minutes. If you did not request this, ignore it and revoke this webhook.`,
      },
    });
    return { verificationSent: true, codeRequired: true };
  }
  await store.enqueueDelivery({
    workspaceId: destination.workspaceId,
    projectId: null,
    destinationId: destination.id,
    key: `verify:${hash}`,
    purpose: "verification",
    notification: {
      title: "Verify your Signs of Life destination",
      text: `Confirm this email address to receive project notifications.\n\n${config.PUBLIC_URL}/verify?token=${token}\n\nThis link expires in 24 hours. If you did not request this, you can ignore this message.`,
    },
  });
  return { verificationSent: true };
}
export function destinationRoutes(services: Services) {
  const app = new Hono<ApiEnv>();
  const { store, config } = services;
  app.post("/destinations", async (c) => {
    const input = z
      .object({
        name: textName,
        kind: z.enum(["email", "telegram", "slack", "discord"]),
        address: z.string().max(254).optional(),
        webhookUrl: z.string().trim().max(2048).optional(),
      })
      .parse(await c.req.json());
    assert(services.channels[input.kind], "channel_not_configured", 503);
    assert(
      await store.rateLimit(`destination:${c.get("workspaceId")}`, 10, 3600),
      "rate_limited",
      429,
    );
    const webhook =
      input.kind === "slack" || input.kind === "discord"
        ? webhookAddress(input.kind, input.webhookUrl ?? "")
        : undefined;
    const address =
      input.kind === "email"
        ? z.email().parse(input.address).toLowerCase()
        : webhook
          ? `${input.kind === "slack" ? "Slack" : "Discord"} channel`
          : "";
    if (webhook || address)
      assert(
        await store.rateLimit(
          `recipient:${await hashToken(webhook ?? address)}`,
          5,
          3600,
        ),
        "recipient_rate_limited",
        429,
      );
    const id = crypto.randomUUID();
    const unsubscribeToken = await hashToken(
      `${config.AUTH_SECRET}:unsubscribe:${id}`,
    );
    await store.createDestination(
      {
        id,
        workspaceId: c.get("workspaceId"),
        kind: input.kind,
        name: input.name,
        address,
        secret: webhook
          ? await services.secrets.seal({ url: webhook }, id)
          : null,
        unsubscribeHash: await hashToken(unsubscribeToken),
      },
      config.MAX_DESTINATIONS,
    );
    const destination = await store.destination(c.get("workspaceId"), id);
    assert(destination, "destination_not_found", 404);
    return c.json(
      { id, ...(await verifyDestination(services, destination)) },
      201,
    );
  });
  app.post("/destinations/:id/verify", async (c) => {
    const destination = await store.destination(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(
      destination && !destination.verified,
      "destination_not_pending",
      404,
    );
    return c.json(await verifyDestination(services, destination));
  });
  app.patch("/destinations/:id", async (c) => {
    const patch = z
      .object({ enabled: z.boolean().optional(), name: textName.optional() })
      .parse(await c.req.json());
    await store.updateDestination(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
      patch,
    );
    return c.json({ success: true });
  });
  app.post("/destinations/:id/confirm", async (c) => {
    const destination = await store.destination(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(
      destination &&
        !destination.verified &&
        (destination.kind === "slack" || destination.kind === "discord"),
      "destination_not_pending",
      404,
    );
    assert(
      await store.rateLimit(`confirm:${destination.id}`, 10, 3600),
      "verification_rate_limited",
      429,
    );
    const { code } = z
      .object({ code: z.string().trim().min(1).max(128) })
      .parse(await c.req.json());
    const challenge = await store.useChallenge(
      await hashToken(code),
      `webhook:${destination.kind}:${destination.id}`,
      c.get("workspaceId"),
    );
    assert(
      challenge?.destinationId === destination.id,
      "verification_code_expired_or_invalid",
    );
    await store.updateDestination(c.get("workspaceId"), destination.id, {
      verified: true,
    });
    return c.json({ verified: true });
  });
  app.delete("/destinations/:id", async (c) => {
    await store.deleteDestination(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    return c.json({ success: true });
  });
  app.post("/destinations/:id/test", async (c) => {
    const destination = await store.destination(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    assert(
      destination?.verified && destination.enabled,
      "destination_not_verified_or_disabled",
    );
    assert(
      await store.rateLimit(`test:${destination.id}`, 5, 3600),
      "rate_limited",
      429,
    );
    await store.enqueueDelivery({
      workspaceId: c.get("workspaceId"),
      projectId: null,
      destinationId: destination.id,
      key: `test:${crypto.randomUUID()}`,
      notification: {
        title: "Your notifications are connected",
        text: "This is a test from Signs of Life. Project alerts and daily summaries will arrive here when enabled in your notification preferences.",
      },
    });
    return c.json({ queued: true }, 202);
  });
  return app;
}
