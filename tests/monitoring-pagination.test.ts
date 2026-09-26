import { expect, it, vi } from "vitest";
import { monitorAdapter } from "../packages/adapters/src/monitoring";
import { fixtureCredentials, unwanted } from "./monitoring-fixtures";
import type { CollectionInput } from "../packages/core/src/monitoring";
const input: CollectionInput = {
  credentials: {},
  resourceId: "resource",
  environment: "production",
  from: "2026-01-01T00:00:00.000Z",
  until: "2026-02-01T00:00:00.000Z",
  cursor: {},
  historical: true,
};
it("reads every page of provider catalogs with native continuation tokens", async () => {
  const cases = [
    {
      kind: "polar" as const,
      c: fixtureCredentials.polar,
      pages: [
        { items: [{ id: "one", name: "One" }], pagination: { max_page: 2 } },
        { items: [{ id: "two", name: "Two" }], pagination: { max_page: 2 } },
      ],
      continuation: "page=2",
    },
    {
      kind: "posthog" as const,
      c: fixtureCredentials.posthog,
      pages: [
        {
          results: [{ id: 1, name: "One" }],
          next: "https://eu.posthog.com/api/projects/?offset=100",
        },
        { results: [{ id: 2, name: "Two" }], next: null },
      ],
      continuation: "offset=100",
    },
    {
      kind: "ga4" as const,
      c: { accessToken: "fixture" },
      pages: [
        {
          accountSummaries: [
            {
              displayName: "Account",
              propertySummaries: [
                { property: "properties/1", displayName: "One" },
              ],
            },
          ],
          nextPageToken: "next",
        },
        {
          accountSummaries: [
            {
              displayName: "Account",
              propertySummaries: [
                { property: "properties/2", displayName: "Two" },
              ],
            },
          ],
        },
      ],
      continuation: "pageToken=next",
    },
  ];
  for (const item of cases) {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(item.pages[0]))
      .mockResolvedValueOnce(Response.json(item.pages[1]));
    expect(
      await monitorAdapter(item.kind, http).catalog({ ...item.c }),
    ).toHaveLength(2);
    expect(String(http.mock.calls[1][0])).toContain(item.continuation);
  }
  const rc = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        items: [{ id: "proj", name: "Project" }],
        next_page: null,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        items: [{ id: "app1", name: "One" }],
        next_page: "/v2/projects/proj/apps?starting_after=app1",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ items: [{ id: "app2", name: "Two" }], next_page: null }),
    );
  expect(
    await monitorAdapter("revenuecat", rc).catalog({
      ...fixtureCredentials.revenuecat,
    }),
  ).toHaveLength(2);
  expect(String(rc.mock.calls[2][0])).toContain("starting_after=app1");
});
it("resumes Stripe and Paddle pages without losing their collection stage", async () => {
  const stripe = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        data: [
          {
            id: "ch_1",
            paid: true,
            invoice: null,
            created: Date.parse(input.from) / 1000,
            amount: 1,
            currency: "usd",
            livemode: false,
          },
        ],
        has_more: true,
      }),
    );
  const result = await monitorAdapter("stripe", stripe).collect!({
    ...input,
    credentials: fixtureCredentials.stripe,
  });
  expect(result.cursor).toEqual({ stage: "charges", after: "ch_1" });
  expect(result.done).toBe(false);
  const paddle = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        data: [{ id: "txn_1", status: "draft", created_at: input.from }],
        meta: {
          pagination: {
            has_more: true,
            next: "https://sandbox-api.paddle.com/transactions?after=txn_1",
          },
        },
      }),
    );
  const page = await monitorAdapter("paddle", paddle).collect!({
    ...input,
    credentials: fixtureCredentials.paddle,
  });
  expect(page.cursor).toEqual({ stage: "transactions", after: "txn_1" });
  expect(page.events).toEqual([]);
});
it("streams paginated Auth0 exports without forwarding tenant credentials or retaining profiles", async () => {
  const data = Array.from({ length: 405 }, (_, i) =>
    JSON.stringify({
      user_id: `auth0|${i}`,
      created_at: input.from,
      ...unwanted,
    }),
  ).join("\n");
  const http = vi
    .fn<typeof fetch>()
    .mockImplementation(async (target) =>
      String(target).includes("/api/v2/jobs/")
        ? Response.json({
            status: "completed",
            location:
              "https://fixture.s3.amazonaws.com/export?signature=fixture",
          })
        : new Response(data),
    );
  const adapter = monitorAdapter("auth0", http);
  let cursor = {
      exportJob: "job1",
      exportStarted: String(Date.now()),
      exportOffset: "0",
    },
    count = 0;
  for (let i = 0; i < 3; i++) {
    const page = await adapter.collect!({
      ...input,
      credentials: fixtureCredentials.auth0,
      cursor,
    });
    count += page.events.length;
    expect(JSON.stringify(page.events)).not.toMatch(/never-store|auth0\|/);
    if (page.done) break;
    cursor = page.cursor as typeof cursor;
  }
  expect(count).toBe(405);
  for (const [target, init] of http.mock.calls)
    if (String(target).includes("amazonaws.com")) {
      expect(init?.headers).toBeUndefined();
      expect(init?.redirect).toBe("error");
    }
});
