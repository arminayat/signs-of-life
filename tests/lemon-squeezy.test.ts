import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { lemonSqueezy } from "../packages/adapters/src/monitoring/lemon-squeezy";
import type {
  CollectionInput,
  Credentials,
} from "../packages/core/src/monitoring";

const credentials: Credentials = {
  apiKey: "fixture-only",
  environment: "production",
  webhookSecret: "fixture-signing-secret",
};
const input: CollectionInput = {
  credentials,
  resourceId: "7",
  environment: "production",
  cursor: {},
  historical: true,
  from: "2026-01-01T00:00:00.000Z",
  until: "2026-02-01T00:00:00.000Z",
};
const created = "2026-01-03T10:00:00.000Z";
const updated = "2026-01-12T10:00:00.000Z";
function resource(
  type = "orders",
  id = "10",
  attributes: Record<string, unknown> = {},
) {
  return {
    type,
    id,
    attributes: {
      store_id: 7,
      test_mode: false,
      status: "paid",
      currency: "USD",
      total: 1599,
      created_at: created,
      updated_at: updated,
      billing_reason: "renewal",
      refunded_at: null,
      user_email: "never-store@example.test",
      user_name: "Never Store",
      urls: { invoice_url: "never-store" },
      ...attributes,
    },
  };
}
function page(data: unknown[], next?: string) {
  return { data, links: next ? { next } : {} };
}
function signed(type: string, data: unknown) {
  const raw = JSON.stringify({
    meta: { event_name: type, custom_data: { email: "never-store" } },
    data,
  });
  const signature = createHmac("sha256", credentials.webhookSecret)
    .update(raw)
    .digest("hex");
  return { raw, headers: new Headers({ "x-signature": signature }) };
}
function webhook(
  adapter: ReturnType<typeof lemonSqueezy>,
  type: string,
  data: unknown,
  c = credentials,
) {
  const message = signed(type, data);
  return adapter.webhook!(c, message.raw, message.headers);
}

describe("Lemon Squeezy", () => {
  it("discovers paginated stores with JSON:API headers and only allowlisted metadata", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          page(
            [resource("stores", "7", { name: "Store" })],
            "https://api.lemonsqueezy.com/v1/stores?page%5Bnumber%5D=2",
          ),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(page([resource("stores", "8", { name: "Second" })])),
      );
    expect(await lemonSqueezy(http).catalog(credentials)).toEqual([
      { id: "7", name: "Store", environment: "production" },
      { id: "8", name: "Second", environment: "production" },
    ]);
    expect(http.mock.calls[0][1]).toMatchObject({
      redirect: "manual",
      headers: {
        Authorization: "Bearer fixture-only",
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
    });
    expect(
      new URL(String(http.mock.calls[1][0])).searchParams.get("page[number]"),
    ).toBe("2");
  });

  it.each([401, 403, 429, 503])(
    "sanitizes HTTP %s failures",
    async (status) => {
      await expect(
        lemonSqueezy(async () =>
          Response.json(
            { user_email: "never-store" },
            { status, headers: { "retry-after": "125" } },
          ),
        ).catalog(credentials),
      ).rejects.toMatchObject({
        code:
          status === 401
            ? "provider_reconnect_required"
            : status === 403
              ? "provider_permission_denied"
              : `provider_http_${status}`,
        ...(status === 429 || status === 503 ? { retryAfterSeconds: 125 } : {}),
      });
    },
  );

  it.each([
    "https://attacker.example/v1/stores?page%5Bnumber%5D=2",
    "https://api.lemonsqueezy.com/v1/stores?page%5Bnumber%5D=1",
    "https://api.lemonsqueezy.com/v1/stores?page%5Bnumber%5D=3",
    "https://api.lemonsqueezy.com/v1/stores",
  ])("rejects unsafe or non-progressing pagination %s", async (next) => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(page([], next)));
    await expect(lemonSqueezy(http).catalog(credentials)).rejects.toMatchObject(
      { code: "provider_pagination_invalid" },
    );
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("scans both resources without stopping at old creation dates or persisting profiles", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          page(
            [
              resource("orders", "10", {
                status: "refunded",
                refunded_at: updated,
                created_at: "2025-01-01T00:00:00.000Z",
                refunded_amount: 1599,
              }),
              resource("orders", "11", { test_mode: true }),
            ],
            "https://api.lemonsqueezy.com/v1/orders?page%5Bnumber%5D=2",
          ),
        ),
      )
      .mockResolvedValueOnce(Response.json(page([resource("orders", "12")])))
      .mockResolvedValueOnce(
        Response.json(
          page([
            resource("subscription-invoices", "20", {
              billing_reason: "initial",
            }),
            resource("subscription-invoices", "21"),
            resource("subscription-invoices", "22", {
              billing_reason: "updated",
            }),
            resource("subscription-invoices", "23", { status: "pending" }),
          ]),
        ),
      );
    const adapter = lemonSqueezy(http);
    const first = await adapter.collect!(input);
    expect(first.cursor).toEqual({ stage: "orders", page: "2" });
    expect(first.events.map((event) => event.kind)).toEqual([
      "payment",
      "refund",
    ]);
    expect(first.events[1]).toMatchObject({
      id: "refund:order:10",
      occurredAt: updated,
    });
    expect(first.events[1]).not.toHaveProperty("amount");
    const second = await adapter.collect!({ ...input, cursor: first.cursor });
    expect(second.cursor).toEqual({
      stage: "subscription-invoices",
      page: "1",
    });
    const third = await adapter.collect!({ ...input, cursor: second.cursor });
    expect(third.done).toBe(true);
    expect(third.events.map((event) => [event.id, event.amount])).toEqual([
      ["renewal:invoice:21", "15.99"],
      ["payment:invoice:22", "15.99"],
    ]);
    for (const result of [first, second, third])
      expect(JSON.stringify(result)).not.toContain("never-store");
    for (const [url] of http.mock.calls)
      expect(new URL(String(url)).searchParams.get("filter[store_id]")).toBe(
        "7",
      );
  });

  it("rejects wrong-store rows and malformed scope instead of attributing them to the selected source", async () => {
    for (const attributes of [{ store_id: 9 }, { test_mode: undefined }]) {
      const adapter = lemonSqueezy(async () =>
        Response.json(page([resource("orders", "10", attributes)])),
      );
      await expect(adapter.collect!(input)).rejects.toMatchObject({
        code: attributes.store_id
          ? "provider_resource_mismatch"
          : "provider_response_invalid",
      });
    }
  });

  it("keeps initial order/invoice and payment recovery webhook duplicates out of billing counts", async () => {
    const http = vi.fn<typeof fetch>();
    const adapter = lemonSqueezy(http);
    const order = await webhook(adapter, "order_created", resource());
    const initial = await webhook(
      adapter,
      "subscription_payment_success",
      resource("subscription-invoices", "20", { billing_reason: "initial" }),
    );
    const renewal = await webhook(
      adapter,
      "subscription_payment_success",
      resource("subscription-invoices", "21"),
    );
    const recovery = await webhook(
      adapter,
      "subscription_payment_recovered",
      resource("subscription-invoices", "21"),
    );
    expect(order).toHaveLength(1);
    expect(initial).toEqual([]);
    expect(renewal).toEqual(recovery);
    expect(
      new Set(
        [...order, ...initial, ...renewal, ...recovery].map(
          (event) => event.id,
        ),
      ).size,
    ).toBe(2);
    expect(http).not.toHaveBeenCalled();
  });

  it("verifies raw body signatures before parsing, trusting event names only from the signed body", async () => {
    const http = vi.fn<typeof fetch>();
    const adapter = lemonSqueezy(http);
    const message = signed("order_created", resource());
    message.headers.set("x-event-name", "order_refunded");
    expect(
      (await adapter.webhook!(credentials, message.raw, message.headers))[0]
        .kind,
    ).toBe("payment");
    await expect(
      adapter.webhook!(credentials, `${message.raw} `, message.headers),
    ).rejects.toMatchObject({ code: "webhook_signature_invalid" });
    await expect(
      adapter.webhook!(
        credentials,
        message.raw,
        new Headers({ "x-signature": "invalid" }),
      ),
    ).rejects.toMatchObject({ code: "webhook_signature_invalid" });
    await expect(
      adapter.webhook!(
        { apiKey: "fixture-only" },
        message.raw,
        message.headers,
      ),
    ).rejects.toMatchObject({ code: "webhook_not_configured" });
    expect(http).not.toHaveBeenCalled();
  });

  it("deduplicates initial invoice refunds with order refunds through a verified subscription lookup", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: resource("subscriptions", "30", { order_id: 10 }),
      }),
    );
    const adapter = lemonSqueezy(http);
    const order = await webhook(
      adapter,
      "order_refunded",
      resource("orders", "10", {
        status: "partial_refund",
        refunded_amount: 100,
      }),
    );
    const invoice = await webhook(
      adapter,
      "subscription_payment_refunded",
      resource("subscription-invoices", "20", {
        subscription_id: 30,
        billing_reason: "initial",
        status: "partial_refund",
        refunded_amount: 100,
      }),
    );
    const repeated = await webhook(
      adapter,
      "order_refunded",
      resource("orders", "10", {
        status: "partial_refund",
        refunded_amount: 200,
        updated_at: "2026-01-13T10:00:00.000Z",
      }),
    );
    expect(order).toEqual(invoice);
    expect(order[0].id).toBe(repeated[0].id);
    expect(order[0]).not.toHaveProperty("amount");
    expect(String(http.mock.calls[0][0])).toBe(
      "https://api.lemonsqueezy.com/v1/subscriptions/30",
    );
    expect(JSON.stringify(invoice)).not.toContain("never-store");
  });

  it("rejects cross-store subscription hydration before merging refund identities", async () => {
    const adapter = lemonSqueezy(async () =>
      Response.json({
        data: resource("subscriptions", "30", { store_id: 9, order_id: 10 }),
      }),
    );
    await expect(
      webhook(
        adapter,
        "subscription_payment_refunded",
        resource("subscription-invoices", "20", {
          subscription_id: 30,
          billing_reason: "initial",
          status: "refunded",
        }),
      ),
    ).rejects.toMatchObject({ code: "provider_resource_mismatch" });
  });

  it("does not invent partial-refund timestamps from current API records", async () => {
    const adapter = lemonSqueezy(async () =>
      Response.json(
        page([
          resource("orders", "10", {
            status: "partial_refund",
            refunded_amount: 100,
          }),
        ]),
      ),
    );
    const history = await adapter.collect!(input);
    expect(history.events.map((event) => event.kind)).toEqual(["payment"]);
    const live = await webhook(
      adapter,
      "order_refunded",
      resource("orders", "10", {
        status: "partial_refund",
        refunded_amount: 100,
      }),
    );
    expect(live[0]).toMatchObject({ kind: "refund", occurredAt: updated });
  });

  it("uses cancellation and failed-attempt event timestamps, and separates repeated attempts", async () => {
    const adapter = lemonSqueezy(vi.fn<typeof fetch>());
    const cancellation = await webhook(
      adapter,
      "subscription_cancelled",
      resource("subscriptions", "30", {
        cancelled: true,
        ends_at: "2026-02-01T10:00:00.000Z",
      }),
    );
    expect(cancellation[0]).toMatchObject({
      kind: "cancellation",
      occurredAt: updated,
    });
    const failure = await webhook(
      adapter,
      "subscription_payment_failed",
      resource("subscription-invoices", "21", { status: "pending" }),
    );
    const next = await webhook(
      adapter,
      "subscription_payment_failed",
      resource("subscription-invoices", "21", {
        status: "pending",
        updated_at: "2026-01-13T10:00:00.000Z",
      }),
    );
    expect(failure[0].id).not.toBe(next[0].id);
    expect(failure[0]).not.toHaveProperty("amount");
  });

  it("separates sandbox data and ignores authenticated unrelated event types", async () => {
    const adapter = lemonSqueezy(vi.fn<typeof fetch>());
    expect(
      await webhook(
        adapter,
        "order_created",
        resource("orders", "10", { test_mode: true }),
      ),
    ).toEqual([]);
    expect(
      (
        await webhook(
          adapter,
          "order_created",
          resource("orders", "10", { test_mode: true }),
          { ...credentials, environment: "sandbox" },
        )
      )[0].environment,
    ).toBe("sandbox");
    expect(
      await webhook(adapter, "customer_updated", { type: "customers" }),
    ).toEqual([]);
  });

  it("advertises honest count definitions without synthetic financial metrics", async () => {
    const definitions = await lemonSqueezy(vi.fn<typeof fetch>()).definitions(
      credentials,
      "7",
    );
    expect(definitions.map((definition) => definition.id)).toEqual([
      "payment",
      "renewal",
      "refund",
      "cancellation",
      "payment_failed",
    ]);
    expect(
      definitions.find((definition) => definition.id === "refund")?.definition,
    ).toContain("once per payment");
  });
});
