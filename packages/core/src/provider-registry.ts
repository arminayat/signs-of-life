import type { EventKind, MonitorKind } from "./monitoring";
export type CredentialField = {
  id: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  multiline?: boolean;
  placeholder?: string;
};
export type ProviderDefinition = {
  id: MonitorKind;
  name: string;
  group: "growth" | "revenue" | "usage";
  resource: string;
  oauth: boolean;
  events: readonly EventKind[];
  fields: CredentialField[];
  guidance: string;
  docs: string;
};
const key: CredentialField = { id: "apiKey", label: "API key", secret: true };
const webhook: CredentialField = {
  id: "webhookSecret",
  label: "Webhook signing secret",
  secret: true,
  optional: true,
};
const billing: readonly EventKind[] = [
  "payment",
  "renewal",
  "refund",
  "cancellation",
  "payment_failed",
];
export const providers: ProviderDefinition[] = [
  {
    id: "stripe",
    name: "Stripe",
    group: "revenue",
    resource: "Stripe account",
    oauth: true,
    events: billing,
    fields: [key, webhook],
    guidance:
      "Use a restricted key with read access to Account, Events, Charges, Refunds, Invoices, and Subscriptions. MRR and churn are not available through this connection.",
    docs: "https://docs.stripe.com/stripe-apps/api-authentication/oauth",
  },
  {
    id: "polar",
    name: "Polar",
    group: "revenue",
    resource: "Organization",
    oauth: true,
    events: billing,
    fields: [key, webhook],
    guidance:
      "Organization token: organizations:read, orders:read, refunds:read, subscriptions:read, metrics:read. Configure billing webhooks for immediate lifecycle alerts.",
    docs: "https://polar.sh/docs/integrate/oauth2/connect",
  },
  {
    id: "paddle",
    name: "Paddle",
    group: "revenue",
    resource: "Paddle account",
    oauth: false,
    events: billing,
    fields: [
      key,
      { id: "accountId", label: "Paddle account ID" },
      {
        id: "environment",
        label: "Environment",
        placeholder: "production or sandbox",
      },
      webhook,
    ],
    guidance:
      "Read access to transactions, subscriptions, adjustments, notifications and metrics. The metrics.read permission is required for native charts. Use signed webhooks for lifecycle alerts.",
    docs: "https://developer.paddle.com/changelog/2026/metrics-api/",
  },
  {
    id: "revenuecat",
    name: "RevenueCat",
    group: "revenue",
    resource: "App",
    oauth: false,
    events: billing,
    fields: [
      key,
      {
        id: "environment",
        label: "Environment",
        placeholder: "production or sandbox",
      },
      { ...webhook, label: "Webhook Authorization header secret" },
    ],
    guidance:
      "Use a v2 secret key with project, app, subscription and Charts & Metrics read access. Webhooks require a supported RevenueCat plan (documented as Pro).",
    docs: "https://www.revenuecat.com/docs/api-v2",
  },
  {
    id: "posthog",
    name: "PostHog",
    group: "usage",
    resource: "Project",
    oauth: true,
    events: [],
    fields: [key, { id: "region", label: "Region", placeholder: "us or eu" }],
    guidance:
      "Personal key scopes: organization:read, project:read, insight:read, query:read. Only aggregate trends, funnels and retention are imported; no people, recordings or arbitrary SQL.",
    docs: "https://posthog.com/docs/api",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    group: "usage",
    resource: "Property",
    oauth: true,
    events: [],
    fields: [
      {
        id: "serviceAccount",
        label: "Service account JSON",
        secret: true,
        multiline: true,
      },
      { id: "propertyId", label: "Property ID" },
    ],
    guidance:
      "Prefer Google authorization with analytics.readonly. For service accounts, grant this account Viewer access to the property. Existing analytics instrumentation is required.",
    docs: "https://developers.google.com/analytics/devguides/reporting/data/v1",
  },
  {
    id: "better-auth",
    name: "Better Auth",
    group: "growth",
    resource: "Application",
    oauth: false,
    events: ["signup"],
    fields: [
      {
        id: "url",
        label: "Auth base URL",
        placeholder: "https://example.com/api/auth",
      },
      { id: "apiKey", label: "Connector token", secret: true },
    ],
    guidance:
      "Install the Signs of Life read-only server connector. No signup hooks, customer database migrations or browser SDK are needed.",
    docs: "https://better-auth.com/docs/concepts/plugins",
  },
  {
    id: "workos",
    name: "WorkOS",
    group: "growth",
    resource: "Environment",
    oauth: false,
    events: ["signup"],
    fields: [
      key,
      { id: "clientId", label: "WorkOS client ID" },
      {
        id: "environment",
        label: "Environment",
        placeholder: "production or staging",
      },
    ],
    guidance:
      "Use a WorkOS environment API key. This credential can have broader privileges than monitoring; Signs of Life only reads users and user.created events. Event history is limited to 90 days.",
    docs: "https://workos.com/docs/events/data-syncing/events-api",
  },
  {
    id: "clerk",
    name: "Clerk",
    group: "growth",
    resource: "Instance",
    oauth: false,
    events: ["signup"],
    fields: [{ ...key, label: "Backend secret key" }],
    guidance:
      "Use the instance backend secret, not the publishable key. This is a privileged credential; Signs of Life only reads users. Historical results exclude deleted accounts.",
    docs: "https://clerk.com/docs/reference/backend/user/get-user-list",
  },
  {
    id: "auth0",
    name: "Auth0",
    group: "growth",
    resource: "Tenant",
    oauth: false,
    events: ["signup"],
    fields: [
      {
        id: "domain",
        label: "Auth0 tenant domain",
        placeholder: "tenant.eu.auth0.com",
      },
      { id: "clientId", label: "Machine-to-machine client ID" },
      { id: "clientSecret", label: "Client secret", secret: true },
    ],
    guidance:
      "Authorize the Management API with read:users. User creation is tenant-wide, not application-specific. Historical results exclude deleted accounts. Dense imports can require Auth0 bulk export, which is unavailable on the Free plan.",
    docs: "https://auth0.com/docs/manage-users/user-search/retrieve-users-with-get-users-endpoint",
  },
];
export function providerDefinition(kind: MonitorKind) {
  return providers.find((p) => p.id === kind)!;
}
