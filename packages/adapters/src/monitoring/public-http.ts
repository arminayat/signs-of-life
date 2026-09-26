import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { assert } from "../../../core/src/model";
import type { Http } from "../http";
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only globally routable IPv6 unicast; deny mapped IPv4, local, multicast,
  // transition mechanisms and documentation networks conservatively.
  return (
    isIP(address) === 6 && /^[23]/i.test(address) && !/^200[12]:/i.test(address)
  );
}
export async function resolvePublic(host: string) {
  const results = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addresses = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  assert(
    addresses.length && addresses.every(publicAddress),
    "connector_private_network_forbidden",
    400,
  );
  return addresses;
}
export function publicConnectorHttp(
  http: Http,
  runtime: "node" | "cloudflare",
): Http {
  return async (input, init) => {
    const deadline = Date.now() + 20_000;
    const target = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    assert(
      target.protocol === "https:" &&
        !target.username &&
        !target.password &&
        (!target.port || target.port === "443"),
      "invalid_connector_url",
    );
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      resolvePublic(target.hostname),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(
          () => reject(new Error("connector_dns_timeout")),
          20_000,
        );
      }),
    ]).finally(() => clearTimeout(dnsTimer));
    const remaining = Math.max(1, deadline - Date.now());
    if (runtime === "cloudflare")
      return http(target, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(remaining),
      });
    // Pin the already-validated address on Node. TLS still verifies the original
    // hostname, so DNS rebinding cannot redirect credentials to private services.
    const { request } = await import("node:https");
    return new Promise<Response>((resolve, reject) => {
      const address = addresses[0];
      const req = request(
        target,
        {
          method: "GET",
          headers: Object.fromEntries(new Headers(init?.headers)),
          agent: false,
          family: isIP(address),
          servername: target.hostname,
          lookup: (_host, _options, callback) =>
            callback(null, address, isIP(address)),
        },
        (res) => {
          if ((res.statusCode || 500) >= 300 && (res.statusCode || 500) < 400) {
            res.destroy();
            reject(new Error("connector_redirect_forbidden"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 4_000_000) {
              res.destroy();
              reject(new Error("connector_response_too_large"));
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve(
              new Response(
                [204, 205].includes(res.statusCode || 0)
                  ? null
                  : Buffer.concat(chunks),
                {
                  status: res.statusCode,
                  headers: Object.fromEntries(
                    Object.entries(res.headers).filter(
                      ([, v]) => typeof v === "string",
                    ) as [string, string][],
                  ),
                },
              ),
            ),
          );
        },
      );
      const timer = setTimeout(
        () => req.destroy(new Error("connector_timeout")),
        remaining,
      );
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      req.end();
    });
  };
}
