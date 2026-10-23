import { AppError, assert } from "../../../core/src/model";
import type { Http } from "../http";
import { failure } from "./http";

export const googlePlayReportLimit = 16_000_000;

// Play bulk reports are UTF-16. A strict decoder prevents corrupt input from
// silently becoming a valid-looking zero or a different package/country.
export async function googlePlayReport(
  http: Http,
  target: URL,
  headers: HeadersInit,
  budget: { remaining: number },
  signal?: AbortSignal,
): Promise<string | null> {
  let response: Response;
  try {
    response = await http(target, {
      headers,
      redirect: "manual",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
  } catch {
    throw failure("provider_unreachable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) return null;
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
  assert(response.body, "google_play_report_format_changed", 502);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      budget.remaining -= part.value.byteLength;
      assert(
        size <= googlePlayReportLimit && budget.remaining >= 0,
        "provider_response_too_large",
        502,
      );
      parts.push(part.value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw failure("provider_unreachable");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
  const littleEndian = bytes[0] === 0xff && bytes[1] === 0xfe;
  assert(
    size % 2 === 0 && (bigEndian || littleEndian || bytes[1] === 0),
    "google_play_report_encoding_invalid",
    502,
  );
  try {
    return new TextDecoder(bigEndian ? "utf-16be" : "utf-16le", {
      fatal: true,
    }).decode(bytes);
  } catch {
    throw failure("google_play_report_encoding_invalid");
  }
}

// CSV cells may contain commas, quotes and line breaks. Parse incrementally by
// row, allowing new provider columns without retaining a second complete copy.
function* csvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let count = 0;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (quoted) {
      assert(char !== undefined, "google_play_report_format_changed", 502);
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === '"') {
      assert(!cell && !closed, "google_play_report_format_changed", 502);
      quoted = true;
    } else if (
      char === "," ||
      char === "\n" ||
      char === "\r" ||
      char === undefined
    ) {
      row.push(cell);
      cell = "";
      closed = false;
      if (char !== ",") {
        if (row.some((value) => value !== "")) {
          assert(++count <= 250_000, "provider_response_too_large", 502);
          yield row;
        }
        row = [];
        if (char === "\r" && text[index + 1] === "\n") index++;
      }
    } else {
      assert(!closed, "google_play_report_format_changed", 502);
      cell += char;
    }
    assert(
      cell.length <= 16_000 && row.length <= 200,
      "provider_response_too_large",
      502,
    );
  }
}

export function validGooglePlayDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseGooglePlayReport(
  text: string,
  packageName: string,
  month: string,
  column: string,
  rating: boolean,
  country?: string,
): Map<string, string | null> {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const first = rows.next();
  assert(!first.done, "google_play_report_format_changed", 502);
  const columns = first.value;
  const indices = ["Date", "Package Name", "Country", column].map((name) =>
    columns.indexOf(name),
  );
  assert(
    indices.every((index) => index >= 0) &&
      new Set(columns).size === columns.length,
    "google_play_report_format_changed",
    502,
  );
  const result = new Map<string, string | null>();
  const seen = new Set<string>();
  for (const row of rows) {
    assert(
      row.length === columns.length,
      "google_play_report_row_invalid",
      502,
    );
    const [day, app, region, value] = indices.map((index) => row[index]);
    assert(
      validGooglePlayDay(day) &&
        day.replaceAll("-", "").startsWith(month) &&
        app === packageName &&
        region.length <= 100 &&
        !seen.has(`${day}:${region}`),
      "google_play_report_row_invalid",
      502,
    );
    seen.add(`${day}:${region}`);
    assert(
      value === "" ||
        (rating
          ? /^\d+(\.\d+)?$/.test(value) &&
            Number(value) >= 1 &&
            Number(value) <= 5
          : /^\d+$/.test(value) && value.length <= 20),
      "google_play_report_row_invalid",
      502,
    );
    if (country && region !== country) continue;
    if (rating) {
      result.set(day, value || null);
    } else if (value === "" || result.get(day) === null) {
      result.set(day, null);
    } else {
      result.set(day, String(BigInt(result.get(day) ?? "0") + BigInt(value)));
    }
  }
  return result;
}
