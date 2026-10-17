import { assert } from "../../../core/src/model";
import type {
  Credentials,
  EventKind,
  Observation,
} from "../../../core/src/monitoring";
import { billingEvent, minorAmount } from "./billing-common";
import { iso, object, string, type ObjectValue } from "./http";

export function lemonId(value: unknown): string {
  const id =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : string(value);
  assert(/^[1-9]\d{0,99}$/.test(id), "provider_response_invalid", 502);
  return id;
}

export function lemonEnvironment(c: Credentials) {
  const environment = c.environment || "production";
  assert(
    ["production", "sandbox"].includes(environment),
    "invalid_lemon_squeezy_environment",
  );
  return environment;
}

export function lemonResource(value: unknown, expectedType: string) {
  const row = object(value);
  assert(row.type === expectedType, "provider_response_invalid", 502);
  return { id: lemonId(row.id), attributes: object(row.attributes) };
}

export function lemonScope(row: ObjectValue) {
  assert(typeof row.test_mode === "boolean", "provider_response_invalid", 502);
  return {
    resourceId: lemonId(row.store_id),
    environment: row.test_mode ? "sandbox" : "production",
  };
}

function event(
  row: ObjectValue,
  id: string,
  kind: EventKind,
  at: unknown,
  money = false,
): Observation {
  const scope = lemonScope(row);
  const result = billingEvent(
    "lemon-squeezy",
    scope.resourceId,
    scope.environment,
    id,
    kind,
    at,
  );
  if (money) {
    const currency = string(row.currency).toUpperCase();
    assert(/^[A-Z]{3}$/.test(currency), "provider_response_invalid", 502);
    // Lemon Squeezy documents these values in cents, not locale-dependent digits.
    result.amount = minorAmount(row.total, currency, 2);
    assert(!result.amount.startsWith("-"), "provider_amount_invalid", 502);
    result.currency = currency;
  }
  return result;
}

export function lemonPayment(
  value: unknown,
  type: "orders" | "subscription-invoices",
  webhook = false,
) {
  const { id, attributes: row } = lemonResource(value, type);
  if (!["paid", "refunded", "partial_refund"].includes(String(row.status)))
    return [];
  if (type === "orders")
    return [event(row, `order:${id}`, "payment", row.created_at, true)];
  assert(
    ["initial", "renewal", "updated"].includes(String(row.billing_reason)),
    "provider_response_invalid",
    502,
  );
  // Initial purchases also create an order. The order alone owns this payment.
  if (row.billing_reason === "initial") return [];
  const payment = event(
    row,
    `invoice:${id}`,
    row.billing_reason === "renewal" ? "renewal" : "payment",
    webhook ? row.updated_at : row.created_at,
    true,
  );
  // Only an authenticated success/recovery transition establishes when a
  // previously pending invoice was paid. A list response does not.
  return [
    webhook
      ? { ...payment, occurredAtSource: "payment_webhook" as const }
      : payment,
  ];
}

export function lemonRefund(
  value: unknown,
  type: "orders" | "subscription-invoices",
  webhook: boolean,
  initialOrderId?: string,
) {
  const { id, attributes: row } = lemonResource(value, type);
  let positiveRefund = false;
  if (webhook && row.refunded_amount != null) {
    const amount = minorAmount(row.refunded_amount, "USD", 0);
    assert(!amount.startsWith("-"), "provider_amount_invalid", 502);
    positiveRefund = BigInt(amount) > 0n;
  }
  // The documented refund response can retain status=paid for partial refunds.
  if (
    !["refunded", "partial_refund"].includes(String(row.status)) &&
    !(webhook && row.status === "paid" && positiveRefund)
  )
    return [];
  // Current partial-refund records have no refund timestamp. Only a signed
  // refund event establishes what the record's updated_at means.
  const at = webhook ? row.updated_at : row.refunded_at;
  if (!at) return [];
  if (
    type === "subscription-invoices" &&
    row.billing_reason === "initial" &&
    !initialOrderId
  )
    return [];
  const key =
    type === "orders" || initialOrderId
      ? `order:${initialOrderId || id}`
      : `invoice:${id}`;
  // refunded_amount is cumulative and there is no refund transaction ID/feed.
  // Count each refunded payment once, without inventing monetary deltas.
  return [event(row, key, "refund", at)];
}

export function lemonLifecycle(
  value: unknown,
  type: "subscription_cancelled" | "subscription_payment_failed",
) {
  const { id, attributes: row } = lemonResource(
    value,
    type === "subscription_cancelled"
      ? "subscriptions"
      : "subscription-invoices",
  );
  if (type === "subscription_cancelled" && row.cancelled !== true) return [];
  const at = iso(row.updated_at);
  return [
    event(
      row,
      `${type === "subscription_cancelled" ? "subscription" : "invoice"}:${id}:${at}`,
      type === "subscription_cancelled" ? "cancellation" : "payment_failed",
      at,
    ),
  ];
}
