import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  appleSource,
  parseSubscriptionReports,
  summarizeSalesReport,
} from "../packages/adapters/src/apple-source";
import { summarizeAppStore } from "../packages/core/src/app-store";
const salesColumns = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Version",
  "Product Type Identifier",
  "Units",
  "Developer Proceeds",
  "Begin Date",
  "End Date",
  "Customer Currency",
  "Country Code",
  "Currency of Proceeds",
  "Apple Identifier",
  "Customer Price",
  "Promo Code",
  "Parent Identifier",
  "Subscription",
  "Period",
  "Category",
  "CMB",
  "Device",
  "Supported Platforms",
  "Proceeds Reason",
  "Preserved Pricing",
  "Client",
  "Order Type",
];
const tsv = (columns: string[], rows: Record<string, string | number>[]) =>
  [
    columns.join("\t"),
    ...rows.map((row) => columns.map((c) => row[c] ?? "").join("\t")),
  ].join("\n");
const sale = (row: Record<string, string | number>) => ({
  "Developer Proceeds": 0,
  "Currency of Proceeds": "USD",
  ...row,
});
const salesReport = tsv(salesColumns, [
  sale({
    SKU: "a.sku",
    Title: "App A",
    "Apple Identifier": 111,
    "Product Type Identifier": "1",
    Units: 3,
    "Country Code": "US",
    Device: "iPhone",
  }),
  sale({
    SKU: "a.sku",
    Title: "App A",
    "Apple Identifier": 111,
    "Product Type Identifier": "1F",
    Units: 1,
    "Country Code": "DE",
    Device: "iPad",
  }),
  sale({
    SKU: "a.sku",
    Title: "App A",
    "Apple Identifier": 111,
    "Product Type Identifier": "3",
    Units: 2,
    "Country Code": "US",
  }),
  sale({
    SKU: "a.sku",
    Title: "App A",
    "Apple Identifier": 111,
    "Product Type Identifier": "7",
    Units: 5,
    Version: "2.0",
  }),
  sale({
    SKU: "monthly",
    Title: "Monthly",
    "Apple Identifier": 900,
    "Product Type Identifier": "IAY",
    Units: 2,
    "Developer Proceeds": 3.49,
    "Currency of Proceeds": "EUR",
    "Parent Identifier": "a.sku",
    Subscription: "New",
  }),
  sale({
    SKU: "monthly",
    Title: "Monthly",
    "Apple Identifier": 900,
    "Product Type Identifier": "IAY",
    Units: 1,
    "Developer Proceeds": 3.49,
    "Currency of Proceeds": "EUR",
    "Parent Identifier": "a.sku",
    Subscription: "Renewal",
  }),
  sale({
    SKU: "monthly",
    Title: "Monthly",
    "Apple Identifier": 900,
    "Product Type Identifier": "IAY",
    Units: -1,
    "Developer Proceeds": 3.49,
    "Currency of Proceeds": "EUR",
    "Parent Identifier": "a.sku",
  }),
  sale({
    SKU: "coins",
    Title: "Coins",
    "Apple Identifier": 901,
    "Product Type Identifier": "IA1",
    Units: 4,
    "Developer Proceeds": 0.7,
    "Parent Identifier": "b.sku",
  }),
  sale({
    SKU: "gems",
    Title: "Gems",
    "Apple Identifier": 902,
    "Product Type Identifier": "IA1",
    Units: 1,
    "Developer Proceeds": 1,
    "Parent Identifier": "c.sku",
  }),
]);
async function appleCredentials() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = Buffer.from(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ).toString("base64");
  return {
    issuerId: "11111111-1111-4111-8111-111111111111",
    keyId: "ABCDEFGHIJ",
    privateKey: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----`,
    vendorNumber: "123456",
  };
}
const gzip = (text: string) => new Response(gzipSync(Buffer.from(text)));
describe("App Store report parsing", () => {
  it("splits a full Sales report by app and attributes in-app purchases by parent SKU", () => {
    const { metrics, unresolved } = summarizeSalesReport(salesReport, {
      "b.sku": { appId: "222", title: "App B" },
    });
    expect(unresolved).toEqual(["c.sku"]);
    const a = metrics.find((m) => m.appId === "111")!;
    expect(a).toMatchObject({ title: "App A", downloads: 4, redownloads: 2 });
    expect(a.sales).toEqual({
      downloads: 4,
      redownloads: 2,
      updates: 5,
      purchases: 3,
      renewals: 1,
      refunds: 1,
      proceeds: { EUR: 6.98 },
      countries: { US: 3, DE: 1 },
      devices: { iPhone: 3, iPad: 1 },
      versions: { "2.0": 5 },
      products: { Monthly: { units: 3, proceeds: { EUR: 6.98 } } },
    });
    const b = metrics.find((m) => m.appId === "222")!;
    expect(b).toMatchObject({ title: "App B", downloads: 0, redownloads: 0 });
    expect(b.sales).toMatchObject({
      purchases: 4,
      proceeds: { USD: 2.8 },
      products: { Coins: { units: 4, proceeds: { USD: 2.8 } } },
    });
  });
  it("parses subscription summaries and events per app", () => {
    const summary = tsv(
      [
        "App Apple ID",
        "Subscription Name",
        "Active Standard Price Subscriptions",
        "Active Free Trial Introductory Offer Subscriptions",
        "Free Trial Offer Code Subscriptions",
        "Active Pay Up Front Introductory Offer Subscriptions",
        "Pay As You Go Win-back Offers",
        "Billing Retry",
        "Grace Period",
      ],
      [
        {
          "App Apple ID": 111,
          "Subscription Name": "Monthly",
          "Active Standard Price Subscriptions": 5,
          "Active Free Trial Introductory Offer Subscriptions": 2,
          "Free Trial Offer Code Subscriptions": 1,
          "Active Pay Up Front Introductory Offer Subscriptions": 1,
          "Billing Retry": 1,
        },
        {
          "App Apple ID": 111,
          "Subscription Name": "Yearly",
          "Active Standard Price Subscriptions": 2,
          "Pay As You Go Win-back Offers": 1,
          "Grace Period": 1,
        },
      ],
    );
    const events = tsv(
      ["Event Date", "Event", "App Apple ID", "Quantity"],
      [
        { Event: "Renew", "App Apple ID": 111, Quantity: 3 },
        { Event: "Cancel", "App Apple ID": 111, Quantity: 1 },
        { Event: "Renew", "App Apple ID": 222, Quantity: 2 },
      ],
    );
    expect(parseSubscriptionReports(summary, events)).toEqual([
      {
        appId: "111",
        subscriptions: {
          active: 7,
          trials: 3,
          offers: 2,
          billingRetry: 1,
          gracePeriod: 1,
          plans: { Monthly: 9, Yearly: 3 },
          events: { Renew: 3, Cancel: 1 },
        },
      },
      {
        appId: "222",
        subscriptions: expect.objectContaining({
          active: 0,
          events: { Renew: 2 },
        }),
      },
    ]);
    expect(() =>
      parseSubscriptionReports("App Apple ID\tQuantity\n1\t2", null),
    ).toThrow("apple_report_format_changed");
  });
  it("aggregates stored days, keeping missing reports null and the newest subscription snapshot", () => {
    const { metrics } = summarizeSalesReport(salesReport);
    const sales = metrics.find((m) => m.appId === "111")!.sales!;
    const stats = summarizeAppStore(
      ["2026-01-01", "2026-01-02", "2026-01-03"],
      [
        { date: "2026-01-01", sales, subscriptions: null },
        {
          date: "2026-01-03",
          sales,
          subscriptions: {
            active: 4,
            trials: 1,
            offers: 0,
            billingRetry: 0,
            gracePeriod: 0,
            plans: { Monthly: 5 },
            events: { Renew: 2 },
          },
        },
      ],
    );
    expect(stats.reportDays).toBe(2);
    expect(stats.days[1]).toMatchObject({ downloads: null, active: null });
    expect(stats.totals).toMatchObject({
      downloads: 8,
      updates: 10,
      proceeds: { EUR: 13.96 },
    });
    expect(stats.countries).toEqual({ US: 6, DE: 2 });
    expect(stats.products).toEqual([
      { name: "Monthly", units: 6, proceeds: { EUR: 13.96 } },
    ]);
    expect(stats.subscriptions).toMatchObject({
      date: "2026-01-03",
      active: 4,
    });
    expect(stats.events).toEqual({ Renew: 2 });
  });
});
describe("App Store Connect adapter", () => {
  it("resolves an unknown parent SKU once per Apple team", async () => {
    const credentials = await appleCredentials();
    const report = tsv(salesColumns, [
      sale({
        Title: "Coins",
        "Product Type Identifier": "IA1",
        Units: 2,
        "Developer Proceeds": 1,
        "Parent Identifier": "x.sku",
      }),
    ]);
    const http = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/apps")
        return Response.json({
          data: [{ id: "333", attributes: { name: "App X" } }],
        });
      return gzip(report);
    });
    const source = appleSource(http);
    for (const date of ["2026-01-01", "2026-01-02"])
      expect(await source.report(credentials, date)).toMatchObject([
        { appId: "333", title: "App X", sales: { purchases: 2 } },
      ]);
    const lookups = http.mock.calls.filter(
      ([input]) => new URL(String(input)).pathname === "/v1/apps",
    );
    expect(lookups).toHaveLength(1);
    expect(new URL(String(lookups[0][0])).searchParams.get("filter[sku]")).toBe(
      "x.sku",
    );
  });
  it("treats missing or forbidden subscription reports as unavailable", async () => {
    const credentials = await appleCredentials();
    for (const statuses of [
      [404, 404],
      [403, 410],
    ]) {
      const http = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: statuses[0] }))
        .mockResolvedValueOnce(new Response(null, { status: statuses[1] }));
      await expect(
        appleSource(http).subscriptions(credentials, "2026-01-01"),
      ).resolves.toBeNull();
    }
    const failing = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      appleSource(failing).subscriptions(credentials, "2026-01-01"),
    ).rejects.toThrow("apple_http_500");
  });
  it("reads versions, reviews without nicknames, and storefront ratings", async () => {
    const credentials = await appleCredentials();
    const http = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/appStoreVersions"))
        return Response.json({
          data: [
            {
              attributes: {
                versionString: "1.5.0",
                appStoreState: "PREPARE_FOR_SUBMISSION",
                platform: "IOS",
                createdDate: "2026-11-01T00:00:00Z",
              },
            },
          ],
        });
      if (url.pathname.endsWith("/customerReviews"))
        return new Response(null, { status: 403 });
      const country = url.searchParams.get("country");
      return Response.json({
        results: [
          {
            averageUserRating: country === "de" ? 4.75 : 0,
            userRatingCount: country === "de" ? 4 : 0,
            trackViewUrl: "https://apps.apple.com/de/app/example/id111?uo=4",
          },
        ],
      });
    });
    const listing = await appleSource(http).listing(credentials, "111", [
      "US",
      "DE",
    ]);
    expect(listing).toEqual({
      storeUrl: "https://apps.apple.com/de/app/example/id111",
      versions: [
        {
          version: "1.5.0",
          state: "PREPARE_FOR_SUBMISSION",
          platform: "IOS",
          created: "2026-11-01T00:00:00Z",
        },
      ],
      reviews: null,
      ratings: [{ country: "DE", average: 4.75, count: 4 }],
    });
    const reviews = http.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/customerReviews"))!;
    expect(reviews.searchParams.get("fields[customerReviews]")).not.toContain(
      "reviewerNickname",
    );
    await expect(
      appleSource(http).listing(credentials, "../apps", []),
    ).rejects.toThrow("invalid_apple_app_id");
  });
});
