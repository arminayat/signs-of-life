import { importPKCS8, SignJWT } from "jose";
import type { DownloadMetric, ReportSource } from "../../core/src/model";
import { AppError } from "../../core/src/model";
import { boundedText, type Http } from "./http";
const initial = new Set(["1", "1E", "1EP", "1EU", "1F", "1T", "F1"]);
const redownload = new Set(["3", "3F"]);
export function parseSalesReport(report: string): DownloadMetric[] {
  const lines = report.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headers = lines.shift()?.split("\t") ?? [];
  const indices = Object.fromEntries(
    headers.map((header, index) => [header.trim(), index]),
  );
  for (const column of [
    "Apple Identifier",
    "Title",
    "Product Type Identifier",
    "Units",
  ])
    if (!(column in indices))
      throw new AppError("apple_report_format_changed", 502);
  const apps = new Map<string, DownloadMetric>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length !== headers.length)
      throw new AppError("apple_report_row_invalid", 502);
    const type = fields[indices["Product Type Identifier"]].trim();
    if (!initial.has(type) && !redownload.has(type)) continue;
    const appId = fields[indices["Apple Identifier"]].trim();
    const units = Number(fields[indices.Units]);
    if (!/^\d+$/.test(appId) || !Number.isSafeInteger(units))
      throw new AppError("apple_report_row_invalid", 502);
    const item = apps.get(appId) ?? {
      appId,
      title: fields[indices.Title].slice(0, 120),
      downloads: 0,
      redownloads: 0,
    };
    if (units > 0) {
      if (initial.has(type)) item.downloads += units;
      else item.redownloads += units;
    }
    apps.set(appId, item);
  }
  return [...apps.values()];
}
export function appleSource(http: Http = fetch): ReportSource {
  return {
    async report(credentials, date) {
      const key = await importPKCS8(credentials.privateKey, "ES256");
      const token = await new SignJWT({})
        .setProtectedHeader({
          alg: "ES256",
          kid: credentials.keyId,
          typ: "JWT",
        })
        .setIssuer(credentials.issuerId)
        .setAudience("appstoreconnect-v1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(key);
      const url = new URL(
        "https://api.appstoreconnect.apple.com/v1/salesReports",
      );
      url.search = new URLSearchParams({
        "filter[frequency]": "DAILY",
        "filter[reportDate]": date,
        "filter[reportSubType]": "SUMMARY",
        "filter[reportType]": "SALES",
        "filter[vendorNumber]": credentials.vendorNumber,
        "filter[version]": "1_0",
      }).toString();
      const response = await http(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/a-gzip",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(`apple_http_${response.status}`, 502);
      }
      if (!response.body) throw new AppError("apple_empty_report", 502);
      // Sales report payloads are gzip files, independent of HTTP content encoding.
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return parseSalesReport(
        await boundedText(new Response(stream), 32_000_000),
      );
    },
  };
}
