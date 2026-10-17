import { AppError, assert } from "../../../core/src/model";
import type {
  CollectionPage,
  Credentials,
  ProviderAdapter,
  Resource,
} from "../../../core/src/monitoring";
import { equalSecret } from "../crypto";
import type { Http } from "../http";
import { billingDefinitions } from "./billing-common";
import {
  array,
  headers,
  nextParameter,
  object,
  request,
  string,
  url,
  type ObjectValue,
} from "./http";
import {
  lemonEnvironment,
  lemonId,
  lemonLifecycle,
  lemonPayment,
  lemonRefund,
  lemonResource,
  lemonScope,
} from "./lemon-squeezy-normalize";

const host = "https://api.lemonsqueezy.com";
const coverage =
  "Order and subscription-invoice history, using transaction creation dates for polled payments and authenticated transition timestamps for invoice payment webhooks. Initial subscription payments belong to orders only. Full refunds are reconciled, including verified initial-invoice refunds; partial refunds, cancellations and payment failures require webhooks. Refunds count each refunded payment once, without monetary totals or individual partial-refund history.";

function apiHeaders(c: Credentials) {
  return {
    ...headers(c),
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

function nextPage(result: ObjectValue, page: number) {
  const link = object(result.links).next;
  if (link == null) return undefined;
  const next = nextParameter(link, host, "page[number]");
  assert(next, "provider_pagination_invalid", 502);
  assert(
    /^\d+$/.test(next) && Number(next) === page + 1 && Number(next) <= 10_000,
    "provider_pagination_invalid",
    502,
  );
  return next;
}

async function signedPayload(c: Credentials, raw: string, h: Headers) {
  assert(c.webhookSecret, "webhook_not_configured", 404);
  const signature = h.get("x-signature") || "";
  assert(/^[a-fA-F0-9]{64}$/.test(signature), "webhook_signature_invalid", 401);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  ).toString("hex");
  assert(
    await equalSecret(signature.toLowerCase(), expected),
    "webhook_signature_invalid",
    401,
  );
  try {
    return object(JSON.parse(raw));
  } catch {
    throw new AppError("webhook_payload_invalid", 400);
  }
}

export function lemonSqueezy(http: Http): ProviderAdapter {
  async function initialOrderId(c: Credentials, attributes: ObjectValue) {
    const scope = lemonScope(attributes);
    const subscriptionId = lemonId(attributes.subscription_id);
    const result = object(
      await request(http, url(host, `/v1/subscriptions/${subscriptionId}`), {
        headers: apiHeaders(c),
      }),
    );
    const subscription = lemonResource(result.data, "subscriptions");
    const subscriptionScope = lemonScope(subscription.attributes);
    assert(
      subscription.id === subscriptionId &&
        subscriptionScope.resourceId === scope.resourceId &&
        subscriptionScope.environment === scope.environment,
      "provider_resource_mismatch",
      502,
    );
    return lemonId(subscription.attributes.order_id);
  }
  return {
    async catalog(c) {
      const environment = lemonEnvironment(c);
      const resources: Resource[] = [];
      let page = 1;
      for (;;) {
        const data = object(
          await request(
            http,
            url(host, "/v1/stores", {
              "page[number]": page,
              "page[size]": 100,
            }),
            { headers: apiHeaders(c) },
          ),
        );
        resources.push(
          ...array(data.data).map((value) => {
            const row = lemonResource(value, "stores");
            return {
              id: row.id,
              name: string(row.attributes.name),
              environment,
            };
          }),
        );
        const next = nextPage(data, page);
        if (!next) break;
        assert(page < 100, "provider_catalog_too_large", 422);
        page = Number(next);
      }
      return resources;
    },
    definitions: async () =>
      billingDefinitions.map((definition) => ({
        ...definition,
        ...(definition.id === "refund"
          ? {
              label: "Refunded payments",
              definition:
                "Orders and subscription invoices observed refunded, counted once per payment. Repeated partial refunds are not separate observations; no refund monetary total is inferred.",
            }
          : {}),
        ...(definition.id === "cancellation" ||
        definition.id === "payment_failed"
          ? {
              definition: `${definition.definition} Webhook observations only; no historical replay is available.`,
            }
          : {}),
      })),
    async collect(input): Promise<CollectionPage> {
      const stage = input.cursor.stage || "orders";
      const page = Number(input.cursor.page || "1");
      assert(
        stage === "orders" || stage === "subscription-invoices",
        "provider_cursor_invalid",
      );
      assert(
        Number.isSafeInteger(page) && page > 0 && page <= 10_000,
        "provider_cursor_invalid",
      );
      assert(
        input.environment === lemonEnvironment(input.credentials),
        "provider_environment_mismatch",
      );
      const resourceId = lemonId(input.resourceId);
      const result = object(
        await request(
          http,
          url(host, `/v1/${stage}`, {
            "filter[store_id]": resourceId,
            "page[number]": page,
            "page[size]": stage === "orders" ? 100 : 25,
          }),
          { headers: apiHeaders(input.credentials) },
        ),
      );
      const rows = array(result.data);
      assert(
        rows.length <= (stage === "orders" ? 100 : 25),
        "provider_response_too_large",
        502,
      );
      const normalize = async (value: unknown) => {
        const row = lemonResource(value, stage);
        const scope = lemonScope(row.attributes);
        assert(
          scope.resourceId === resourceId,
          "provider_resource_mismatch",
          502,
        );
        if (scope.environment !== input.environment) return [];
        const orderId =
          stage === "subscription-invoices" &&
          row.attributes.billing_reason === "initial" &&
          row.attributes.refunded_at &&
          ["refunded", "partial_refund"].includes(String(row.attributes.status))
            ? await initialOrderId(input.credentials, row.attributes)
            : undefined;
        return [
          ...lemonPayment(value, stage),
          ...lemonRefund(value, stage, false, orderId),
        ];
      };
      const events = [];
      for (let index = 0; index < rows.length; index += 5)
        events.push(
          ...(
            await Promise.all(rows.slice(index, index + 5).map(normalize))
          ).flat(),
        );
      // No created-at early exit: an old order may have been refunded recently.
      const next = nextPage(result, page);
      return {
        events,
        cursor: next
          ? { stage, page: next }
          : stage === "orders"
            ? { stage: "subscription-invoices", page: "1" }
            : {},
        done: !next && stage === "subscription-invoices",
        coverage,
      };
    },
    async webhook(c, raw, h) {
      const payload = await signedPayload(c, raw, h);
      const type = string(object(payload.meta).event_name);
      if (
        ![
          "order_created",
          "order_refunded",
          "subscription_payment_success",
          "subscription_payment_recovered",
          "subscription_cancelled",
          "subscription_payment_failed",
          "subscription_payment_refunded",
        ].includes(type)
      )
        return [];
      const row = object(payload.data);
      const attributes = object(row.attributes);
      const scope = lemonScope(attributes);
      if (scope.environment !== lemonEnvironment(c)) return [];
      if (type === "order_created") return lemonPayment(row, "orders");
      if (type === "order_refunded") return lemonRefund(row, "orders", true);
      if (
        type === "subscription_payment_success" ||
        type === "subscription_payment_recovered"
      )
        return lemonPayment(row, "subscription-invoices", true);
      if (
        type === "subscription_cancelled" ||
        type === "subscription_payment_failed"
      )
        return lemonLifecycle(row, type);
      if (type !== "subscription_payment_refunded") return [];
      const orderId =
        attributes.billing_reason === "initial"
          ? await initialOrderId(c, attributes)
          : undefined;
      return lemonRefund(row, "subscription-invoices", true, orderId);
    },
  };
}
