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
  object,
  request,
  string,
  unavailable,
  url,
} from "./http";
import {
  billingDefinitions,
  billingEvent,
  verifyWebhook,
} from "./billing-common";
const native = [
  "revenue",
  "net_revenue",
  "orders",
  "monthly_recurring_revenue",
  "active_subscriptions",
  "churn_rate",
  "checkouts_conversion",
];
function host(c: Credentials) {
  return c.environment === "sandbox"
    ? "https://sandbox-api.polar.sh"
    : "https://api.polar.sh";
}
function normalize(
  type: string,
  row: Record<string, unknown>,
  resource: string,
  environment: string,
  at: unknown,
): Observation[] {
  const id = string(row.id);
  if (type === "order.paid" && row.paid === true)
    return [
      billingEvent(
        "polar",
        resource,
        environment,
        id,
        row.billing_reason === "subscription_cycle" ? "renewal" : "payment",
        row.created_at,
        row.total_amount,
        row.currency,
      ),
    ];
  if (type === "subscription.canceled" && row.canceled_at)
    return [
      billingEvent(
        "polar",
        resource,
        environment,
        id,
        "cancellation",
        row.canceled_at,
      ),
    ];
  if (
    (type === "refund.created" || type === "refund.updated") &&
    row.status === "succeeded"
  )
    return [
      billingEvent(
        "polar",
        resource,
        environment,
        id,
        "refund",
        row.created_at,
        row.amount,
        row.currency,
      ),
    ];
  if (type === "subscription.past_due")
    return [
      billingEvent(
        "polar",
        resource,
        environment,
        `${id}:${iso(at)}`,
        "payment_failed",
        at,
      ),
    ];
  return [];
}
export function polar(http: Http): ProviderAdapter {
  return {
    async catalog(c) {
      const resources = [];
      let page = 1;
      for (;;) {
        const data = object(
          await request(
            http,
            url(host(c), "/v1/organizations/", { page, limit: 100 }),
            { headers: headers(c) },
          ),
        );
        resources.push(
          ...array(data.items).map((v) => {
            const r = object(v);
            return {
              id: string(r.id),
              name: string(r.name),
              environment: c.environment || "production",
            };
          }),
        );
        if (page >= Number(object(data.pagination).max_page)) break;
        assert(page++ < 100, "provider_catalog_too_large", 422);
      }
      return resources;
    },
    definitions: async () => [
      ...billingDefinitions,
      ...native.map((id) => ({
        id: `native:${id}`,
        label: id.replaceAll("_", " "),
        group: "revenue" as const,
        shape: "series" as const,
        definition: `Polar native ${id}; provider totals and UTC periods. Monetary values are provider cents; the API does not supply a currency code.`,
        filters: [
          {
            id: "billing_type",
            label: "Billing type",
            values: ["one_time", "recurring"],
          },
        ],
      })),
    ],
    async metric(input, query) {
      const id = query.metric.replace(/^native:/, "");
      if (!native.includes(id))
        return unavailable(query, "Metric not supported.");
      const data = object(
        await request(
          http,
          url(host(input.credentials), "/v1/metrics/", {
            organization_id: input.resourceId,
            start_date: query.from,
            end_date: query.to,
            interval: "day",
            timezone: "UTC",
            metrics: id,
            billing_type: query.filters.billing_type || undefined,
          }),
          { headers: headers(input.credentials) },
        ),
      );
      const meta = object(object(data.metrics)[id]);
      const monetary = [
        "revenue",
        "net_revenue",
        "monthly_recurring_revenue",
      ].includes(id);
      const result = metricBase(
        `Polar native ${id}. ${monetary ? "Provider cents; no currency code supplied by the API. Keep this source separate." : "Provider-calculated period totals."}`,
        monetary
          ? "provider cents"
          : meta.type === "percentage" ||
              id.endsWith("rate") ||
              id.endsWith("conversion")
            ? "ratio"
            : "count",
      );
      result.points = array(data.periods).map((v) => {
        const p = object(v);
        return {
          label: iso(p.timestamp).slice(0, 10),
          value: p[id] == null ? null : decimal(p[id]),
        };
      });
      const total = object(data.totals)[id];
      if (total != null) result.summary = decimal(total);
      return result;
    },
    async collect(input): Promise<CollectionPage> {
      const stage = input.cursor.stage || "orders",
        page = Number(input.cursor.page || 1);
      assert(
        ["orders", "refunds", "subscriptions"].includes(stage),
        "provider_cursor_invalid",
      );
      const data = object(
        await request(
          http,
          url(host(input.credentials), `/v1/${stage}/`, {
            organization_id: input.resourceId,
            page,
            limit: 100,
            ...(stage === "orders"
              ? {
                  created_after: input.from,
                  created_before: input.until,
                  sorting: "created_at",
                }
              : {}),
          }),
          { headers: headers(input.credentials) },
        ),
      );
      const events = array(data.items).flatMap((v) => {
        const row = object(v);
        return normalize(
          (
            {
              orders: "order.paid",
              refunds: "refund.created",
              subscriptions: "subscription.canceled",
            } as Record<string, string>
          )[stage],
          row,
          input.resourceId,
          input.environment,
          row.modified_at || row.created_at,
        );
      });
      const more = page < Number(object(data.pagination).max_page);
      const nextStage =
        stage === "orders"
          ? "refunds"
          : stage === "refunds"
            ? "subscriptions"
            : undefined;
      return {
        events,
        cursor: more
          ? { stage, page: String(page + 1) }
          : nextStage
            ? { stage: nextStage, page: "1" }
            : {},
        done: !more && !nextStage,
        coverage:
          "Provider order/refund history and current subscription records. Webhooks supply payment failures and immediate lifecycle changes.",
      };
    },
    async webhook(c, raw, h) {
      const event = await verifyWebhook("polar", c, raw, h),
        row = object(event.data);
      // Organization attribution comes only from authenticated provider fields.
      const resource =
        typeof row.organization_id === "string"
          ? row.organization_id
          : row.product
            ? string(object(row.product).organization_id)
            : undefined;
      if (!resource) return []; // An unattributed refund is recovered by API reconciliation.
      return normalize(
        string(event.type),
        row,
        resource,
        c.environment || "production",
        event.timestamp,
      );
    },
  };
}
