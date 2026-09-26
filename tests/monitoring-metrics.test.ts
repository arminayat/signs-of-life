import { expect, it, vi } from "vitest";
import { monitorAdapter } from "../packages/adapters/src/monitoring";
import { exchange } from "../packages/adapters/src/monitoring/oauth";
import type { CollectionInput } from "../packages/core/src/monitoring";
const input: CollectionInput = {
  credentials: { apiKey: "fixture", region: "us" },
  resourceId: "123",
  environment: "production",
  from: "2026-01-01T00:00:00.000Z",
  until: "2026-02-01T00:00:00.000Z",
  cursor: {},
  historical: false,
};
const query = {
  metric: "activeUsers",
  from: "2026-01-01",
  to: "2026-01-02",
  filters: {},
};
it("requests a PostHog period calculation instead of summing unique users", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        query: {
          kind: "TrendsQuery",
          series: [{ kind: "EventsNode", event: "$pageview", math: "dau" }],
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        results: [
          { days: ["2026-01-01", "2026-01-02"], data: [10, 10], count: 20 },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ results: [{ aggregated_value: 12 }] }),
    );
  const result = await monitorAdapter("posthog", http).metric!(input, {
    ...query,
    metric: "insight:1",
  });
  expect(result.summary).toBe("12");
  expect(result.points.map((p) => p.value)).toEqual(["10", "10"]);
  expect(
    JSON.parse(String(http.mock.calls[2][1]?.body)).query.trendsFilter.display,
  ).toBe("BoldNumber");
});
it("keeps GA4 timezone, period unique values, filters and missing versus zero", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ timeZone: "America/New_York" }))
    .mockResolvedValueOnce(
      Response.json({
        rowCount: 2,
        rows: [
          {
            dimensionValues: [{ value: "20260101" }],
            metricValues: [{ value: "0" }],
          },
          {
            dimensionValues: [{ value: "20260102" }],
            metricValues: [{ value: "10" }],
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        rows: [{ metricValues: [{ value: "8" }] }],
        metadata: { subjectToThresholding: true },
      }),
    );
  const result = await monitorAdapter("ga4", http).metric!(input, {
    ...query,
    filters: { deviceCategory: "mobile" },
  });
  expect(result).toMatchObject({
    summary: "8",
    timezone: "America/New_York",
    status: "partial",
  });
  expect(result.points[0].value).toBe("0");
  const period = JSON.parse(String(http.mock.calls[2][1]?.body));
  expect(period.dimensions).toBeUndefined();
  expect(period.dimensionFilter.filter.stringFilter.value).toBe("mobile");
});
it("keeps unsupported metrics unavailable across all metric providers", async () => {
  for (const kind of [
    "stripe",
    "polar",
    "paddle",
    "revenuecat",
    "posthog",
    "ga4",
  ] as const) {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ timeZone: "UTC" }));
    expect(
      (
        await monitorAdapter(kind, http).metric!(input, {
          ...query,
          metric: "unsupported",
        })
      ).status,
    ).toBe("unsupported");
  }
});
it("uses Stripe Apps developer-key authentication and provider environment on OAuth exchange", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        access_token: "access",
        refresh_token: "refresh",
        stripe_user_id: "acct_1",
        livemode: false,
      }),
    );
  const result = await exchange(
    http,
    "stripe",
    {},
    {
      clientId: "ca_fixture",
      clientSecret: "sk_test_developer",
      redirectUri: "https://example.test/callback",
    },
    { code: "code" },
  );
  expect(result.environment).toBe("sandbox");
  expect(new Headers(http.mock.calls[0][1]?.headers).get("Authorization")).toBe(
    `Basic ${btoa("sk_test_developer:")}`,
  );
  expect(String(http.mock.calls[0][1]?.body)).not.toContain("client_secret");
});
it("classifies RevenueCat refunds and ignores the duplicate billing-error cancellation", async () => {
  const c = {
    apiKey: "fixture",
    webhookSecret: "a-long-webhook-secret",
    appProjects: JSON.stringify({ app: "project" }),
  };
  const adapter = monitorAdapter("revenuecat", vi.fn());
  const row = {
    id: "evt",
    app_id: "app",
    type: "CANCELLATION",
    event_timestamp_ms: Date.now(),
    environment: "PRODUCTION",
    email: "never-store@example.test",
    subscriber_attributes: { name: "Never Store" },
  };
  const headers = new Headers({ authorization: c.webhookSecret });
  const refund = await adapter.webhook!(
    c,
    JSON.stringify({ event: { ...row, cancel_reason: "CUSTOMER_SUPPORT" } }),
    headers,
  );
  expect(refund[0].kind).toBe("refund");
  expect(refund[0].amount).toBeUndefined(); // original price is not a refund amount
  expect(JSON.stringify(refund)).not.toMatch(/never-store|Never Store/);
  expect(
    await adapter.webhook!(
      c,
      JSON.stringify({ event: { ...row, cancel_reason: "BILLING_ERROR" } }),
      headers,
    ),
  ).toEqual([]);
});
it("hydrates modern Stripe charges to avoid invoice and charge double counting", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [
          {
            type: "charge.succeeded",
            created: 1767225600,
            data: {
              object: {
                id: "ch_1",
                paid: true,
                created: 1767225600,
                amount: 1000,
                currency: "usd",
              },
            },
          },
        ],
        has_more: false,
      }),
    )
    .mockResolvedValueOnce(Response.json({ id: "ch_1", invoice: "in_1" }))
    .mockResolvedValueOnce(
      Response.json({
        id: "in_1",
        paid: true,
        created: 1767225600,
        amount_paid: 1000,
        currency: "usd",
        billing_reason: "subscription_cycle",
        livemode: true,
      }),
    );
  const page = await monitorAdapter("stripe", http).collect!({
    ...input,
    credentials: { apiKey: "fixture", accountId: "acct_1" },
  });
  expect(page.events).toHaveLength(1);
  expect(page.events[0]).toMatchObject({
    kind: "renewal",
    amount: "10.00",
    reference: { object: "in_1", account: "acct_1" },
  });
  expect(
    new Headers(http.mock.calls[2][1]?.headers).get("Stripe-Version"),
  ).toBe("2024-06-20");
});
it("keeps tiny native ratios as exact decimal text and respects Stripe UGX units", async () => {
  const { decimal } = await import("../packages/adapters/src/monitoring/http");
  const { billingEvent } =
    await import("../packages/adapters/src/monitoring/billing-common");
  expect(decimal(1e-7)).toBe("0.0000001");
  expect(decimal("1.23e+21")).toBe("1230000000000000000000");
  expect(
    billingEvent(
      "stripe",
      "acct",
      "production",
      "ch",
      "payment",
      Date.now(),
      500,
      "ugx",
    ).amount,
  ).toBe("5.00");
});
