import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { monitorAdapter } from "../packages/adapters/src/monitoring";
import {
  monitorKinds,
  type CollectionInput,
} from "../packages/core/src/monitoring";
import {
  catalogFixture,
  fixtureCredentials,
  unwanted,
} from "./monitoring-fixtures";
import {
  minorAmount,
  verifyWebhook,
} from "../packages/adapters/src/monitoring/billing-common";
import { publicAddress } from "../packages/adapters/src/monitoring/public-http";
import { connectorUrl } from "../packages/adapters/src/monitoring/http";
import { normalizeChart } from "../packages/adapters/src/monitoring/revenuecat";
const input: CollectionInput = {
  credentials: {},
  resourceId: "resource",
  environment: "production",
  from: "2026-01-01T00:00:00.000Z",
  until: "2026-02-01T00:00:00.000Z",
  cursor: {},
  historical: true,
};
describe.each(monitorKinds)("%s adapter contract", (kind) => {
  it("validates credentials and returns only resource metadata", async () => {
    const c = { ...fixtureCredentials[kind] };
    const http: typeof fetch = async (u) =>
      Response.json(catalogFixture(kind, String(u)));
    const catalog = await monitorAdapter(kind, http, ["example.test"]).catalog(
      c,
    );
    expect(catalog.length).toBeGreaterThan(0);
    expect(JSON.stringify(catalog)).not.toContain("never-store");
  });
  it.each([401, 403, 429])(
    "sanitizes credential/permission/rate failures (%s)",
    async (status) => {
      const adapter = monitorAdapter(
        kind,
        async () =>
          Response.json(unwanted, {
            status,
            headers: { "retry-after": "121" },
          }),
        ["example.test"],
      );
      await expect(
        adapter.catalog({ ...fixtureCredentials[kind] }),
      ).rejects.toMatchObject({
        code:
          status === 401
            ? "provider_reconnect_required"
            : status === 403
              ? "provider_permission_denied"
              : "provider_http_429",
        ...(status === 429 ? { retryAfterSeconds: 121 } : {}),
      });
    },
  );
  it("rejects malformed provider responses without retaining the response", async () => {
    const adapter = monitorAdapter(kind, async () => Response.json(null), [
      "example.test",
    ]);
    await expect(
      adapter.catalog({ ...fixtureCredentials[kind] }),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
  });
});
it("strips profiles and paginates Clerk user history", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        Array.from({ length: 200 }, (_, i) => ({
          id: `user${i}`,
          created_at: Date.parse(input.from),
          ...unwanted,
        })),
      ),
    )
    .mockResolvedValueOnce(
      Response.json([
        { id: "last", created_at: Date.parse(input.from), ...unwanted },
      ]),
    );
  const adapter = monitorAdapter("clerk", http),
    first = await adapter.collect!({
      ...input,
      credentials: fixtureCredentials.clerk,
    });
  expect(first.done).toBe(false);
  expect(first.cursor.offset).toBe("200");
  expect(JSON.stringify(first)).not.toContain("never-store");
  const second = await adapter.collect!({
    ...input,
    credentials: fixtureCredentials.clerk,
    cursor: first.cursor,
  });
  expect(second.events).toHaveLength(1);
  expect(second.done).toBe(true);
  expect(String(http.mock.calls[1][0])).toContain("offset=200");
});
it("bisects Auth0 search before the 1000-record cap, with export recovery for equal timestamps", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ total: 1000, users: [] }))
    .mockResolvedValueOnce(Response.json({ total: 1000, users: [] }))
    .mockResolvedValueOnce(Response.json({ id: "job_1" }));
  const adapter = monitorAdapter("auth0", http);
  const split = await adapter.collect!({
    ...input,
    credentials: fixtureCredentials.auth0,
  });
  expect(split.done).toBe(false);
  expect(Date.parse(split.cursor.until)).toBeLessThan(Date.parse(input.until));
  const exported = await adapter.collect!({
    ...input,
    credentials: fixtureCredentials.auth0,
    cursor: { from: input.from, until: input.from },
  });
  expect(exported.done).toBe(false);
  expect(exported.cursor.exportJob).toBe("job_1");
  expect(JSON.parse(String(http.mock.calls[2][1]?.body))).toEqual({
    format: "json",
    fields: [{ name: "user_id" }, { name: "created_at" }],
  });
});
it("keeps WorkOS replay windows below 30 days and resumes the next window", async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ data: [], list_metadata: { after: null } }),
    );
  const until = new Date().toISOString(),
    from = new Date(Date.now() - 60 * 86400_000).toISOString();
  const result = await monitorAdapter("workos", http).collect!({
    ...input,
    from,
    until,
    historical: false,
    credentials: fixtureCredentials.workos,
  });
  expect(result.done).toBe(false);
  expect(result.cursor.windowStart).toBeTruthy();
  const url = new URL(String(http.mock.calls[0][0]));
  expect(
    Date.parse(url.searchParams.get("range_end")!) -
      Date.parse(url.searchParams.get("range_start")!),
  ).toBeLessThan(30 * 86400_000);
});
it("preserves monetary precision and currency exponents", () => {
  expect(minorAmount("9007199254740993", "USD")).toBe("90071992547409.93");
  expect(minorAmount(500, "JPY")).toBe("500");
  expect(minorAmount(500, "KWD")).toBe("0.500");
  expect(() => minorAmount(Number.MAX_SAFE_INTEGER + 1, "USD")).toThrow();
});
it("verifies signed Stripe events before parsing and rejects replay-aged signatures", async () => {
  const secret = "whsec_fixture",
    timestamp = String(Math.floor(Date.now() / 1000)),
    raw = JSON.stringify({ type: "unhandled", ...unwanted });
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  await expect(
    verifyWebhook(
      "stripe",
      { webhookSecret: secret },
      raw,
      new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` }),
    ),
  ).resolves.toBeDefined();
  await expect(
    verifyWebhook(
      "stripe",
      { webhookSecret: secret },
      raw + " ",
      new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` }),
    ),
  ).rejects.toMatchObject({ code: "webhook_signature_invalid" });
  await expect(
    verifyWebhook(
      "stripe",
      { webhookSecret: secret },
      raw,
      new Headers({ "stripe-signature": "t=1,v1=invalid" }),
    ),
  ).rejects.toMatchObject({ code: "webhook_timestamp_invalid" });
});
it("supports both Polar signing schemes, Paddle HMAC, and authenticated RevenueCat", async () => {
  const timestamp = String(Math.floor(Date.now() / 1000)),
    raw = "{}",
    secret = "whsec_" + Buffer.alloc(32, 1).toString("base64");
  for (const key of [
    Buffer.from(secret),
    Buffer.from(secret.slice(6), "base64"),
  ]) {
    const signature = createHmac("sha256", key)
      .update(`evt.${timestamp}.${raw}`)
      .digest("base64");
    await expect(
      verifyWebhook(
        "polar",
        { webhookSecret: secret },
        raw,
        new Headers({
          "webhook-id": "evt",
          "webhook-timestamp": timestamp,
          "webhook-signature": `v1,${signature}`,
        }),
      ),
    ).resolves.toEqual({});
  }
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}:${raw}`)
    .digest("hex");
  await expect(
    verifyWebhook(
      "paddle",
      { webhookSecret: secret },
      raw,
      new Headers({ "paddle-signature": `ts=${timestamp};h1=${signature}` }),
    ),
  ).resolves.toEqual({});
  await expect(
    verifyWebhook(
      "revenuecat",
      { webhookSecret: secret },
      raw,
      new Headers({ authorization: secret }),
    ),
  ).resolves.toEqual({});
  await expect(
    verifyWebhook("revenuecat", { webhookSecret: secret }, raw, new Headers()),
  ).rejects.toThrow();
});
it("keeps RevenueCat cohort-size metadata and null versus zero", () => {
  const result = normalizeChart(
    {
      yaxis: "%",
      periods: [
        { display_name: "New subscriptions", unit: "#", scale: "absolute" },
        { display_name: "Month 0", unit: "%", scale: "percentage" },
      ],
      values: [
        { cohort: "2026-01", period: 0, value: 50 },
        { cohort: "2026-01", period: 1, value: 0 },
        { cohort: "2026-02", period: 0, value: null },
      ],
    },
    "subscription_retention",
  );
  expect(result.columns?.[0]).toContain("New subscriptions (#");
  expect(result.rows?.[0].values).toEqual(["50", "0"]);
  expect(result.rows?.[1].values).toEqual([null, null]);
});
it("rejects local, ambiguous and unapproved connector destinations", () => {
  for (const address of [
    "127.0.0.1",
    "169.254.169.254",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    expect(publicAddress(address), address).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
  for (const target of [
    "http://example.test",
    "https://user:password@example.test",
    "https://127.0.0.1",
    "https://example.test:444",
    "https://evil.test",
  ])
    expect(() => connectorUrl({ url: target }, ["example.test"])).toThrow();
});
