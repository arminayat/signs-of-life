import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CollectionInput,
  MetricQuery,
} from "../packages/core/src/monitoring";
import { stripe } from "../packages/adapters/src/monitoring/stripe";
import { ga4 } from "../packages/adapters/src/monitoring/ga4";
import { authSource } from "../packages/adapters/src/monitoring/auth-sources";
import { posthog } from "../packages/adapters/src/monitoring/posthog";

const input: CollectionInput = {
  credentials: { apiKey: "fixture", accountId: "acct_fixture" },
  resourceId: "123",
  environment: "production",
  from: "2026-01-01T00:00:00.000Z",
  until: "2026-01-02T00:00:00.000Z",
  historical: false,
  cursor: {},
};
const query: MetricQuery = {
  metric: "activeUsers",
  from: "2026-01-01",
  to: "2026-01-01",
  filters: {},
};
afterEach(() => vi.useRealTimers());

describe("Stripe event isolation", () => {
  const unrelated = {
    id: "evt_balance",
    type: "balance.available",
    created: 1767225600,
    data: { object: { object: "balance", available: [], pending: [] } },
  };
  it("skips unrelated objects while processing and checkpointing supported events", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          unrelated,
          {
            id: "evt_payment",
            type: "charge.succeeded",
            created: 1767225600,
            data: {
              object: {
                id: "ch_fixture",
                invoice: null,
                paid: true,
                amount: 123,
                currency: "usd",
                livemode: true,
              },
            },
          },
        ],
        has_more: true,
      }),
    );
    const result = await stripe(http).collect!(input);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: "payment", amount: "1.23" });
    expect(result.cursor).toEqual({ stage: "events", after: "evt_payment" });
    const requested = new URL(
      String(http.mock.calls[0][0]),
    ).searchParams.getAll("types[]");
    expect(requested).toContain("invoice.payment_failed");
    expect(requested).not.toContain("balance.available");
  });
  it("authenticates unrelated webhooks before ignoring their payload shape", async () => {
    const webhookSecret = "fixture-webhook-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const raw = JSON.stringify(unrelated);
    const signature = createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${raw}`)
      .digest("hex");
    const adapter = stripe(vi.fn<typeof fetch>());
    expect(
      await adapter.webhook!(
        { ...input.credentials, webhookSecret },
        raw,
        new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` }),
      ),
    ).toEqual([]);
    await expect(
      adapter.webhook!(
        { ...input.credentials, webhookSecret },
        raw,
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: "webhook_timestamp_invalid" });
  });
  it("still rejects malformed supported payment objects", async () => {
    await expect(
      stripe(async () =>
        Response.json({
          data: [{ ...unrelated, type: "invoice.paid" }],
          has_more: false,
        }),
      ).collect!(input),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
  });
});

describe("GA4 quality metadata", () => {
  const flags = [
    { subjectToThresholding: true },
    { dataLossFromOtherRow: true },
    { samplingMetadatas: [{ samplesReadCount: "1", samplingSpaceSize: "10" }] },
  ];
  const complete = {
    subjectToThresholding: false,
    dataLossFromOtherRow: false,
    samplingMetadatas: [],
  };
  it.each(flags)(
    "preserves a daily limitation when the total is complete (%j)",
    async (metadata) => {
      for (const [daily, total] of [
        [metadata, complete],
        [complete, metadata],
      ]) {
        const http = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json({ timeZone: "UTC" }))
          .mockResolvedValueOnce(Response.json({ rows: [], metadata: daily }))
          .mockResolvedValueOnce(Response.json({ rows: [], metadata: total }));
        expect(await ga4(http).metric!(input, query)).toMatchObject({
          status: "partial",
          reason: expect.stringContaining("GA4 reports"),
        });
      }
    },
  );
  it.each(["signup-funnel", "retention"])(
    "checks every quality flag for %s",
    async (metric) => {
      for (const metadata of flags) {
        const report =
          metric === "signup-funnel"
            ? {
                funnelTable: {
                  metricHeaders: [{ name: "activeUsers" }],
                  rows: [],
                  metadata,
                },
              }
            : { rows: [], metadata };
        const http = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json({ timeZone: "UTC" }))
          .mockResolvedValueOnce(Response.json(report));
        expect(
          await ga4(http).metric!(input, { ...query, metric }),
        ).toMatchObject({
          status: "partial",
          reason: expect.stringContaining("GA4 reports"),
        });
      }
    },
  );
  it("does not treat an empty sampling list or false flags as partial", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ timeZone: "UTC" }))
      .mockResolvedValueOnce(Response.json({ rows: [], metadata: complete }))
      .mockResolvedValueOnce(Response.json({ rows: [], metadata: complete }));
    expect((await ga4(http).metric!(input, query)).status).toBe("available");
  });
});

describe("WorkOS replay coverage", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const start = (days: number) =>
    new Date(now.getTime() - days * 86400_000).toISOString();
  it.each([60, 100])(
    "keeps a %i-day replay's retention assessment across windows",
    async (days) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const http = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ data: [], list_metadata: { after: null } }),
        );
      const adapter = authSource("workos", http, []);
      let cursor = {};
      let completed = false;
      for (let page = 0; page < 5; page++) {
        const result = await adapter.collect!({
          ...input,
          from: start(days),
          until: now.toISOString(),
          cursor,
        });
        expect(result.coverage?.includes("expired")).toBe(days > 89);
        const target = new URL(String(http.mock.calls.at(-1)![0]));
        expect(
          Date.parse(target.searchParams.get("range_end")!) -
            Date.parse(target.searchParams.get("range_start")!),
        ).toBeLessThanOrEqual(29 * 86400_000);
        cursor = result.cursor;
        if (result.done) {
          completed = true;
          break;
        }
      }
      expect(completed).toBe(true);
      expect(http).toHaveBeenCalledTimes(days === 60 ? 3 : 4);
      // A normal subsequent live interval replaces any stale per-range warning.
      const current = await adapter.collect!({
        ...input,
        from: start(1),
        until: now.toISOString(),
      });
      expect(current.coverage).toContain("User-created events");
      expect(current.coverage).not.toContain("expired");
    },
  );
  it("finishes an entirely expired frozen range without an inverted provider request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const http = vi.fn<typeof fetch>();
    const page = await authSource("workos", http, []).collect!({
      ...input,
      from: start(100),
      until: start(95),
    });
    expect(page).toMatchObject({
      done: true,
      events: [],
      coverage: expect.stringContaining("expired"),
    });
    expect(http).not.toHaveBeenCalled();
  });
});

describe("PostHog selected report validation", () => {
  const supported = {
    id: 42,
    query: {
      kind: "TrendsQuery",
      series: [{ kind: "EventsNode", event: "$pageview", math: "dau" }],
    },
  };
  it("fetches only the selected insight regardless of catalog size", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(supported));
    const definition = await posthog(http).definition!(
      input.credentials,
      "123",
      "insight:42",
    );
    expect(definition).toMatchObject({
      id: "insight:42",
      shape: "series",
      group: "usage",
    });
    expect(http).toHaveBeenCalledTimes(1);
    expect(String(http.mock.calls[0][0])).toBe(
      "https://us.posthog.com/api/projects/123/insights/42/",
    );
  });
  it("rejects unsupported queries or mismatched identities without listing the catalog", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          ...supported,
          query: { kind: "HogQLQuery", query: "select 1" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ ...supported, id: 43 }));
    const adapter = posthog(http);
    expect(
      await adapter.definition!(input.credentials, "123", "insight:42"),
    ).toBeUndefined();
    await expect(
      adapter.definition!(input.credentials, "123", "insight:42"),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
    expect(
      await adapter.definition!(input.credentials, "123", "invalid"),
    ).toBeUndefined();
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("revalidates a selected insight if it changes before collection", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(supported))
      .mockResolvedValueOnce(
        Response.json({ ...supported, query: { kind: "HogQLQuery" } }),
      );
    const adapter = posthog(http);
    expect(
      await adapter.definition!(input.credentials, "123", "insight:42"),
    ).toBeDefined();
    expect(
      (await adapter.metric!(input, { ...query, metric: "insight:42" })).status,
    ).toBe("unsupported");
    expect(http).toHaveBeenCalledTimes(2);
  });
});
