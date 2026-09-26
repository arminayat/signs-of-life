import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:dns/promises", () => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
import { resolve4, resolve6 } from "node:dns/promises";
import { publicConnectorHttp } from "../packages/adapters/src/monitoring/public-http";
import { request } from "../packages/adapters/src/monitoring/http";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("blocks DNS resolving to any private destination before forwarding a credential", async () => {
  vi.mocked(resolve4).mockResolvedValue(["8.8.8.8", "127.0.0.1"] as never);
  vi.mocked(resolve6).mockRejectedValue(new Error("no AAAA"));
  const http = vi.fn<typeof fetch>();
  await expect(
    publicConnectorHttp(http, "cloudflare")(
      "https://example.test/api/auth/signs-of-life/v1/users",
      { headers: { Authorization: "Bearer fixture" } },
    ),
  ).rejects.toMatchObject({ code: "connector_private_network_forbidden" });
  expect(http).not.toHaveBeenCalled();
});
it("disables redirects and bounds decoded response size", async () => {
  vi.mocked(resolve4).mockResolvedValue(["8.8.8.8"] as never);
  vi.mocked(resolve6).mockResolvedValue([] as never);
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("x".repeat(4_000_001)));
  await expect(
    request(publicConnectorHttp(http, "cloudflare"), "https://example.test", {
      headers: { Authorization: "Bearer fixture" },
    }),
  ).rejects.toMatchObject({ code: "provider_response_too_large" });
  expect(http.mock.calls[0][1]?.redirect).toBe("error");
  expect(http.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});
it("bounds DNS resolution as well as the HTTP request", async () => {
  vi.useFakeTimers();
  vi.mocked(resolve4).mockImplementation(() => new Promise(() => {}));
  vi.mocked(resolve6).mockImplementation(() => new Promise(() => {}));
  const http = vi.fn<typeof fetch>();
  const result = expect(
    publicConnectorHttp(http, "cloudflare")("https://example.test"),
  ).rejects.toThrow("connector_dns_timeout");
  await vi.advanceTimersByTimeAsync(20_000);
  await result;
  expect(http).not.toHaveBeenCalled();
});
it("honors Retry-After when a provider is temporarily unavailable", async () => {
  await expect(
    request(
      async () =>
        new Response(null, {
          status: 503,
          headers: { "Retry-After": "120" },
        }),
      "https://example.test",
    ),
  ).rejects.toMatchObject({
    code: "provider_http_503",
    retryAfterSeconds: 120,
  });
});
