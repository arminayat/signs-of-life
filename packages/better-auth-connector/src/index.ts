import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
type User = { id: string; createdAt: Date | string; isAnonymous?: boolean };
const querySchema = z.object({
  from: z.iso.datetime().default("1970-01-01T00:00:00.000Z"),
  until: z.iso.datetime().optional(),
  after: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});
const cursorSchema = z.object({
  at: z.iso.datetime(),
  id: z.string().min(1).max(2000),
  from: z.iso.datetime(),
  until: z.iso.datetime(),
});
const encoder = new TextEncoder();
async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}
async function validToken(received: string, tokens: string[]) {
  const actual = await digest(received);
  let valid = false;
  for (const token of tokens) {
    const expected = await digest(token);
    let difference = 0;
    for (let i = 0; i < actual.length; i++)
      difference |= actual[i] ^ expected[i];
    valid = difference === 0 || valid;
  }
  return valid;
}
function encode(value: unknown) {
  return btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
    ),
  );
}
/** Dedicated connector tokens. Keep the previous token briefly during rotation. */
export function signsOfLife(options: {
  tokens: string[];
  name?: string;
}): BetterAuthPlugin {
  if (
    !options.tokens.length ||
    options.tokens.some((token) => token.length < 32) ||
    options.tokens.length > 2
  )
    throw new Error(
      "Provide one or two dedicated connector tokens of at least 32 characters.",
    );
  const tokens = [...options.tokens];
  return {
    id: "signs-of-life-read-only",
    endpoints: {
      signsOfLifeUsers: createAuthEndpoint(
        "/signs-of-life/v1/users",
        { method: "GET", query: querySchema, requireHeaders: true },
        async (ctx) => {
          const token =
            ctx.headers?.get("authorization")?.replace(/^Bearer /, "") || "";
          if (!(await validToken(token, tokens)))
            throw ctx.error("UNAUTHORIZED", {
              message: "Invalid connector token",
            });
          ctx.setHeader("Cache-Control", "no-store");
          const { from, limit } = ctx.query;
          let cursor: z.infer<typeof cursorSchema> | undefined;
          if (ctx.query.after) {
            try {
              cursor = cursorSchema.parse(decode(ctx.query.after));
            } catch {
              throw ctx.error("BAD_REQUEST", { message: "Invalid cursor" });
            }
          }
          const until =
            ctx.query.until || cursor?.until || new Date().toISOString();
          if (
            from >= until ||
            (cursor &&
              (cursor.from !== from ||
                cursor.until !== until ||
                cursor.at < from ||
                cursor.at >= until))
          )
            throw ctx.error("BAD_REQUEST", {
              message: "Invalid range or cursor",
            });
          const adapter = ctx.context.adapter;
          const anonymous = ctx.context.options.plugins?.some(
            (p) => p.id === "anonymous",
          );
          const select = [
            "id",
            "createdAt",
            ...(anonymous ? ["isAnonymous"] : []),
          ];
          let rows: User[] = [];
          if (cursor)
            rows = await adapter.findMany<User>({
              model: "user",
              select,
              where: [
                {
                  field: "createdAt",
                  operator: "gte",
                  value: new Date(cursor.at),
                },
                {
                  field: "createdAt",
                  operator: "lte",
                  value: new Date(cursor.at),
                },
                { field: "id", operator: "gt", value: cursor.id },
              ],
              sortBy: { field: "id", direction: "asc" },
              limit,
            });
          if (rows.length < limit) {
            const remaining = limit - rows.length;
            const candidates = await adapter.findMany<User>({
              model: "user",
              select,
              where: [
                {
                  field: "createdAt",
                  operator: cursor ? "gt" : "gte",
                  value: new Date(cursor?.at || from),
                },
                { field: "createdAt", operator: "lt", value: new Date(until) },
              ],
              sortBy: { field: "createdAt", direction: "asc" },
              limit: remaining,
            });
            const last = candidates.at(-1);
            if (last) {
              const boundary = new Date(last.createdAt).getTime();
              const complete = candidates.filter(
                (row) => new Date(row.createdAt).getTime() < boundary,
              );
              // The adapter supports one sort field. Re-read the final timestamp
              // ordered by ID so an arbitrary partial tie never skips accounts.
              const tail = await adapter.findMany<User>({
                model: "user",
                select,
                where: [
                  {
                    field: "createdAt",
                    operator: "gte",
                    value: new Date(boundary),
                  },
                  {
                    field: "createdAt",
                    operator: "lte",
                    value: new Date(boundary),
                  },
                ],
                sortBy: { field: "id", direction: "asc" },
                limit: remaining - complete.length,
              });
              rows.push(...complete, ...tail);
            }
          }
          const users = rows.map((row) => ({
            id: z.string().min(1).max(2000).parse(row.id),
            createdAt: new Date(row.createdAt).toISOString(),
            ...(anonymous ? { anonymous: row.isAnonymous === true } : {}),
          }));
          const last = users.at(-1);
          return ctx.json({
            version: 1,
            name: (options.name || "Better Auth application").slice(0, 80),
            users,
            next: last
              ? encode({ at: last.createdAt, id: last.id, from, until })
              : null,
          });
        },
      ),
    },
  };
}
