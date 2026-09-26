import { AppError, assert } from "../../../core/src/model";
import type {
  CollectionInput,
  CollectionPage,
  Observation,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
import { hashToken } from "../crypto";
import { auth0Host, headers, iso, object, request, string } from "./http";
export async function auth0Export(
  http: Http,
  input: CollectionInput,
): Promise<CollectionPage> {
  const { credentials: c, cursor } = input;
  if (
    !cursor.exportJob ||
    Date.now() - Number(cursor.exportStarted) > 23 * 3600_000
  ) {
    const job = object(
      await request(http, `${auth0Host(c)}/api/v2/jobs/users-exports`, {
        method: "POST",
        headers: { ...headers(c), "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "json",
          fields: [{ name: "user_id" }, { name: "created_at" }],
        }),
      }),
    );
    return {
      events: [],
      cursor: {
        ...cursor,
        exportJob: string(job.id),
        exportStarted: String(Date.now()),
        exportOffset: "0",
      },
      done: false,
      coverage:
        "Search limit reached at an identical timestamp. Recovering through a minimal-field Auth0 export; the provider requires a paid plan.",
    };
  }
  const job = object(
    await request(
      http,
      `${auth0Host(c)}/api/v2/jobs/${encodeURIComponent(cursor.exportJob)}`,
      { headers: headers(c) },
    ),
  );
  if (job.status === "pending" || job.status === "processing")
    return { events: [], cursor, done: false };
  assert(job.status === "completed", "auth0_export_failed", 502);
  const location = new URL(string(job.location));
  assert(
    location.protocol === "https:" &&
      !location.username &&
      !location.password &&
      !location.port &&
      (/^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(
        location.hostname,
      ) ||
        /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(location.hostname)),
    "auth0_export_location_unsupported",
    502,
  );
  // Presigned URL, no tenant credential forwarding, redirect following or disk file.
  const response = await http(location, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok && response.body, "auth0_export_unavailable", 502);
  const original = response.body.getReader(),
    first = await original.read();
  let stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.value) controller.enqueue(first.value);
      if (first.done) controller.close();
    },
    async pull(controller) {
      const part = await original.read();
      if (part.done) controller.close();
      else controller.enqueue(part.value);
    },
    cancel() {
      return original.cancel();
    },
  });
  if (first.value?.[0] === 31 && first.value?.[1] === 139)
    stream = stream.pipeThrough(
      new DecompressionStream("gzip") as unknown as ReadableWritablePair<
        Uint8Array,
        Uint8Array
      >,
    );
  const reader = stream.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    bytes = 0,
    matched = 0;
  const offset = Number(cursor.exportOffset || 0),
    events: Observation[] = [];
  const from = cursor.from || input.from,
    until = cursor.until || input.until;
  async function line(value: string) {
    if (!value.trim()) return;
    const row = object(JSON.parse(value)),
      at = iso(row.created_at);
    if (at < from || at > until) return;
    if (matched++ < offset) return;
    events.push({
      id: await hashToken(string(row.user_id)),
      occurredAt: at,
      resourceId: input.resourceId,
      environment: input.environment,
      kind: "signup",
    });
  }
  try {
    for (;;) {
      const part = await reader.read();
      if (part.value) {
        bytes += part.value.length;
        assert(bytes <= 128_000_000, "auth0_export_size_limit", 422);
        pending += decoder.decode(part.value, { stream: true });
      }
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        await line(pending.slice(0, end));
        pending = pending.slice(end + 1);
        if (events.length >= 200)
          return {
            events,
            cursor: { ...cursor, exportOffset: String(offset + events.length) },
            done: false,
          };
      }
      assert(pending.length < 16000, "auth0_export_row_invalid", 502);
      if (part.done) {
        await line(pending);
        break;
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("auth0_export_format_invalid", 502);
  } finally {
    await reader.cancel();
  }
  const pendingRanges: string[] = JSON.parse(cursor.pending || "[]"),
    nextFrom = pendingRanges.shift(),
    nextUntil = pendingRanges.shift();
  return {
    events,
    cursor:
      nextFrom && nextUntil
        ? {
            from: nextFrom,
            until: nextUntil,
            page: "0",
            pending: JSON.stringify(pendingRanges),
          }
        : {},
    done: !nextFrom,
    coverage:
      "Existing Auth0 user records, including search-limit recovery; deleted users cannot be reconstructed.",
  };
}
