import { Hono } from "hono";
import { z } from "zod";
import { assert } from "../../core/src/model";
import { hashToken, randomToken } from "../../adapters/src/crypto";
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
  const token = randomToken(),
    hash = await hashToken(token);
  await store.challenge({
    hash,
    workspaceId: destination.workspaceId,
    destinationId: destination.id,
    purpose: destination.kind,
    secret: null,
    expiresAt: new Date(
      Date.now() + (destination.kind === "email" ? 86400_000 : 600_000),
    ),
  });
  if (destination.kind === "telegram")
    return {
      url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${token}`,
    };
  await store.enqueueDelivery({
    workspaceId: destination.workspaceId,
    projectId: null,
    destinationId: destination.id,
    key: `verify:${hash}`,
    purpose: "verification",
    notification: {
      title: "Verify your Product Monitor destination",
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
        kind: z.enum(["email", "telegram"]),
        address: z.string().max(254).optional(),
      })
      .parse(await c.req.json());
    assert(services.channels[input.kind], "channel_not_configured", 503);
    assert(
      await store.rateLimit(`destination:${c.get("workspaceId")}`, 10, 3600),
      "rate_limited",
      429,
    );
    const address =
      input.kind === "email"
        ? z.email().parse(input.address).toLowerCase()
        : "";
    if (address)
      assert(
        await store.rateLimit(`recipient:${await hashToken(address)}`, 5, 3600),
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
        text: "This is a test from Product Monitor. New account alerts and daily download reports will arrive here when enabled for a project.",
      },
    });
    return c.json({ queued: true }, 202);
  });
  return app;
}
