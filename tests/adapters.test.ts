import { describe, expect, it, vi } from "vitest";
import { parseSalesReport } from "../packages/adapters/src/apple-source";
import { supabaseSource } from "../packages/adapters/src/supabase-source";
import { secretBox } from "../packages/adapters/src/crypto";
import {
  resendTransport,
  telegramChannel,
} from "../packages/adapters/src/channels";
import { dailyReady, reportingDates } from "../packages/core/src/time";
const headers = "Apple Identifier\tTitle\tProduct Type Identifier\tUnits";
describe("source normalization", () => {
  it("separates initial downloads and redownloads and ignores non-download products and refunds", () => {
    const report =
      headers +
      "\n" +
      [
        "1\tExample\t1\t4",
        "1\tExample\tF1\t2",
        "1\tExample\t3\t3",
        "1\tExample\t3F\t1",
        "1\tExample\t7\t40",
        "1\tExample\tIA1\t70",
        "1\tExample\t1-B\t10",
        "1\tExample\t1\t-2",
      ].join("\n");
    expect(parseSalesReport(report)).toEqual([
      { appId: "1", title: "Example", downloads: 6, redownloads: 4 },
    ]);
  });
  it("rejects malformed reports instead of reporting zero downloads", () => {
    expect(() => parseSalesReport("unknown\tformat")).toThrow();
    expect(() => parseSalesReport(`${headers}\n1\tExample\t1\tnope`)).toThrow();
  });
  it("only queries the read-only endpoint and never selects monitored emails", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            created_at: "2026-09-10 10:00:00.123456+00",
            provider: "email",
            is_anonymous: false,
          },
        ]),
      );
    const result = await supabaseSource(http).collect(
      "token",
      "abc",
      {
        at: "2026-09-10T00:00:00Z",
        id: "00000000-0000-0000-0000-000000000000",
      },
      "2026-09-11T00:00:00Z",
    );
    const [url, init] = http.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(url).toBe(
      "https://api.supabase.com/v1/projects/abc/database/query/read-only",
    );
    expect(body.query).not.toMatch(
      /\b(email|insert|update|delete|create)\b|\*/i,
    );
    expect(body.parameters).toHaveLength(3);
    expect(result[0].createdAt).toContain(".123456");
  });
});
describe("credential encryption and channels", () => {
  it("authenticates ciphertext against its owning connection and supports key rotation", async () => {
    const box = secretBox(
      { old: Buffer.alloc(32, 1).toString("base64") },
      "old",
    );
    const encrypted = await box.seal({ token: "private" }, "connection-A");
    const rotated = secretBox(
      {
        old: Buffer.alloc(32, 1).toString("base64"),
        next: Buffer.alloc(32, 2).toString("base64"),
      },
      "next",
    );
    expect(await rotated.open(encrypted, "connection-A")).toEqual({
      token: "private",
    });
    await expect(rotated.open(encrypted, "connection-B")).rejects.toThrow();
  });
  it("marks Telegram timeouts uncertain instead of retrying blindly", async () => {
    const http = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    expect(
      await telegramChannel("token", http).send(
        "12",
        { title: "Hello", text: "World" },
        "id",
      ),
    ).toMatchObject({ status: "uncertain" });
  });
  it("uses Resend idempotency on safe retries", async () => {
    const http = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    const result = await resendTransport(
      "key",
      "signs-of-life@example.test",
      http,
    ).send({
      to: "user@example.test",
      subject: "Hello",
      text: "World",
      idempotencyKey: "delivery-1",
    });
    expect(result.status).toBe("retry");
    expect(
      new Headers(http.mock.calls[0][1]?.headers).get("Idempotency-Key"),
    ).toBe("delivery-1");
  });
  it("honors timezone delivery time across DST and keeps reporting dates in UTC", () => {
    expect(
      dailyReady(new Date("2026-03-29T06:59:00Z"), "Europe/Berlin", "09:00"),
    ).toBe(false);
    expect(
      dailyReady(new Date("2026-03-29T07:00:00Z"), "Europe/Berlin", "09:00"),
    ).toBe(true);
    expect(reportingDates(new Date("2026-01-01T00:10:00Z"), 2)).toEqual([
      "2025-12-31",
      "2025-12-30",
    ]);
  });
});
