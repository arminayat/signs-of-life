import { assert } from "../../../core/src/model";
import type {
  MetricDefinition,
  MetricResult,
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
  posthogHost,
  request,
  string,
  unavailable,
  url,
} from "./http";
import { resourcePart } from "./billing-common";
type Query = Record<string, unknown>;
function safeQuery(value: unknown): Query | undefined {
  const wrapper = object(value),
    q = wrapper.kind === "InsightVizNode" ? object(wrapper.source) : wrapper;
  if (
    !["TrendsQuery", "FunnelsQuery", "RetentionQuery"].includes(String(q.kind))
  )
    return;
  if (
    q.breakdownFilter ||
    (q.properties && array(q.properties).length) ||
    q.filterTestAccounts ||
    q.dataWarehouseEvents ||
    q.aggregation_group_type_index != null
  )
    return;
  const entity = (v: unknown) => {
    const r = object(v);
    assert(
      ["EventsNode", "ActionsNode"].includes(String(r.kind)) &&
        (!r.properties || array(r.properties).length === 0),
      "posthog_report_unsupported",
      422,
    );
    assert(
      !r.math ||
        ["total", "dau", "weekly_active", "monthly_active"].includes(
          String(r.math),
        ),
      "posthog_report_unsupported",
      422,
    );
    if (r.kind === "EventsNode")
      assert(
        typeof r.event === "string" &&
          !r.event.includes("@") &&
          r.event.length < 150,
        "posthog_report_unsupported",
        422,
      );
    return {
      kind: r.kind,
      ...(r.kind === "EventsNode" ? { event: r.event } : { id: r.id }),
      ...(r.math ? { math: r.math } : {}),
    };
  };
  if (q.kind === "RetentionQuery") {
    const r = object(q.retentionFilter);
    if (
      r.period &&
      !["Hour", "Day", "Week", "Month"].includes(String(r.period))
    )
      return;
    if (
      r.totalIntervals != null &&
      (!Number.isInteger(r.totalIntervals) ||
        Number(r.totalIntervals) < 1 ||
        Number(r.totalIntervals) > 366)
    )
      return;
    return {
      kind: q.kind,
      retentionFilter: {
        targetEntity: entity(r.targetEntity),
        returningEntity: entity(r.returningEntity),
        retentionType:
          r.retentionType === "recurring" ? "recurring" : "first_time",
        totalIntervals: r.totalIntervals ?? 11,
        period: r.period ?? "Day",
      },
    };
  }
  const series = array(q.series).map(entity);
  assert(
    series.length > 0 && series.length <= 10,
    "posthog_report_unsupported",
    422,
  );
  const result: Query = { kind: q.kind, series };
  if (q.kind === "FunnelsQuery") {
    const f = q.funnelsFilter ? object(q.funnelsFilter) : {};
    if (
      (f.funnelExclusions && array(f.funnelExclusions).length) ||
      (f.funnelOrderType && f.funnelOrderType !== "ordered")
    )
      return;
    result.funnelsFilter = {
      funnelVizType: "steps",
      funnelOrderType: "ordered",
      funnelWindowInterval:
        typeof f.funnelWindowInterval === "number"
          ? f.funnelWindowInterval
          : 14,
      funnelWindowIntervalUnit: [
        "minute",
        "hour",
        "day",
        "week",
        "month",
      ].includes(String(f.funnelWindowIntervalUnit))
        ? f.funnelWindowIntervalUnit
        : "day",
    };
  } else {
    const t = q.trendsFilter ? object(q.trendsFilter) : {};
    if (t.formula || t.formulas || t.smoothingIntervals || t.cumulative) return;
    result.interval = "day";
  }
  return result;
}
export function posthog(http: Http): ProviderAdapter {
  return {
    async catalog(c) {
      const resources: Resource[] = [];
      let offset = "0";
      for (let page = 0; ; page++) {
        const data = object(
          await request(
            http,
            url(posthogHost(c), "/api/projects/", { limit: 100, offset }),
            { headers: headers(c) },
          ),
        );
        resources.push(
          ...array(data.results).map((v) => {
            const r = object(v);
            return {
              id: String(r.id),
              name: string(r.name),
              environment: c.region || "us",
            };
          }),
        );
        if (!data.next) break;
        const next = nextParameter(data.next, posthogHost(c), "offset");
        assert(
          next && next !== offset && page < 100,
          "provider_pagination_invalid",
          502,
        );
        offset = next;
      }
      return resources;
    },
    async definitions(c, resource) {
      const definitions: MetricDefinition[] = [];
      let offset = "0";
      for (let page = 0; ; page++) {
        const data = object(
          await request(
            http,
            url(
              posthogHost(c),
              `/api/projects/${resourcePart(resource)}/insights/`,
              { saved: "true", limit: 100, offset },
            ),
            { headers: headers(c) },
          ),
        );
        for (const value of array(data.results)) {
          const r = object(value);
          if (!r.query) continue;
          let q: Query | undefined;
          try {
            q = safeQuery(r.query);
          } catch {
            continue;
          }
          if (q)
            definitions.push({
              id: `insight:${String(r.id)}`,
              label: `Saved ${String(q.kind).replace("Query", "").toLowerCase()} ${String(r.id)}`,
              group: "usage",
              shape:
                q.kind === "FunnelsQuery"
                  ? "funnel"
                  : q.kind === "RetentionQuery"
                    ? "cohort"
                    : "series",
              definition:
                "PostHog saved aggregate report. Supported event/action counts only; no person properties, breakdowns, SQL or formulas.",
            });
        }
        if (!data.next) break;
        const next = nextParameter(data.next, posthogHost(c), "offset");
        assert(
          next && next !== offset && page < 100,
          "provider_pagination_invalid",
          502,
        );
        offset = next;
      }
      return definitions;
    },
    async metric(input, query) {
      const match = /^insight:(\d+)$/.exec(query.metric);
      if (!match)
        return unavailable(query, "Select a supported saved insight.");
      const prefix = `${posthogHost(input.credentials)}/api/projects/${resourcePart(input.resourceId)}`;
      const insight = object(
        await request(http, `${prefix}/insights/${match[1]}/`, {
          headers: headers(input.credentials),
        }),
      );
      const q = safeQuery(insight.query);
      if (!q)
        return unavailable(
          query,
          "This saved insight uses unsupported properties, breakdowns or calculations.",
        );
      const run = async (report: Query) =>
        object(
          await request(http, `${prefix}/query/`, {
            method: "POST",
            headers: {
              ...headers(input.credentials),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: {
                ...report,
                dateRange: {
                  date_from: query.from,
                  date_to: query.to,
                  explicitDate: true,
                },
              },
              refresh: "blocking",
            }),
          }),
        );
      const response = await run(q);
      const result = normalizeInsight(q, response.results);
      if (q.kind === "TrendsQuery" && array(q.series).length === 1) {
        // Trends.count sums intervals, including repeated people. Request the
        // provider's period calculation separately for every KPI.
        const total = await run({
          ...q,
          trendsFilter: { display: "BoldNumber" },
        });
        const rows = array(total.results).map(object);
        if (rows.length === 1 && rows[0].aggregated_value != null)
          result.summary = decimal(rows[0].aggregated_value);
      }
      return result;
    },
  };
}
export function normalizeInsight(query: Query, value: unknown): MetricResult {
  const result = metricBase(
    "PostHog saved aggregate insight; provider calculation. Period unique-user totals are shown only when supplied by PostHog.",
  );
  result.timezone = "provider project timezone";
  if (query.kind === "FunnelsQuery") {
    result.shape = "funnel";
    result.points = array(value).map((v, index) => {
      const r = object(v);
      return {
        label: `Step ${index + 1}`,
        value: r.count == null ? null : decimal(r.count),
      };
    });
  } else if (query.kind === "RetentionQuery") {
    result.shape = "cohort";
    const rows = array(value).map(object);
    result.columns = Array.from(
      { length: Math.max(0, ...rows.map((r) => array(r.values).length)) },
      (_, i) => `${String(object(query.retentionFilter).period || "Day")} ${i}`,
    );
    result.rows = rows.map((r, i) => ({
      label:
        typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.date)
          ? r.date.slice(0, 10)
          : `Cohort ${i + 1}`,
      values: array(r.values).map((v) => {
        const cell = object(v);
        return cell.count == null ? null : decimal(cell.count);
      }),
    }));
  } else {
    const rows = array(value).map(object);
    result.points = rows.flatMap((r, index) => {
      const days = array(r.days),
        data = array(r.data);
      assert(days.length === data.length, "provider_response_invalid", 502);
      return days.map((day, i) => ({
        label: iso(day).slice(0, 10),
        series: `Series ${index + 1}`,
        value: data[i] == null ? null : decimal(data[i]),
      }));
    });
  }
  return result;
}
