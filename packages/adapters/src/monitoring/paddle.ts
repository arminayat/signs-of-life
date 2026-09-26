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
  decimal,
  headers,
  iso,
  metricBase,
  nextParameter,
  object,
  request,
  string,
  unavailable,
  url,
} from "./http";
import {
  billingDefinitions,
  billingEvent,
  minorAmount,
  paddleHost,
  verifyWebhook,
} from "./billing-common";
const native = [
  "revenue",
  "refunds",
  "monthly-recurring-revenue",
  "active-subscribers",
  "checkout-conversion",
];
function paddleEvent(...args: Parameters<typeof billingEvent>): Observation {
  const event = billingEvent(...args);
  delete event.reference;
  return event;
}
function normalize(
  type: string,
  row: Record<string, unknown>,
  c: Credentials,
  at: unknown,
): Observation[] {
  const id = string(row.id),
    resource = string(c.accountId),
    env = c.environment;
  if (type === "transaction.completed" && row.status === "completed") {
    const totals = object(object(row.details).totals);
    return [
      paddleEvent(
        "paddle",
        resource,
        env,
        id,
        row.origin === "subscription_recurring" ? "renewal" : "payment",
        row.billed_at || at,
        totals.grand_total,
        row.currency_code,
      ),
    ];
  }
  if (
    type === "adjustment.updated" &&
    row.action === "refund" &&
    row.status === "approved"
  )
    return [
      paddleEvent(
        "paddle",
        resource,
        env,
        id,
        "refund",
        row.updated_at || at,
        object(row.totals).total,
        row.currency_code,
      ),
    ];
  if (type === "subscription.canceled" && row.status === "canceled")
    return [
      paddleEvent(
        "paddle",
        resource,
        env,
        id,
        "cancellation",
        row.canceled_at || at,
      ),
    ];
  if (type === "transaction.payment_failed")
    return [
      paddleEvent(
        "paddle",
        resource,
        env,
        `${id}:${iso(at)}`,
        "payment_failed",
        at,
      ),
    ];
  return [];
}
export function paddle(http: Http): ProviderAdapter {
  return {
    async catalog(c) {
      // Paddle does not expose a merchant-account catalog. The operator supplies its ID.
      assert(
        /^[a-zA-Z0-9_-]{1,100}$/.test(c.accountId || ""),
        "paddle_account_id_required",
      );
      object(
        await request(http, `${paddleHost(c)}/transactions?per_page=1`, {
          headers: headers(c),
        }),
      );
      return [
        {
          id: c.accountId,
          name: `Paddle ${c.accountId}`,
          environment: c.environment,
        },
      ];
    },
    definitions: async () => [
      ...billingDefinitions,
      ...native.map((id) => ({
        id: `native:${id}`,
        label: id.replaceAll("-", " "),
        shape: "series" as const,
        group: "revenue" as const,
        definition: `Paddle native ${id}. UTC reporting; monetary metrics use Paddle's balance-currency basis. Snapshots and conversion rates are never summed.`,
      })),
    ],
    async metric(input, query) {
      const id = query.metric.replace(/^native:/, "");
      if (!native.includes(id))
        return unavailable(query, "Metric not supported.");
      const end = new Date(`${query.to}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const result = object(
        object(
          await request(
            http,
            url(paddleHost(input.credentials), `/metrics/${id}`, {
              from: query.from,
              to: end.toISOString().slice(0, 10),
            }),
            { headers: headers(input.credentials) },
          ),
        ).data,
      );
      const currency =
        typeof result.currency_code === "string"
          ? result.currency_code
          : undefined;
      const field =
        id === "checkout-conversion"
          ? "rate"
          : id === "active-subscribers"
            ? "count"
            : "amount";
      const data = {
        ...metricBase(
          `Paddle native ${id}; provider balance-currency basis; UTC.`,
          field === "rate"
            ? "ratio"
            : field === "amount"
              ? "currency"
              : "count",
        ),
        currency,
      };
      data.points = array(result.timeseries).map((v) => {
        const p = object(v);
        return {
          label: iso(p.timestamp).slice(0, 10),
          value:
            p[field] == null
              ? null
              : field === "amount" && currency
                ? minorAmount(p[field], currency)
                : decimal(p[field]),
        };
      });
      if (typeof result.updated_at === "string")
        data.fetchedAt = iso(result.updated_at);
      // The API returns a time series, not a period conversion aggregate.
      if (["monthly-recurring-revenue", "active-subscribers"].includes(id))
        data.summary = data.points.at(-1)?.value ?? undefined;
      return data;
    },
    async collect(input): Promise<CollectionPage> {
      const c = input.credentials,
        base = paddleHost(c);
      const stages = input.historical
        ? ["transactions", "adjustments", "subscriptions"]
        : ["events"];
      const stage = input.cursor.stage || stages[0];
      assert(stages.includes(stage), "provider_cursor_invalid");
      const result = object(
        await request(
          http,
          url(base, `/${stage}`, {
            per_page: 100,
            after: input.cursor.after,
            ...(stage === "events"
              ? {
                  order_by: "id[DESC]",
                  event_type:
                    "transaction.completed,transaction.payment_failed,adjustment.updated,subscription.canceled",
                }
              : {
                  ...(stage === "subscriptions"
                    ? {}
                    : { "created_at[gte]": input.from }),
                  "created_at[lte]": input.until,
                }),
          }),
          { headers: headers(c) },
        ),
      );
      const rows = array(result.data).map(object),
        pagination = object(object(result.meta).pagination);
      const events = rows.flatMap((row) =>
        stage === "events"
          ? normalize(
              string(row.event_type),
              object(row.data),
              c,
              row.occurred_at,
            )
          : normalize(
              (
                {
                  transactions: "transaction.completed",
                  adjustments: "adjustment.updated",
                  subscriptions: "subscription.canceled",
                } as Record<string, string>
              )[stage],
              row,
              c,
              row.created_at,
            ),
      );
      const pastWindow =
        stage === "events" &&
        rows.length > 0 &&
        rows.every((r) => iso(r.occurred_at) < input.from);
      const more = pagination.has_more === true && !pastWindow;
      const after = more
        ? nextParameter(pagination.next, base, "after")
        : undefined;
      assert(
        !more || (after && after !== input.cursor.after),
        "provider_pagination_invalid",
        502,
      );
      const nextStage = stages[stages.indexOf(stage) + 1];
      return {
        events,
        cursor: more
          ? { stage, after: after! }
          : nextStage
            ? { stage: nextStage }
            : {},
        done: !more && !nextStage,
        coverage:
          "Historical transactions and current subscription/adjustment records. Lifecycle event replay is limited to 90 days.",
      };
    },
    async webhook(c, raw, h) {
      const event = await verifyWebhook("paddle", c, raw, h);
      return normalize(
        string(event.event_type),
        object(event.data),
        c,
        event.occurred_at,
      );
    },
  };
}
