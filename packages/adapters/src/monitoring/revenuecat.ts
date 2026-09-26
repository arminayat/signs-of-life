import { assert } from "../../../core/src/model";
import type {
  Credentials,
  EventKind,
  MetricResult,
  Observation,
  ProviderAdapter,
  Resource,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
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
  resourcePart,
  verifyWebhook,
} from "./billing-common";
const base = "https://api.revenuecat.com";
const charts = [
  "revenue",
  "mrr",
  "churn",
  "actives",
  "trial_conversion",
  "subscription_retention",
];
export function revenuecat(http: Http): ProviderAdapter {
  async function list(c: Credentials, path: string) {
    const items: Record<string, unknown>[] = [];
    let after: string | undefined;
    for (let page = 0; ; page++) {
      const result = object(
        await request(
          http,
          url(base, path, { limit: 100, starting_after: after }),
          { headers: headers(c) },
        ),
      );
      items.push(...array(result.items).map(object));
      if (!result.next_page) break;
      const next = nextParameter(result.next_page, base, "starting_after");
      assert(
        next && next !== after && page < 100,
        "provider_pagination_invalid",
        502,
      );
      after = next;
    }
    return items;
  }
  return {
    async catalog(c) {
      const resources: Resource[] = [],
        appProjects: Record<string, string> = {};
      for (const project of await list(c, "/v2/projects")) {
        const projectId = string(project.id);
        for (const app of await list(
          c,
          `/v2/projects/${resourcePart(projectId)}/apps`,
        )) {
          const appId = string(app.id);
          appProjects[appId] = projectId;
          resources.push({
            id: `${projectId}/${appId}`,
            name: string(app.name),
            organizationName: string(project.name),
            environment: c.environment || "production",
          });
        }
      }
      c.appProjects = JSON.stringify(appProjects);
      return resources;
    },
    definitions: async () => [
      ...billingDefinitions,
      ...charts.map((id) => ({
        id: `native:${id}`,
        label: id.replaceAll("_", " "),
        group: "revenue" as const,
        shape:
          id === "subscription_retention"
            ? ("cohort" as const)
            : ("series" as const),
        definition: `RevenueCat native ${id}. Requires Charts & Metrics read permission and provider plan access; app filtering must be supported.`,
      })),
    ],
    async metric(input, query) {
      const chart = query.metric.replace(/^native:/, "");
      if (!charts.includes(chart))
        return unavailable(query, "Metric not supported.");
      const [project, app] = input.resourceId.split("/");
      assert(project && app, "invalid_revenuecat_resource");
      const path = `/v2/projects/${resourcePart(project)}/charts/${chart}`;
      const options = object(
        await request(http, `${base}${path}/options`, {
          headers: headers(input.credentials),
        }),
      );
      const appFilter = array(options.filters)
        .map(object)
        .find(
          (f) =>
            ["app", "app_id"].includes(String(f.id)) &&
            array(f.options).some((v) => object(v).id === app),
        );
      if (!appFilter)
        return unavailable(
          query,
          "RevenueCat does not support this chart for the selected app boundary.",
        );
      const environment = array(options.filters)
        .map(object)
        .find((f) => f.id === "environment");
      const filters = [{ name: string(appFilter.id), values: [app] }];
      if (environment)
        filters.push({ name: "environment", values: [input.environment] });
      else if (input.environment !== "production")
        return unavailable(
          query,
          "Sandbox filtering is unavailable for this chart.",
        );
      const resolution = array(options.resolutions)
        .map(object)
        .find(
          (r) =>
            r.display_name ===
            (chart === "subscription_retention" ? "month" : "day"),
        );
      const data = object(
        await request(
          http,
          url(base, path, {
            start_date: query.from,
            end_date: query.to,
            filters: JSON.stringify(filters),
            ...(resolution ? { resolution: string(resolution.id) } : {}),
            include_annotations: "false",
          }),
          { headers: headers(input.credentials) },
        ),
      );
      return normalizeChart(data, chart);
    },
    // Native charts provide historical aggregates. The v2 subscription endpoint is
    // a search by known store ID, not a project-wide transaction feed.
    async collect(input) {
      await request(
        http,
        `${base}/v2/projects/${resourcePart(input.resourceId.split("/")[0])}/apps/${resourcePart(input.resourceId.split("/")[1])}`,
        { headers: headers(input.credentials) },
      );
      return {
        events: [],
        cursor: {},
        done: true,
        coverage:
          "Historical aggregates come from native charts. Event alerts begin with authenticated webhooks; the API has no project-wide billing-event feed. Missed webhooks cannot be reconstructed from aggregates.",
      };
    },
    async webhook(c, raw, h) {
      const payload = await verifyWebhook("revenuecat", c, raw, h),
        row = object(payload.event);
      const app = string(row.app_id),
        projects = object(JSON.parse(c.appProjects || "{}")),
        project = projects[app];
      if (typeof project !== "string") return [];
      if (
        row.period_type === "TRIAL" &&
        ["INITIAL_PURCHASE", "RENEWAL"].includes(String(row.type))
      )
        return [];
      if (row.type === "CANCELLATION" && row.cancel_reason === "BILLING_ERROR")
        return [];
      const kind: EventKind | undefined =
        row.type === "CANCELLATION" && row.cancel_reason === "CUSTOMER_SUPPORT"
          ? "refund"
          : (
              {
                INITIAL_PURCHASE: "payment",
                NON_RENEWING_PURCHASE: "payment",
                RENEWAL: "renewal",
                CANCELLATION: "cancellation",
                BILLING_ISSUE: "payment_failed",
              } as Record<string, EventKind>
            )[String(row.type)];
      if (!kind) return [];
      const result: Observation = {
        id: string(row.id),
        resourceId: `${project}/${app}`,
        kind,
        environment: row.environment === "SANDBOX" ? "sandbox" : "production",
        occurredAt: iso(row.event_timestamp_ms),
      };
      if (
        typeof row.currency === "string" &&
        /^[A-Z]{3}$/.test(row.currency) &&
        row.price_in_purchased_currency != null &&
        ["payment", "renewal"].includes(kind)
      ) {
        result.amount = decimal(row.price_in_purchased_currency);
        result.currency = row.currency;
      }
      if (
        row.store === "STRIPE" &&
        typeof row.transaction_id === "string" &&
        /^(in|ch)_[a-zA-Z0-9]+$/.test(row.transaction_id) &&
        ["payment", "renewal"].includes(kind)
      )
        result.candidate = { provider: "stripe", object: row.transaction_id };
      return [result];
    },
  };
}
export function normalizeChart(
  data: Record<string, unknown>,
  chart: string,
): MetricResult {
  const result = metricBase(
    `RevenueCat native ${chart}; provider calculation and reporting basis.`,
    typeof data.yaxis === "string" ? data.yaxis : "provider units",
  );
  if (typeof data.yaxis_currency === "string")
    result.currency = data.yaxis_currency;
  if (typeof data.last_computed_at === "number")
    result.fetchedAt = iso(data.last_computed_at);
  const values = array(data.values);
  if (chart === "subscription_retention") {
    const columns = array(data.periods ?? data.segments).map(object);
    result.shape = "cohort";
    result.columns = columns.map(
      (p) =>
        `${string(p.display_name)} (${string(p.unit)}, ${string(p.scale)})`,
    );
    const rows = new Map<string, (string | null)[]>();
    for (const value of values) {
      const p = object(value),
        label =
          typeof p.cohort === "number"
            ? iso(p.cohort).slice(0, 10)
            : string(p.cohort);
      assert(/^\d{4}-\d{2}/.test(label), "provider_cohort_invalid", 502);
      const index = Number(p.period);
      assert(
        Number.isInteger(index) && index >= 0 && index < columns.length,
        "provider_cohort_invalid",
        502,
      );
      const row =
        rows.get(label) || Array<string | null>(columns.length).fill(null);
      row[index] = p.value == null ? null : decimal(p.value);
      rows.set(label, row);
      if (p.incomplete === true) result.status = "partial";
    }
    result.rows = [...rows].map(([label, values]) => ({ label, values }));
  } else {
    result.points = values.map((v) => {
      if (Array.isArray(v)) {
        assert(
          v.length === 2 && typeof v[0] === "number",
          "provider_chart_shape_unsupported",
          502,
        );
        return {
          label: iso(v[0]).slice(0, 10),
          value: v[1] == null ? null : decimal(v[1]),
        };
      }
      const p = object(v);
      if (p.incomplete === true) result.status = "partial";
      return {
        label: iso(p.timestamp ?? p.date).slice(0, 10),
        value: p.value == null ? null : decimal(p.value),
      };
    });
    const summary = data.summary ? object(data.summary) : {};
    if (summary.total != null && ["revenue"].includes(chart))
      result.summary = decimal(summary.total);
    if (["mrr", "actives"].includes(chart))
      result.summary = result.points.at(-1)?.value ?? undefined;
  }
  return result;
}
