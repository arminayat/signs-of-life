import type {
  CollectionPage,
  Credentials,
  Observation,
  ProviderAdapter,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
import { assert } from "../../../core/src/model";
import {
  array,
  headers,
  number,
  object,
  request,
  string,
  unavailable,
  url,
} from "./http";
import {
  billingDefinitions,
  billingEvent,
  resourcePart,
  verifyWebhook,
} from "./billing-common";
const stripeHeaders = (c: Credentials) => ({
  ...headers(c),
  "Stripe-Version": "2024-06-20",
});

function normalize(
  type: string,
  row: Record<string, unknown>,
  c: Credentials,
  at?: unknown,
): Observation[] {
  const resource = string(c.accountId);
  const env = row.livemode === false ? "sandbox" : "production";
  const time = typeof at === "number" ? at * 1000 : number(row.created) * 1000;
  const id = string(row.id);
  if (type === "charge.succeeded" && row.paid === true && row.invoice === null)
    return [
      billingEvent(
        "stripe",
        resource,
        env,
        id,
        "payment",
        time,
        row.amount,
        row.currency,
      ),
    ];
  if (type === "invoice.paid" && row.paid === true) {
    const kind =
      row.billing_reason === "subscription_cycle" ? "renewal" : "payment";
    const paidAt = row.status_transitions
      ? object(row.status_transitions).paid_at
      : undefined;
    return [
      billingEvent(
        "stripe",
        resource,
        env,
        id,
        kind,
        typeof paidAt === "number" ? paidAt * 1000 : time,
        row.amount_paid,
        row.currency,
      ),
    ];
  }
  if (
    (type === "refund.created" || type === "refund.updated") &&
    row.status === "succeeded"
  )
    return [
      billingEvent(
        "stripe",
        resource,
        env,
        id,
        "refund",
        number(row.created) * 1000,
        row.amount,
        row.currency,
      ),
    ];
  if (type === "customer.subscription.deleted")
    return [
      billingEvent(
        "stripe",
        resource,
        env,
        id,
        "cancellation",
        typeof row.canceled_at === "number" ? row.canceled_at * 1000 : time,
      ),
    ];
  if (type === "invoice.payment_failed")
    return [
      billingEvent(
        "stripe",
        resource,
        env,
        `${id}:attempt:${number(row.attempt_count)}`,
        "payment_failed",
        time,
        row.amount_due,
        row.currency,
      ),
    ];
  return [];
}
export function stripe(http: Http): ProviderAdapter {
  async function lookup(c: Credentials, id: string): Promise<Observation[]> {
    const path = id.startsWith("in_")
      ? "invoices"
      : id.startsWith("ch_")
        ? "charges"
        : null;
    assert(
      path && /^(in|ch)_[a-zA-Z0-9]+$/.test(id),
      "provider_reference_invalid",
    );
    const row = object(
      await request(
        http,
        `https://api.stripe.com/v1/${path}/${resourcePart(id)}`,
        { headers: stripeHeaders(c) },
      ),
    );
    assert(row.id === id, "provider_reference_invalid", 502);
    if (path === "charges" && typeof row.invoice === "string")
      return lookup(c, row.invoice);
    return normalize(
      path === "charges" ? "charge.succeeded" : "invoice.paid",
      row,
      c,
    );
  }
  return {
    lookup,
    async catalog(c) {
      const account = object(
        await request(http, "https://api.stripe.com/v1/account", {
          headers: stripeHeaders(c),
        }),
      );
      const id = string(account.id);
      c.accountId = id;
      // This endpoint has no livemode field; key prefixes are provider-defined.
      const environment =
        c.environment ||
        (/^(sk|rk)_test_/.test(c.apiKey || "") ? "sandbox" : "production");
      return [{ id, name: id, environment }];
    },
    definitions: async () => [
      ...billingDefinitions,
      {
        id: "mrr",
        label: "MRR (unavailable)",
        group: "revenue",
        shape: "series",
        definition:
          "Stripe does not expose dashboard MRR through this adapter. No local approximation is made.",
      },
    ],
    metric: async (_, q) =>
      unavailable(
        q,
        "Stripe dashboard MRR and churn are not available through this connection.",
      ),
    async collect(input): Promise<CollectionPage> {
      const stages = input.historical
        ? ["charges", "invoices", "refunds", "subscriptions"]
        : ["events"];
      const stage = input.cursor.stage || stages[0];
      assert(stages.includes(stage), "provider_cursor_invalid");
      const result = object(
        await request(
          http,
          url("https://api.stripe.com", `/v1/${stage}`, {
            limit: stage === "events" ? 25 : 100,
            starting_after: input.cursor.after,
            ...(!["invoices", "subscriptions"].includes(stage)
              ? { "created[gte]": Math.floor(Date.parse(input.from) / 1000) }
              : {}),
            "created[lte]": Math.ceil(Date.parse(input.until) / 1000),
            ...(stage === "subscriptions" ? { status: "canceled" } : {}),
          }),
          { headers: stripeHeaders(input.credentials) },
        ),
      );
      const rows = array(result.data).map(object);
      const events: Observation[] = [];
      // Modern charge events can need two API reads each. Bound fanout below
      // Stripe's concurrency limits, while retaining durable page checkpoints.
      for (let offset = 0; offset < rows.length; offset += 5) {
        const batch = await Promise.all(
          rows.slice(offset, offset + 5).map(async (row) =>
            stage === "events"
              ? row.type === "charge.succeeded" &&
                object(object(row.data).object).invoice === undefined
                ? lookup(
                    input.credentials,
                    string(object(object(row.data).object).id),
                  )
                : normalize(
                    string(row.type),
                    object(object(row.data).object),
                    input.credentials,
                    row.created,
                  )
              : normalize(
                  (
                    {
                      charges: "charge.succeeded",
                      invoices: "invoice.paid",
                      refunds: "refund.created",
                      subscriptions: "customer.subscription.deleted",
                    } as Record<string, string>
                  )[stage],
                  row,
                  input.credentials,
                ),
          ),
        );
        events.push(...batch.flat());
      }
      const more = result.has_more === true;
      assert(!more || rows.length > 0, "provider_pagination_invalid", 502);
      const nextStage = stages[stages.indexOf(stage) + 1];
      return {
        events,
        cursor: more
          ? { stage, after: string(rows.at(-1)!.id) }
          : nextStage
            ? { stage: nextStage }
            : {},
        done: !more && !nextStage,
        coverage: input.historical
          ? "Payments, invoices, refunds and current canceled subscription records; past failure attempts are limited by Stripe event retention."
          : "Stripe events retain about 30 days. Longer outages may leave lifecycle gaps.",
      };
    },
    async webhook(c, raw, h) {
      const event = await verifyWebhook("stripe", c, raw, h);
      if (
        event.type === "charge.succeeded" &&
        object(object(event.data).object).invoice === undefined
      )
        return lookup(c, string(object(object(event.data).object).id));
      return normalize(
        string(event.type),
        object(object(event.data).object),
        c,
        event.created,
      );
    },
  };
}
