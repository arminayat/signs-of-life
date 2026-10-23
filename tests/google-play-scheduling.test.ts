import { afterEach, expect, it, vi } from "vitest";
import { googlePlay } from "../packages/adapters/src/monitoring/google-play";
import type { CollectionInput } from "../packages/core/src/monitoring";

const input: CollectionInput = {
  credentials: { bucket: "pubsite_prod_rev_fixture", accessToken: "fixture" },
  resourceId: "com.example.app",
  environment: "production",
  from: "2025-01-01T00:00:00.000Z",
  until: "2026-01-02T00:00:00.000Z",
  cursor: {},
  historical: false,
};
const query = {
  metric: "native:installs",
  from: "2025-01-01",
  to: "2026-01-01",
  filters: {},
};
afterEach(() => vi.useRealTimers());

it("completes thirteen slow monthly reports within the lease using at most three readers", async () => {
  vi.useFakeTimers();
  let active = 0,
    maximum = 0;
  const started = Date.now();
  const http = vi.fn<typeof fetch>().mockImplementation(async (target) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 29_000));
    active--;
    const month = /_(\d{6})_country\.csv/.exec(
      decodeURIComponent(String(target)),
    )![1];
    const day = `${month.slice(0, 4)}-${month.slice(4)}-01`;
    return new Response(
      Buffer.from(
        `\uFEFFDate,Package Name,Country,Daily Device Installs\n${day},com.example.app,US,1`,
        "utf16le",
      ),
    );
  });
  const result = googlePlay(http).metric!(input, query);
  await vi.advanceTimersByTimeAsync(145_000);
  const report = await result;
  expect(http).toHaveBeenCalledTimes(13);
  expect(maximum).toBe(3);
  expect(active).toBe(0);
  expect(Date.now() - started).toBeLessThan(180_000);
  expect(report.points.filter((point) => point.value !== null)).toHaveLength(
    13,
  );
});

it("cancels concurrent report reads after a provider failure", async () => {
  let calls = 0,
    aborted = 0;
  const http = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_target, init) => {
      if (++calls === 1) return new Response(null, { status: 503 });
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => {
            aborted++;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
  await expect(googlePlay(http).metric!(input, query)).rejects.toMatchObject({
    code: "provider_http_503",
  });
  expect(http).toHaveBeenCalledTimes(3);
  expect(aborted).toBe(2);
});
