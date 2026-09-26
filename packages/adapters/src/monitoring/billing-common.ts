import { assert } from "../../../core/src/model";
import type {
  Credentials,
  EventKind,
  Observation,
} from "../../../core/src/monitoring";
import { equalSecret } from "../crypto";
import { decimal, iso, object, string } from "./http";

export const billingDefinitions = [
  "payment",
  "renewal",
  "refund",
  "cancellation",
  "payment_failed",
].map((id) => ({
  id,
  label: (
    {
      payment: "Successful payments",
      renewal: "Renewals",
      refund: "Refunds",
      cancellation: "Cancellations",
      payment_failed: "Payment failures",
    } as Record<string, string>
  )[id],
  group: "revenue" as const,
  shape: "series" as const,
  definition: `Observed ${id.replaceAll("_", " ")} events from this source. Counts, not provider financial statements.`,
}));
export function minorAmount(
  value: unknown,
  currency: string,
  overrideExponent?: number,
) {
  const raw = decimal(value);
  assert(
    /^-?\d+$/.test(raw) &&
      (typeof value !== "number" || Number.isSafeInteger(value)),
    "provider_amount_invalid",
    502,
  );
  const exponent =
    overrideExponent ??
    ([
      "BIF",
      "CLP",
      "DJF",
      "GNF",
      "JPY",
      "KMF",
      "KRW",
      "MGA",
      "PYG",
      "RWF",
      "UGX",
      "VND",
      "VUV",
      "XAF",
      "XOF",
      "XPF",
    ].includes(currency.toUpperCase())
      ? 0
      : ["BHD", "JOD", "KWD", "OMR", "TND"].includes(currency.toUpperCase())
        ? 3
        : 2);
  if (!exponent) return raw;
  const digits = raw.replace("-", "").padStart(exponent + 1, "0");
  return `${raw.startsWith("-") ? "-" : ""}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}
export function billingEvent(
  provider: string,
  resourceId: string,
  environment: string,
  id: string,
  kind: EventKind,
  at: unknown,
  amount?: unknown,
  currency?: unknown,
): Observation {
  const money =
    typeof currency === "string" &&
    /^[a-zA-Z]{3}$/.test(currency) &&
    amount != null
      ? {
          currency: currency.toUpperCase(),
          amount: minorAmount(
            amount,
            currency,
            provider === "stripe" &&
              ["UGX", "ISK"].includes(currency.toUpperCase())
              ? 2
              : undefined,
          ),
        }
      : {};
  return {
    id: `${kind}:${id}`,
    resourceId,
    environment,
    kind,
    occurredAt: iso(at),
    ...money,
    reference: { provider, account: resourceId, object: id, action: kind },
  };
}
async function hmac(
  secret: Uint8Array,
  content: string,
  encoding: "hex" | "base64",
) {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content)),
  ).toString(encoding);
}
export async function verifyWebhook(
  provider: "stripe" | "paddle" | "polar" | "revenuecat",
  c: Credentials,
  raw: string,
  headers: Headers,
) {
  assert(c.webhookSecret, "webhook_not_configured", 404);
  if (provider === "revenuecat") {
    assert(
      await equalSecret(headers.get("authorization") || "", c.webhookSecret),
      "webhook_signature_invalid",
      401,
    );
  } else if (provider === "polar") {
    const id = headers.get("webhook-id"),
      timestamp = headers.get("webhook-timestamp");
    assert(
      id && timestamp && Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300,
      "webhook_timestamp_invalid",
      401,
    );
    const content = `${id}.${timestamp}.${raw}`;
    // Polar rotated signing schemes in September 2026. Accept both documented keys.
    const keys = [
      Buffer.from(c.webhookSecret.replace(/^whsec_/, ""), "base64"),
      new TextEncoder().encode(c.webhookSecret),
    ];
    const signatures = (headers.get("webhook-signature") || "")
      .split(" ")
      .filter((s) => s.startsWith("v1,"))
      .map((s) => s.slice(3));
    let valid = false;
    for (const key of keys)
      for (const signature of signatures)
        valid =
          (await equalSecret(signature, await hmac(key, content, "base64"))) ||
          valid;
    assert(valid, "webhook_signature_invalid", 401);
  } else {
    const parts = (
      headers.get(
        provider === "stripe" ? "stripe-signature" : "paddle-signature",
      ) || ""
    )
      .split(provider === "stripe" ? "," : ";")
      .map((v) => v.trim().split("="));
    const timestamp = parts.find(
      ([key]) => key === (provider === "stripe" ? "t" : "ts"),
    )?.[1];
    assert(
      timestamp && Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300,
      "webhook_timestamp_invalid",
      401,
    );
    const expected = await hmac(
      new TextEncoder().encode(c.webhookSecret),
      `${timestamp}${provider === "stripe" ? "." : ":"}${raw}`,
      "hex",
    );
    let valid = false;
    for (const [key, value] of parts)
      if (key === (provider === "stripe" ? "v1" : "h1"))
        valid = (await equalSecret(value || "", expected)) || valid;
    assert(valid, "webhook_signature_invalid", 401);
  }
  try {
    return object(JSON.parse(raw));
  } catch {
    throw new Error("webhook_payload_invalid");
  }
}
export function paddleHost(c: Credentials) {
  assert(
    ["production", "sandbox"].includes(c.environment),
    "invalid_paddle_environment",
  );
  return c.environment === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}
export function resourcePart(id: string) {
  return encodeURIComponent(string(id));
}
