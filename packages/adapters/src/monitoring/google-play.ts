import { assert } from "../../../core/src/model";
import type {
  Credentials,
  MetricDefinition,
  ProviderAdapter,
  Resource,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
import {
  array,
  headers,
  metricBase,
  object,
  request,
  string,
  unavailable,
  url,
} from "./http";
import {
  googlePlayReport,
  parseGooglePlayReport,
  validGooglePlayDay,
} from "./google-play-reports";

const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const columns = {
  "native:installs": "Daily Device Installs",
  "native:uninstalls": "Daily Device Uninstalls",
  "native:daily-average-rating": "Daily Average Rating",
  "native:total-average-rating": "Total Average Rating",
};
const definitions: MetricDefinition[] = Object.entries(columns).map(
  ([id, column]) => ({
    id,
    label: (
      {
        "native:installs": "Device installs",
        "native:uninstalls": "Device uninstalls",
        "native:daily-average-rating": "Daily average rating by country",
        "native:total-average-rating": "Total average rating by country",
      } as Record<string, string>
    )[id],
    group: id.includes("rating") ? "usage" : "growth",
    shape: "series",
    definition: `Google Play ${column} from monthly country reports, on Pacific reporting dates. Exports are normally delayed 3–7 days. ${id.includes("rating") ? "Choose a country; provider averages are never combined across countries or dates." : "Daily device counts are summed across countries unless a country is selected; these are not first opens or unique people."}`,
    filters: [
      { id: "country", label: "Country code (required for ratings, e.g. US)" },
    ],
  }),
);

function bucket(c: Credentials) {
  assert(
    /^pubsite_prod_(?:rev_)?[a-zA-Z0-9_-]{1,100}$/.test(c.bucket ?? ""),
    "invalid_google_play_bucket",
  );
  return c.bucket;
}

export function googlePlay(http: Http): ProviderAdapter {
  return {
    async catalog(c) {
      const base = `/storage/v1/b/${bucket(c)}/o`;
      const resources = new Map<string, Resource>();
      const seenTokens = new Set<string>();
      let next: string | undefined;
      for (let page = 0; ; page++) {
        const data = object(
          await request(
            http,
            url("https://storage.googleapis.com", base, {
              prefix: "stats/installs/",
              matchGlob: "stats/installs/installs_*_country.csv",
              fields: "items(name),nextPageToken",
              maxResults: 1000,
              pageToken: next,
            }),
            { headers: headers(c) },
          ),
        );
        for (const item of array(data.items ?? [])) {
          const name = string(object(item).name);
          const match =
            /^stats\/installs\/installs_(.+)_\d{6}_country\.csv$/.exec(name);
          if (!match || !packagePattern.test(match[1])) continue;
          resources.set(match[1], {
            id: match[1],
            name: match[1],
            environment: "production",
          });
          assert(resources.size <= 5000, "provider_catalog_too_large", 502);
        }
        if (!data.nextPageToken) break;
        next = string(data.nextPageToken);
        assert(
          page < 99 && !seenTokens.has(next),
          "provider_pagination_invalid",
          502,
        );
        seenTokens.add(next);
      }
      return [...resources.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    definitions: async () => definitions,
    async metric(input, query) {
      const definition = definitions.find((entry) => entry.id === query.metric);
      if (!definition) return unavailable(query, "Metric not supported.");
      const name = input.resourceId;
      assert(
        packagePattern.test(name) && name.length <= 255,
        "invalid_google_play_package",
      );
      const bucketName = bucket(input.credentials);
      assert(
        validGooglePlayDay(query.from) &&
          validGooglePlayDay(query.to) &&
          query.from <= query.to,
        "invalid_report_range",
      );
      const days =
        (Date.parse(query.to) - Date.parse(query.from)) / 86400000 + 1;
      assert(days <= 366, "invalid_report_range");
      const rating = query.metric.includes("rating");
      const country = query.filters.country?.trim();
      assert(
        !country || /^[A-Z]{2}$/.test(country),
        "invalid_google_play_country",
      );
      const result = {
        ...metricBase(definition.definition, rating ? "stars" : "count"),
        timezone: "America/Los_Angeles",
      };
      if (rating && !country) {
        result.status = "unavailable";
        result.reason =
          "Choose a country code to view ratings; country averages cannot be combined.";
        return result;
      }
      const dates = Array.from({ length: days }, (_, index) =>
        new Date(Date.parse(query.from) + index * 86400000)
          .toISOString()
          .slice(0, 10),
      );
      const months = [
        ...new Set(dates.map((day) => day.slice(0, 7).replace("-", ""))),
      ];
      const values = new Map<string, string | null>();
      const budget = { remaining: 32_000_000 };
      const cancellation = new AbortController();
      const signal = AbortSignal.any([
        cancellation.signal,
        AbortSignal.timeout(180_000),
      ]);
      async function readMonth(month: string) {
        const type = rating ? "ratings" : "installs";
        const reportName = `stats/${type}/${type}_${name}_${month}_country.csv`;
        const target = url(
          "https://storage.googleapis.com",
          `/storage/v1/b/${bucketName}/o/${encodeURIComponent(reportName)}`,
          { alt: "media" },
        );
        const text = await googlePlayReport(
          http,
          target,
          headers(input.credentials),
          budget,
          signal,
        );
        if (text === null) return;
        const parsed = parseGooglePlayReport(
          text,
          name,
          month,
          columns[query.metric as keyof typeof columns],
          rating,
          country,
        );
        for (const [day, value] of parsed) values.set(day, value);
      }
      // A 366-day query can span 13 monthly files. Three bounded readers keep
      // even slow successful reports within the worker's five-minute lease.
      const remaining = [...months];
      try {
        await Promise.all(
          Array.from({ length: Math.min(3, months.length) }, async () => {
            for (;;) {
              signal.throwIfAborted();
              const month = remaining.shift();
              if (!month) return;
              await readMonth(month);
            }
          }),
        );
      } finally {
        cancellation.abort();
      }
      result.points = dates.map((label) => ({
        label,
        value: values.get(label) ?? null,
      }));
      const present = result.points.filter((point) => point.value !== null);
      if (present.length < dates.length) {
        result.status = present.length ? "partial" : "unavailable";
        result.reason =
          "Some report dates or country values are unavailable. Google Play normally publishes exports after 3–7 days; missing values are not zero.";
      } else if (!rating) {
        result.summary = String(
          present.reduce((sum, point) => sum + BigInt(point.value!), 0n),
        );
      }
      return result;
    },
  };
}
