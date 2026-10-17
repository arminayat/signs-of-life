import { describe, expect, it, vi } from "vitest";
import type {
  CollectionInput,
  MetricQuery,
} from "../packages/core/src/monitoring";
import { googlePlay } from "../packages/adapters/src/monitoring/google-play";
import {
  googlePlayReport,
  parseGooglePlayReport,
} from "../packages/adapters/src/monitoring/google-play-reports";

const credentials = {
  bucket: "pubsite_prod_rev_fixture",
  accessToken: "fixture",
};
const input: CollectionInput = {
  credentials,
  resourceId: "com.example.my_app",
  environment: "production",
  from: "2026-01-01T00:00:00Z",
  until: "2026-02-01T00:00:00Z",
  cursor: {},
  historical: true,
};
const query: MetricQuery = {
  metric: "native:installs",
  from: "2026-01-01",
  to: "2026-01-02",
  filters: {},
};
const installsHeader =
  "Date,Package Name,Country,Daily Device Installs,Daily Device Uninstalls";
const ratingsHeader =
  "Date,Package Name,Country,Daily Average Rating,Total Average Rating";
function csv(text: string) {
  return new Response(Buffer.from(`\uFEFF${text}`, "utf16le"));
}
function installs(...rows: string[]) {
  return [installsHeader, ...rows].join("\r\n");
}

describe("Google Play catalog", () => {
  it("discovers distinct packages from bounded country reports and strips unrelated metadata", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              name: "stats/installs/installs_com.example.my_app_202601_country.csv",
              metadata: { email: "never-store@example.test" },
            },
            {
              name: "stats/installs/installs_com.example.my_app_202602_country.csv",
            },
            { name: "reviews/reviews_com.example.other_202601.csv" },
          ],
          nextPageToken: "second-page",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              name: "stats/installs/installs_com.example.other_202601_country.csv",
            },
          ],
        }),
      );
    const result = await googlePlay(http).catalog(credentials);
    expect(result).toEqual([
      {
        id: "com.example.my_app",
        name: "com.example.my_app",
        environment: "production",
      },
      {
        id: "com.example.other",
        name: "com.example.other",
        environment: "production",
      },
    ]);
    const first = new URL(String(http.mock.calls[0][0]));
    const second = new URL(String(http.mock.calls[1][0]));
    expect(first.origin).toBe("https://storage.googleapis.com");
    expect(first.searchParams.get("prefix")).toBe("stats/installs/");
    expect(first.searchParams.get("fields")).toBe("items(name),nextPageToken");
    expect(second.searchParams.get("pageToken")).toBe("second-page");
    expect(http.mock.calls[0][1]).toMatchObject({
      redirect: "manual",
      headers: { Authorization: "Bearer fixture" },
    });
  });

  it("fails explicitly for repeating pagination cursors", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ items: [], nextPageToken: "loop" }),
      );
    await expect(googlePlay(http).catalog(credentials)).rejects.toMatchObject({
      code: "provider_pagination_invalid",
    });
    expect(http).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly instead of truncating an overlarge catalog", async () => {
    let page = 0;
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ items: [], nextPageToken: String(++page) }),
      );
    await expect(googlePlay(http).catalog(credentials)).rejects.toMatchObject({
      code: "provider_pagination_invalid",
    });
    expect(http).toHaveBeenCalledTimes(100);
  });

  it.each([null, { items: "not-an-array" }, { items: [null] }])(
    "rejects malformed catalogs",
    async (data) => {
      await expect(
        googlePlay(async () => Response.json(data)).catalog(credentials),
      ).rejects.toMatchObject({ code: "provider_response_invalid" });
    },
  );

  it("validates bucket input before transmitting credentials", async () => {
    const http = vi.fn<typeof fetch>();
    await expect(
      googlePlay(http).catalog({ ...credentials, bucket: "../../private" }),
    ).rejects.toMatchObject({ code: "invalid_google_play_bucket" });
    expect(http).not.toHaveBeenCalled();
  });
});

describe("Google Play native metrics", () => {
  it("sums country device installs on Pacific report dates and preserves reported zero", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        csv(
          installs(
            "2026-01-01,com.example.my_app,US,7,2",
            "2026-01-01,com.example.my_app,DE,3,1",
            "2026-01-02,com.example.my_app,US,0,0",
          ),
        ),
      );
    const result = await googlePlay(http).metric!(input, query);
    expect(result).toMatchObject({
      status: "available",
      timezone: "America/Los_Angeles",
      unit: "count",
      summary: "10",
      points: [
        { label: "2026-01-01", value: "10" },
        { label: "2026-01-02", value: "0" },
      ],
    });
    const target = new URL(String(http.mock.calls[0][0]));
    expect(decodeURIComponent(target.pathname)).toBe(
      "/storage/v1/b/pubsite_prod_rev_fixture/o/stats/installs/installs_com.example.my_app_202601_country.csv",
    );
    expect(target.searchParams.get("alt")).toBe("media");
  });

  it("returns selected-country uninstalls without adding other countries", async () => {
    const adapter = googlePlay(async () =>
      csv(
        installs(
          "2026-01-01,com.example.my_app,US,7,2",
          "2026-01-01,com.example.my_app,DE,3,1",
        ),
      ),
    );
    const result = await adapter.metric!(input, {
      ...query,
      to: query.from,
      metric: "native:uninstalls",
      filters: { country: "US" },
    });
    expect(result.summary).toBe("2");
    expect(result.points[0].value).toBe("2");
  });

  it("retains missing dates as null and never shows a misleading complete total", async () => {
    const result = await googlePlay(async () =>
      csv(installs("2026-01-01,com.example.my_app,US,7,2")),
    ).metric!(input, query);
    expect(result.status).toBe("partial");
    expect(result.summary).toBeUndefined();
    expect(result.points).toEqual([
      { label: "2026-01-01", value: "7" },
      { label: "2026-01-02", value: null },
    ]);
  });

  it("treats missing monthly files as unavailable rather than zero", async () => {
    const result = await googlePlay(
      async () => new Response("private provider detail", { status: 404 }),
    ).metric!(input, query);
    expect(result.status).toBe("unavailable");
    expect(result.points.every((point) => point.value === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private provider detail");
  });

  it("fetches each month once across a year boundary", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        csv(installs("2025-12-31,com.example.my_app,US,4,1")),
      )
      .mockResolvedValueOnce(
        csv(installs("2026-01-01,com.example.my_app,US,7,2")),
      );
    const result = await googlePlay(http).metric!(input, {
      ...query,
      from: "2025-12-31",
      to: "2026-01-01",
    });
    expect(result.summary).toBe("11");
    expect(http).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(http.mock.calls[0][0]))).toContain(
      "202512_country.csv",
    );
    expect(decodeURIComponent(String(http.mock.calls[1][0]))).toContain(
      "202601_country.csv",
    );
  });

  it("keeps missing cells and absent countries distinct from zero", async () => {
    const text = installs(
      "2026-01-01,com.example.my_app,US,7,2",
      "2026-01-01,com.example.my_app,DE,,1",
    );
    const adapter = googlePlay(async () => csv(text));
    const combined = await adapter.metric!(input, { ...query, to: query.from });
    const absent = await adapter.metric!(input, {
      ...query,
      to: query.from,
      filters: { country: "GB" },
    });
    expect(combined.points[0].value).toBeNull();
    expect(absent.points[0].value).toBeNull();
    expect(combined.summary).toBeUndefined();
  });

  it("requires a country for ratings and never averages country or daily averages", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        csv(
          [
            ratingsHeader,
            "2026-01-01,com.example.my_app,US,4.25,4.10",
            "2026-01-01,com.example.my_app,DE,1.25,3.10",
            "2026-01-02,com.example.my_app,US,,4.12",
          ].join("\n"),
        ),
      );
    const adapter = googlePlay(http);
    const ratingQuery = { ...query, metric: "native:daily-average-rating" };
    expect((await adapter.metric!(input, ratingQuery)).reason).toContain(
      "Choose a country",
    );
    expect(http).not.toHaveBeenCalled();
    const daily = await adapter.metric!(input, {
      ...ratingQuery,
      filters: { country: "US" },
    });
    expect(daily.points.map((point) => point.value)).toEqual(["4.25", null]);
    expect(daily.summary).toBeUndefined();
    const total = await adapter.metric!(input, {
      ...ratingQuery,
      metric: "native:total-average-rating",
      filters: { country: "US" },
    });
    expect(total.points.map((point) => point.value)).toEqual(["4.10", "4.12"]);
    expect(total.summary).toBeUndefined();
    expect(total.unit).toBe("stars");
  });

  it("preserves integer precision for counts", async () => {
    const result = await googlePlay(async () =>
      csv(installs("2026-01-01,com.example.my_app,US,9007199254740993,0")),
    ).metric!(input, { ...query, to: query.from });
    expect(result.summary).toBe("9007199254740993");
  });

  it.each([{ from: "2026-02-30" }, { to: "2025-01-01" }, { to: "2028-01-01" }])(
    "rejects invalid or unbounded date ranges",
    async (range) => {
      const http = vi.fn<typeof fetch>();
      await expect(
        googlePlay(http).metric!(input, { ...query, ...range }),
      ).rejects.toMatchObject({ code: "invalid_report_range" });
      expect(http).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 429, 503])(
    "sanitizes report HTTP errors and bounded retry delays (%i)",
    async (status) => {
      await expect(
        googlePlay(
          async () =>
            new Response("private provider payload", {
              status,
              headers: { "Retry-After": "999999" },
            }),
        ).metric!(input, query),
      ).rejects.toMatchObject({
        code:
          status === 401
            ? "provider_reconnect_required"
            : status === 403
              ? "provider_permission_denied"
              : `provider_http_${status}`,
        ...(status === 429 || status === 503
          ? { retryAfterSeconds: 86400 }
          : {}),
      });
    },
  );
});

describe("Google Play report decoding and validation", () => {
  const parse = (text: string) =>
    parseGooglePlayReport(
      text,
      input.resourceId,
      "202601",
      "Daily Device Installs",
      false,
    );

  it("handles quoted cells, additional columns and quoted line breaks", () => {
    const text = `${installsHeader},Extra\r\n"2026-01-01","com.example.my_app","US","7",2,"a,b\r\n""quoted"""\r\n`;
    expect(parse(text).get("2026-01-01")).toBe("7");
  });

  it.each([
    "Date,Country,Daily Device Installs\n2026-01-01,US,7",
    `${installsHeader}\n2026-01-01,com.example.my_app,US,7,2,extra`,
    `${installsHeader}\n"2026-01-01,com.example.my_app,US,7,2`,
    `${installsHeader}\n"2026-01-01"extra,com.example.my_app,US,7,2`,
    installs("2026-01-01,com.other.app,US,7,2"),
    installs("2026-01-32,com.example.my_app,US,7,2"),
    installs("2026-02-01,com.example.my_app,US,7,2"),
    installs("2026-01-01,com.example.my_app,US,-7,2"),
    installs("2026-01-01,com.example.my_app,US,7oops,2"),
    installs(
      "2026-01-01,com.example.my_app,US,7,2",
      "2026-01-01,com.example.my_app,US,7,2",
    ),
  ])("rejects malformed, duplicate or mismatched rows", (text) => {
    expect(() => parse(text)).toThrow();
  });

  it("decodes UTF-16 with a BOM split across response chunks", async () => {
    const bytes = Buffer.from(`\uFEFF${installsHeader}`, "utf16le");
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 1));
          controller.enqueue(bytes.subarray(1));
          controller.close();
        },
      }),
    );
    expect(
      await googlePlayReport(
        async () => response,
        new URL("https://storage.googleapis.com/fixture"),
        {},
        { remaining: 10000 },
      ),
    ).toBe(installsHeader);
  });

  it("accepts big-endian UTF-16 when explicitly identified by its BOM", async () => {
    const bytes = Buffer.from(`\uFEFF${installsHeader}`, "utf16le").swap16();
    expect(
      await googlePlayReport(
        async () => new Response(bytes),
        new URL("https://storage.googleapis.com/fixture"),
        {},
        { remaining: 10000 },
      ),
    ).toBe(installsHeader);
  });

  it("rejects truncated UTF-16 and unexpected encodings", async () => {
    for (const bytes of [
      new Uint8Array([0xff, 0xfe, 0x41]),
      new TextEncoder().encode(installsHeader),
    ]) {
      await expect(
        googlePlayReport(
          async () => new Response(bytes),
          new URL("https://storage.googleapis.com/fixture"),
          {},
          { remaining: 10000 },
        ),
      ).rejects.toMatchObject({ code: "google_play_report_encoding_invalid" });
    }
  });

  it("cancels the body when the shared query byte budget is exhausted", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(10));
        },
        cancel,
      }),
    );
    await expect(
      googlePlayReport(
        async () => response,
        new URL("https://storage.googleapis.com/fixture"),
        {},
        { remaining: 5 },
      ),
    ).rejects.toMatchObject({ code: "provider_response_too_large" });
    expect(cancel).toHaveBeenCalled();
  });
});
