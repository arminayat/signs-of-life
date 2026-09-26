import { AppError, assert } from "../../../core/src/model";
import type {
  Credentials,
  MetricQuery,
  MetricResult,
  ProviderFailure,
} from "../../../core/src/monitoring";
import { boundedText, type Http } from "../http";
export type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  assert(
    !!value && typeof value === "object" && !Array.isArray(value),
    "provider_response_invalid",
    502,
  );
  return value as ObjectValue;
}
export function array(value: unknown): unknown[] {
  assert(Array.isArray(value), "provider_response_invalid", 502);
  return value;
}
export function string(value: unknown): string {
  assert(
    typeof value === "string" && value.length > 0 && value.length < 2000,
    "provider_response_invalid",
    502,
  );
  return value;
}
export function number(value: unknown): number {
  assert(
    typeof value === "number" && Number.isFinite(value),
    "provider_response_invalid",
    502,
  );
  return value;
}
export function decimal(value: unknown): string {
  let text = typeof value === "number" ? String(number(value)) : string(value);
  const scientific = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (scientific) {
    const exponent = Number(scientific[4]);
    assert(
      Number.isSafeInteger(exponent) && Math.abs(exponent) <= 1000,
      "provider_metric_invalid",
      502,
    );
    const digits = scientific[2] + (scientific[3] || "");
    const point = scientific[2].length + exponent;
    text =
      scientific[1] +
      (point <= 0
        ? "0." + "0".repeat(-point) + digits
        : point >= digits.length
          ? digits + "0".repeat(point - digits.length)
          : digits.slice(0, point) + "." + digits.slice(point));
  }
  assert(/^-?\d+(\.\d+)?$/.test(text), "provider_metric_invalid", 502);
  return text;
}
export function iso(value: unknown): string {
  const date = new Date(typeof value === "number" ? value : string(value));
  assert(Number.isFinite(date.getTime()), "provider_date_invalid", 502);
  return date.toISOString();
}
export function token(c: Credentials) {
  return c.accessToken || c.apiKey;
}
export function headers(c: Credentials): HeadersInit {
  assert(token(c), "provider_credentials_missing");
  return { Authorization: `Bearer ${token(c)}` };
}
export function failure(
  code: string,
  status = 502,
  retryAfterSeconds?: number,
): ProviderFailure {
  return Object.assign(new AppError(code, status), { retryAfterSeconds });
}
export async function request(
  http: Http,
  url: string | URL,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await http(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw failure("provider_unreachable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    const after = response.headers.get("retry-after");
    const seconds = after
      ? Number(after) || Math.ceil((Date.parse(after) - Date.now()) / 1000)
      : 60;
    throw failure(
      response.status === 401
        ? "provider_reconnect_required"
        : response.status === 403
          ? "provider_permission_denied"
          : `provider_http_${response.status}`,
      response.status === 429 ? 429 : 502,
      response.status === 429 || response.status === 503
        ? Math.min(86400, Math.max(1, seconds || 60))
        : undefined,
    );
  }
  try {
    return JSON.parse(await boundedText(response, 4_000_000)) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw failure("provider_response_invalid");
  }
}
export function url(
  base: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const value = new URL(path, base);
  for (const [key, entry] of Object.entries(params))
    if (entry !== undefined) value.searchParams.set(key, String(entry));
  return value;
}
export function unavailable(query: MetricQuery, reason: string): MetricResult {
  return {
    shape: "series",
    unit: "count",
    timezone: "UTC",
    definition: query.metric,
    status: "unsupported",
    reason,
    points: [],
    fetchedAt: new Date().toISOString(),
  };
}
export function metricBase(definition: string, unit = "count"): MetricResult {
  return {
    shape: "series",
    unit,
    timezone: "UTC",
    definition,
    status: "available",
    points: [],
    fetchedAt: new Date().toISOString(),
  };
}
export function posthogHost(c: Credentials) {
  assert(
    !c.region || ["us", "eu"].includes(c.region),
    "invalid_posthog_region",
  );
  return `https://${c.region || "us"}.posthog.com`;
}
export function auth0Host(c: Credentials) {
  assert(
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.auth0\.com$/.test(c.domain ?? ""),
    "invalid_auth0_tenant_domain",
  );
  return `https://${c.domain}`;
}
export function connectorUrl(c: Credentials, allowedHosts: string[]) {
  let value: URL;
  try {
    value = new URL(c.url);
  } catch {
    throw new AppError("invalid_connector_url");
  }
  assert(
    value.protocol === "https:" &&
      !value.username &&
      !value.password &&
      !value.search &&
      !value.hash &&
      (!value.port || value.port === "443"),
    "invalid_connector_url",
  );
  assert(
    allowedHosts.includes(value.hostname) &&
      !/^(localhost|.*\.local|.*\.internal|[\d.]+|\[.*\])$/.test(
        value.hostname,
      ),
    "connector_host_not_allowed",
  );
  value.pathname = `${value.pathname.replace(/\/$/, "")}/signs-of-life/v1/users`;
  return value;
}
// Do not follow provider pagination URLs with credentials. Only extract their cursor.
export function nextParameter(next: unknown, base: string, parameter: string) {
  if (next == null) return undefined;
  const value = new URL(string(next), base);
  assert(
    value.origin === new URL(base).origin,
    "provider_pagination_invalid",
    502,
  );
  return value.searchParams.get(parameter) ?? undefined;
}
