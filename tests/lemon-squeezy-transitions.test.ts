import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { lemonSqueezy } from "../packages/adapters/src/monitoring/lemon-squeezy";
import type { CollectionInput } from "../packages/core/src/monitoring";

const credentials = {
  apiKey: "fixture",
  environment: "production",
  webhookSecret: "fixture-signing-secret",
};
const created = "2025-12-30T10:00:00.000Z";
const updated = "2026-01-12T10:00:00.000Z";
const input: CollectionInput = {
  credentials,
  resourceId: "7",
  environment: "production",
  cursor: { stage: "subscription-invoices", page: "1" },
  historical: true,
  from: "2025-01-01T00:00:00.000Z",
  until: "2026-01-01T00:00:00.000Z",
};
function resource(
  type = "subscription-invoices",
  id = "20",
  attributes: Record<string, unknown> = {},
) {
  return {
    type,
    id,
    attributes: {
      store_id: 7,
      subscription_id: 30,
      test_mode: false,
      status: "paid",
      currency: "USD",
      total: 1599,
      created_at: created,
      updated_at: updated,
      billing_reason: "renewal",
      refunded: false,
      refunded_at: null,
      ...attributes,
    },
  };
}
function webhook(
  adapter: ReturnType<typeof lemonSqueezy>,
  type: string,
  data: unknown,
) {
  const raw = JSON.stringify({ meta: { event_name: type }, data });
  const signature = createHmac("sha256", credentials.webhookSecret)
    .update(raw)
    .digest("hex");
  return adapter.webhook!(
    credentials,
    raw,
    new Headers({ "x-signature": signature }),
  );
}

describe("Lemon Squeezy payment transitions", () => {
  it.each(["renewal", "updated"])(
    "dates signed %s payment transitions at success, retaining the polled invoice identity",
    async (billing_reason) => {
      const invoice = resource("subscription-invoices", "20", {
        billing_reason,
      });
      const adapter = lemonSqueezy(async () =>
        Response.json({ data: [invoice], links: {} }),
      );
      const historical = await adapter.collect!(input);
      const success = await webhook(
        adapter,
        "subscription_payment_success",
        invoice,
      );
      const recovered = await webhook(
        adapter,
        "subscription_payment_recovered",
        invoice,
      );
      expect(historical.events[0].occurredAt).toBe(created);
      expect(historical.events[0]).not.toHaveProperty("occurredAtSource");
      expect(success[0]).toMatchObject({
        occurredAt: updated,
        occurredAtSource: "payment_webhook",
        id: historical.events[0].id,
        reference: historical.events[0].reference,
      });
      expect(success).toEqual(recovered);
    },
  );

  it("leaves order creation timestamps unmarked and suppresses initial invoice payments", async () => {
    const adapter = lemonSqueezy(vi.fn<typeof fetch>());
    const order = await webhook(adapter, "order_created", resource("orders"));
    expect(order[0].occurredAt).toBe(created);
    expect(order[0]).not.toHaveProperty("occurredAtSource");
    expect(
      await webhook(
        adapter,
        "subscription_payment_success",
        resource("subscription-invoices", "20", { billing_reason: "initial" }),
      ),
    ).toEqual([]);
  });

  it.each(["orders", "subscription-invoices"])(
    "accepts the documented paid-status partial refund for %s only from a signed refund event",
    async (type) => {
      const row = resource(type, "20", { refunded_amount: 100 });
      const adapter = lemonSqueezy(async () =>
        Response.json({ data: [row], links: {} }),
      );
      const history = await adapter.collect!({
        ...input,
        cursor: { stage: type, page: "1" },
      });
      expect(history.events.some((event) => event.kind === "refund")).toBe(
        false,
      );
      const refunded = await webhook(
        adapter,
        type === "orders" ? "order_refunded" : "subscription_payment_refunded",
        row,
      );
      expect(refunded).toHaveLength(1);
      expect(refunded[0]).toMatchObject({
        kind: "refund",
        occurredAt: updated,
      });
      expect(refunded[0]).not.toHaveProperty("amount");
      expect(refunded[0]).not.toHaveProperty("occurredAtSource");
    },
  );

  it.each([-1, 1.5, "invalid", Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed signed partial refund amounts %s",
    async (refunded_amount) => {
      const adapter = lemonSqueezy(vi.fn<typeof fetch>());
      await expect(
        webhook(
          adapter,
          "subscription_payment_refunded",
          resource("subscription-invoices", "20", { refunded_amount }),
        ),
      ).rejects.toThrow();
    },
  );

  it("does not treat zero refunded cents as a paid-status refund", async () => {
    expect(
      await webhook(
        lemonSqueezy(vi.fn<typeof fetch>()),
        "subscription_payment_refunded",
        resource("subscription-invoices", "20", { refunded_amount: 0 }),
      ),
    ).toEqual([]);
  });

  it("reconciles initial full invoice refunds with verified order identity and at most five concurrent lookups", async () => {
    let active = 0;
    let maximum = 0;
    const invoices = Array.from({ length: 12 }, (_, index) =>
      resource("subscription-invoices", String(index + 1), {
        subscription_id: index + 100,
        billing_reason: "initial",
        status: "refunded",
        refunded: true,
        refunded_at: updated,
      }),
    );
    const http = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const target = new URL(String(input));
      if (target.pathname === "/v1/subscription-invoices")
        return Response.json({ data: invoices, links: {} });
      const subscriptionId = target.pathname.split("/").at(-1)!;
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return Response.json({
        data: resource("subscriptions", subscriptionId, {
          order_id: Number(subscriptionId) + 100,
        }),
      });
    });
    const result = await lemonSqueezy(http).collect!(input);
    expect(result.events).toHaveLength(12);
    expect(
      result.events.every(
        (event) => event.kind === "refund" && event.occurredAt === updated,
      ),
    ).toBe(true);
    expect(result.events[0].id).toBe("refund:order:200");
    expect(maximum).toBe(5);
    expect(http).toHaveBeenCalledTimes(13);
    expect(
      new URL(String(http.mock.calls[0][0])).searchParams.get("page[size]"),
    ).toBe("25");
  });

  it("rejects wrong-store subscription lookup results during initial refund reconciliation", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            resource("subscription-invoices", "20", {
              billing_reason: "initial",
              status: "refunded",
              refunded_at: updated,
            }),
          ],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: resource("subscriptions", "30", { store_id: 8, order_id: 10 }),
        }),
      );
    await expect(lemonSqueezy(http).collect!(input)).rejects.toMatchObject({
      code: "provider_resource_mismatch",
    });
  });
});
