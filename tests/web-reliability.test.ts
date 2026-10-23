import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import {
  calendarRange,
  validateCalendarRange,
} from "../packages/core/src/time";
import { ProjectOverview } from "../apps/web/src/monitor-overview";
import { ProjectsPage } from "../apps/web/src/projects";
import {
  invalidateActionQueries,
  type Dashboard,
  type Project,
} from "../apps/web/src/data";
import { metricPollInterval } from "../apps/web/src/metric-polling";
import { testDatabaseUrl } from "../scripts/test-database";

afterEach(() => vi.useRealTimers());
const dashboard = {
  projects: [],
  connections: [],
  sources: [],
  destinations: [],
  deliveries: [],
  metrics: [],
  projectDestinations: [],
  events: [],
} as Dashboard;
const project = { id: "fixture-project", timezone: "Europe/Berlin" } as Project;
function render(
  client: QueryClient,
  component: ReturnType<typeof createElement>,
) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, component),
    ),
  );
}

test.each([
  ["2026-10-22T22:30:00Z", "Europe/Berlin", "2026-10-23"],
  ["2026-10-23T02:00:00Z", "America/Los_Angeles", "2026-10-22"],
  ["2026-03-29T22:30:00Z", "Europe/Berlin", "2026-03-30"],
  ["2026-10-25T23:30:00Z", "Europe/Berlin", "2026-10-26"],
])("uses the project calendar at %s in %s", (instant, zone, today) => {
  const now = new Date(instant);
  const range = calendarRange(now, zone, 7);
  expect(range.to).toBe(today);
  expect((Date.parse(range.to) - Date.parse(range.from)) / 86400_000).toBe(6);
  expect(validateCalendarRange(range, now, zone)).toBe(true);
  expect(
    validateCalendarRange({ from: "2026-02-30", to: today }, now, zone),
  ).toBe(false);
  expect(validateCalendarRange(calendarRange(now, zone, 366), now, zone)).toBe(
    false,
  );
});

test("saved-view editing stays disabled until the saved layout loads, including failed reads", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element = createElement(ProjectOverview, { project, data: dashboard });
  const button = (html: string) =>
    html.match(/<button[^>]*>Configure views<\/button>/)?.[0];
  expect(button(render(client, element))).toMatch(/disabled/);
  client
    .getQueryCache()
    .find({ queryKey: ["dashboard", project.id, "monitoring"] })!
    .setState({ status: "error", error: new Error("request failed") });
  expect(button(render(client, element))).toMatch(/disabled/);
  client.setQueryData(["dashboard", project.id, "monitoring"], {
    states: [],
    views: [],
  });
  expect(button(render(client, element))).not.toMatch(/disabled/);
  client.clear();
});

test("workspace refresh failure preserves cached content and displays its last successful update", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["dashboard", "workspace"], dashboard, {
    updatedAt: Date.parse("2026-10-22T12:00:00Z"),
  });
  await expect(
    client.fetchQuery({
      queryKey: ["dashboard", "workspace"],
      queryFn: async () => {
        throw new Error("Service temporarily unavailable");
      },
    }),
  ).rejects.toThrow("Service temporarily unavailable");
  const html = render(client, createElement(ProjectsPage));
  expect(html).toContain("Service temporarily unavailable");
  expect(html).toContain("Showing saved data. Last updated");
  expect(html).toContain("Your projects");
  client.clear();
});

test("reconnecting discards only the previous grant's cached catalog", async () => {
  const client = new QueryClient();
  client.setQueryData(["catalog", "old"], {
    items: [{ id: "no-longer-accessible" }],
  });
  client.setQueryData(["catalog", "other"], {
    items: [{ id: "still-accessible" }],
  });
  await invalidateActionQueries(
    client,
    { id: "old" },
    { path: "/monitor/connections/stripe/credentials" },
  );
  expect(client.getQueryData(["catalog", "old"])).toBeUndefined();
  expect(client.getQueryData(["catalog", "other"])).toEqual({
    items: [{ id: "still-accessible" }],
  });
  client.clear();
});

test("report polling backs off completed/error results and remains fast while awaiting the first result", () => {
  expect(metricPollInterval(undefined)).toBe(15_000);
  expect(metricPollInterval({ result: null, error: null })).toBe(15_000);
  expect(metricPollInterval({ result: null, error: "permission_denied" })).toBe(
    300_000,
  );
  expect(
    metricPollInterval({
      result: { status: "available" } as never,
      error: null,
    }),
  ).toBe(300_000);
});

test("test tooling rejects installation/remote database URLs without exposing credentials", () => {
  expect(() =>
    testDatabaseUrl("postgres://secret:private@localhost/signs_of_life"),
  ).toThrow("Tests require a loopback PostgreSQL database");
  expect(() =>
    testDatabaseUrl("postgres://secret:private@example.com/app_test"),
  ).toThrow("loopback");
  expect(() =>
    testDatabaseUrl("postgres://audit@localhost/fixture_test?host=example.com"),
  ).toThrow("without URL query");
  expect(() =>
    testDatabaseUrl(
      "postgres://audit@localhost/fixture_test?database=production",
    ),
  ).toThrow("without URL query");
  expect(
    testDatabaseUrl("postgres://audit@127.0.0.1:55447/fixture_test"),
  ).toContain("fixture_test");
});
