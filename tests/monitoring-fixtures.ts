import type { Credentials, MonitorKind } from "../packages/core/src/monitoring";
export const fixtureCredentials: Record<MonitorKind, Credentials> = {
  stripe: {
    apiKey: "rk_test_fixture",
    accountId: "acct_fixture",
    environment: "sandbox",
  },
  polar: { apiKey: "fixture" },
  paddle: { apiKey: "fixture", accountId: "merchant", environment: "sandbox" },
  revenuecat: { apiKey: "fixture", environment: "production" },
  posthog: { apiKey: "fixture", region: "eu" },
  ga4: { accessToken: "fixture", propertyId: "123" },
  "better-auth": { url: "https://example.test/api/auth", apiKey: "fixture" },
  workos: {
    apiKey: "fixture",
    clientId: "client_fixture",
    environment: "staging",
  },
  clerk: { apiKey: "sk_test_fixture" },
  auth0: { domain: "fixture.eu.auth0.com", accessToken: "fixture" },
};
export const unwanted = {
  email: "never-store@example.test",
  name: "Never Store",
  address: { city: "Never Store City" },
  metadata: { secret: "never-store-metadata" },
};
export function catalogFixture(kind: MonitorKind, input: string) {
  switch (kind) {
    case "stripe":
      return { id: "acct_fixture", ...unwanted };
    case "polar":
      return {
        items: [{ id: "org1", name: "Organization" }],
        pagination: { max_page: 1 },
      };
    case "paddle":
      return { data: [], meta: { pagination: { has_more: false } } };
    case "revenuecat":
      return {
        items: input.endsWith("/projects?limit=100")
          ? [{ id: "proj1", name: "Project" }]
          : [{ id: "app1", name: "Application" }],
        next_page: null,
      };
    case "posthog":
      return {
        results: [{ id: 1, name: "Project", ...{ organization: unwanted } }],
        next: null,
      };
    case "ga4":
      return {
        name: "properties/123",
        displayName: "Property",
        timeZone: "Europe/Berlin",
        currencyCode: "EUR",
      };
    case "better-auth":
      return { version: 1, users: [], next: null };
    case "workos":
      return { data: [], list_metadata: { after: null } };
    case "clerk":
      return { id: "ins_1", name: "Instance" };
    case "auth0":
      return [];
  }
}
