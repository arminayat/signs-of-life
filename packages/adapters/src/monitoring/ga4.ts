import { assert } from "../../../core/src/model";
import type {
  MetricDefinition,
  ProviderAdapter,
  Resource,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
import {
  array,
  decimal,
  headers,
  metricBase,
  object,
  request,
  string,
  unavailable,
  url,
} from "./http";
const metrics = [
  "activeUsers",
  "newUsers",
  "sessions",
  "screenPageViews",
  "keyEvents",
  "sessionKeyEventRate",
];
const definitions: MetricDefinition[] = metrics.map((id) => ({
  id,
  label: (
    {
      activeUsers: "Active users",
      newUsers: "New users",
      sessions: "Sessions",
      screenPageViews: "Page and screen views",
      keyEvents: "Key events",
      sessionKeyEventRate: "Session key event rate",
    } as Record<string, string>
  )[id],
  group: "usage",
  shape: "series",
  definition: `GA4 ${id}. Period totals are requested separately from daily values; unique users and rates are never summed.`,
  filters: [
    {
      id: "deviceCategory",
      label: "Device",
      values: ["desktop", "mobile", "tablet"],
    },
  ],
}));
definitions.push(
  {
    id: "signup-funnel",
    label: "Visit → sign up → purchase",
    shape: "funnel",
    group: "usage",
    definition:
      "GA4 closed funnel using session_start, sign_up and purchase. Requires existing events and Funnel API access.",
  },
  {
    id: "retention",
    label: "New-user retention",
    group: "usage",
    shape: "cohort",
    definition:
      "GA4 cohort active users by days since first session, for users acquired in the selected period. Counts supplied by GA4, not calculated retention rates.",
  },
);
export function ga4(http: Http): ProviderAdapter {
  return {
    async catalog(c) {
      if (c.propertyId) {
        assert(/^\d+$/.test(c.propertyId), "invalid_ga4_property_id");
        const p = object(
          await request(
            http,
            `https://analyticsadmin.googleapis.com/v1beta/properties/${c.propertyId}`,
            { headers: headers(c) },
          ),
        );
        return [
          {
            id: c.propertyId,
            name: string(p.displayName),
            environment: "production",
          },
        ];
      }
      const resources: Resource[] = [];
      let next: string | undefined;
      for (let page = 0; ; page++) {
        const data = object(
          await request(
            http,
            url(
              "https://analyticsadmin.googleapis.com",
              "/v1beta/accountSummaries",
              { pageSize: 200, pageToken: next },
            ),
            { headers: headers(c) },
          ),
        );
        for (const value of array(data.accountSummaries ?? [])) {
          const account = object(value);
          for (const v of array(account.propertySummaries ?? [])) {
            const p = object(v);
            resources.push({
              id: string(p.property).replace(/^properties\//, ""),
              name: string(p.displayName),
              organizationName: string(account.displayName),
              environment: "production",
            });
          }
        }
        if (!data.nextPageToken) break;
        assert(
          data.nextPageToken !== next && page < 100,
          "provider_pagination_invalid",
          502,
        );
        next = string(data.nextPageToken);
      }
      return resources;
    },
    definitions: async () => definitions,
    async metric(input, query) {
      assert(/^\d+$/.test(input.resourceId), "invalid_ga4_property_id");
      const property = `properties/${input.resourceId}`,
        c = input.credentials;
      const meta = object(
        await request(
          http,
          `https://analyticsadmin.googleapis.com/v1beta/${property}`,
          { headers: headers(c) },
        ),
      );
      const definition = definitions.find((d) => d.id === query.metric);
      if (!definition) return unavailable(query, "Metric not supported.");
      const result = {
        ...metricBase(
          definition.definition,
          query.metric.endsWith("Rate") ? "ratio" : "count",
        ),
        timezone: string(meta.timeZone),
      };
      const dateRanges = [{ startDate: query.from, endDate: query.to }];
      const post = async (method: string, body: unknown, version = "v1beta") =>
        object(
          await request(
            http,
            `https://analyticsdata.googleapis.com/${version}/${property}:${method}`,
            {
              method: "POST",
              headers: { ...headers(c), "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          ),
        );
      if (query.metric === "signup-funnel") {
        const data = await post(
          "runFunnelReport",
          {
            dateRanges,
            funnel: {
              isOpenFunnel: false,
              steps: ["session_start", "sign_up", "purchase"].map(
                (eventName) => ({
                  name: eventName,
                  filterExpression: { funnelEventFilter: { eventName } },
                }),
              ),
            },
          },
          "v1alpha",
        );
        const table = object(data.funnelTable);
        const names = array(table.metricHeaders).map((v) => object(v).name);
        const index = names.indexOf("activeUsers");
        assert(index >= 0, "provider_funnel_invalid", 502);
        result.shape = "funnel";
        result.points = array(table.rows ?? []).map((v, i) => {
          const row = object(v);
          return {
            label: ["Visit", "Sign up", "Purchase"][i] || `Step ${i + 1}`,
            value: decimal(object(array(row.metricValues)[index]).value),
          };
        });
        if (object(table.metadata ?? {}).samplingMetadatas)
          result.status = "partial";
        return result;
      }
      if (query.metric === "retention") {
        const data = await post("runReport", {
          dimensions: [{ name: "cohortNthDay" }],
          orderBys: [
            {
              dimension: {
                dimensionName: "cohortNthDay",
                orderType: "NUMERIC",
              },
            },
          ],
          metrics: [{ name: "cohortActiveUsers" }],
          cohortSpec: {
            cohorts: [
              {
                name: "selected",
                dimension: "firstSessionDate",
                dateRange: dateRanges[0],
              },
            ],
            cohortsRange: {
              granularity: "DAILY",
              startOffset: 0,
              endOffset: 30,
            },
          },
          limit: "1000",
        });
        result.shape = "cohort";
        const rows = array(data.rows ?? []).map(object);
        assert(
          !data.rowCount || Number(data.rowCount) <= rows.length,
          "provider_report_truncated",
          502,
        );
        const metadata = object(data.metadata ?? {});
        if (
          metadata.subjectToThresholding ||
          metadata.dataLossFromOtherRow ||
          metadata.samplingMetadatas
        )
          result.status = "partial";
        result.columns = rows.map(
          (r) => `Day ${string(object(array(r.dimensionValues)[0]).value)}`,
        );
        result.rows = [
          {
            label: `${query.from} – ${query.to}`,
            values: rows.map((r) =>
              decimal(object(array(r.metricValues)[0]).value),
            ),
          },
        ];
        return result;
      }
      const dimensionFilter = query.filters.deviceCategory
        ? {
            filter: {
              fieldName: "deviceCategory",
              stringFilter: {
                matchType: "EXACT",
                value: query.filters.deviceCategory,
              },
            },
          }
        : undefined;
      const body = {
        dateRanges,
        metrics: [{ name: query.metric }],
        dimensionFilter,
        keepEmptyRows: true,
        limit: "1000",
      };
      const data = await post("runReport", {
        ...body,
        dimensions: [{ name: "date" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      });
      const rows = array(data.rows ?? []).map(object);
      assert(
        !data.rowCount || Number(data.rowCount) <= rows.length,
        "provider_report_truncated",
        502,
      );
      result.points = rows.map((r) => {
        const date = string(object(array(r.dimensionValues)[0]).value);
        assert(/^\d{8}$/.test(date), "provider_date_invalid", 502);
        return {
          label: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
          value: decimal(object(array(r.metricValues)[0]).value),
        };
      });
      const totals = await post("runReport", body);
      const totalRows = array(totals.rows ?? []);
      if (totalRows.length)
        result.summary = decimal(
          object(array(object(totalRows[0]).metricValues)[0]).value,
        );
      const metadata = {
        ...object(data.metadata ?? {}),
        ...object(totals.metadata ?? {}),
      };
      if (
        metadata.subjectToThresholding ||
        metadata.dataLossFromOtherRow ||
        metadata.samplingMetadatas
      ) {
        result.status = "partial";
        result.reason =
          "GA4 reports thresholding, sampling or an other-row data limitation.";
      }
      return result;
    },
  };
}
