import { auth0Export } from "./auth0-export";
import type {
  CollectionInput,
  CollectionPage,
  Credentials,
  MonitorKind,
  Observation,
  ProviderAdapter,
} from "../../../core/src/monitoring";
import { assert } from "../../../core/src/model";
import type { Http } from "../http";
import { hashToken } from "../crypto";
import {
  array,
  auth0Host,
  connectorUrl,
  headers,
  iso,
  number,
  object,
  request,
  string,
  url,
} from "./http";
const definition = [
  {
    id: "signup",
    label: "New accounts",
    group: "growth" as const,
    shape: "series" as const,
    definition:
      "Observed account creations; not sign-ins or total active users. Historical user lists exclude deleted accounts.",
  },
];
function signup(
  id: string,
  at: unknown,
  input: CollectionInput,
  anonymous = false,
): Observation {
  return {
    id,
    occurredAt: iso(at),
    resourceId: input.resourceId,
    environment: input.environment,
    kind: "signup",
    anonymous,
  };
}
export function authSource(
  kind: Extract<MonitorKind, "workos" | "clerk" | "auth0" | "better-auth">,
  http: Http,
  allowedHosts: string[],
): ProviderAdapter {
  async function catalog(c: Credentials) {
    if (kind === "workos") {
      assert(c.clientId, "workos_client_id_required");
      object(
        await request(
          http,
          "https://api.workos.com/user_management/users?limit=1",
          { headers: headers(c) },
        ),
      );
      return [
        {
          id: c.clientId,
          name: c.environment || "WorkOS environment",
          environment: c.environment || "production",
        },
      ];
    }
    if (kind === "clerk") {
      const instance = object(
        await request(http, "https://api.clerk.com/v1/instance", {
          headers: headers(c),
        }),
      );
      return [
        {
          id: string(instance.id),
          name:
            typeof instance.name === "string"
              ? instance.name
              : "Clerk instance",
          environment: c.apiKey.startsWith("sk_test_")
            ? "sandbox"
            : "production",
        },
      ];
    }
    if (kind === "auth0") {
      array(
        await request(
          http,
          `${auth0Host(c)}/api/v2/users?per_page=1&fields=user_id,created_at&include_fields=true`,
          { headers: headers(c) },
        ),
      );
      return [{ id: c.domain, name: c.domain, environment: "production" }];
    }
    const target = connectorUrl(c, allowedHosts);
    target.searchParams.set("limit", "1");
    const result = object(await request(http, target, { headers: headers(c) }));
    assert(result.version === 1, "connector_version_unsupported");
    return [
      {
        id: await hashToken(target.origin + target.pathname),
        name:
          typeof result.name === "string"
            ? result.name
            : "Better Auth application",
        environment: "production",
      },
    ];
  }
  return {
    catalog,
    definitions: async () => definition,
    async collect(input): Promise<CollectionPage> {
      const c = input.credentials;
      if (kind === "better-auth") {
        const target = connectorUrl(c, allowedHosts);
        for (const [key, value] of Object.entries({
          from: input.from,
          until: input.until,
          limit: "200",
          ...(input.cursor.after ? { after: input.cursor.after } : {}),
        }))
          target.searchParams.set(key, value);
        const result = object(
          await request(http, target, { headers: headers(c) }),
        );
        assert(result.version === 1, "connector_version_unsupported");
        const events = await Promise.all(
          array(result.users).map(async (value) => {
            const row = object(value);
            return signup(
              await hashToken(string(row.id)),
              row.createdAt,
              input,
              row.anonymous === true,
            );
          }),
        );
        return {
          events,
          cursor: result.next ? { after: string(result.next) } : {},
          done: !result.next,
          coverage:
            "Historical account records exclude users deleted before collection.",
        };
      }
      if (kind === "clerk") {
        const result = await request(
          http,
          url("https://api.clerk.com", "/v1/users", {
            limit: 200,
            offset: Number(input.cursor.offset || 0),
            order_by: "+created_at",
            created_at_after: Date.parse(input.from) - 1,
            created_at_before: Date.parse(input.until) + 1,
          }),
          { headers: headers(c) },
        );
        const rows = array(result);
        const events = await Promise.all(
          rows.map(async (value) => {
            const row = object(value);
            return signup(
              await hashToken(string(row.id)),
              number(row.created_at),
              input,
            );
          }),
        );
        return {
          events,
          cursor: {
            offset: String(Number(input.cursor.offset || 0) + rows.length),
          },
          done: rows.length < 200,
          coverage:
            "Historical account records exclude deleted users; accounts deleted between polls can be missed.",
        };
      }
      if (kind === "workos") {
        const path = input.historical ? "/user_management/users" : "/events";
        const start =
          input.cursor.windowStart ||
          new Date(
            Math.max(Date.parse(input.from), Date.now() - 89 * 86400_000),
          ).toISOString();
        const end = new Date(
          Math.min(Date.parse(input.until), Date.parse(start) + 29 * 86400_000),
        ).toISOString();
        const result = object(
          await request(
            http,
            url("https://api.workos.com", path, {
              limit: 100,
              after: input.cursor.after,
              ...(!input.historical
                ? { events: "user.created", range_start: start, range_end: end }
                : {}),
            }),
            { headers: headers(c) },
          ),
        );
        const rows = array(result.data);
        const events: Observation[] = [];
        for (const value of rows) {
          const row = object(value);
          if (!input.historical && row.event !== "user.created") continue;
          const user = input.historical ? row : object(row.data);
          const createdAt = iso(user.created_at);
          if (createdAt >= input.from && createdAt <= input.until)
            events.push(
              signup(await hashToken(string(user.id)), createdAt, input),
            );
        }
        const after = object(result.list_metadata).after;
        return {
          events,
          cursor: after
            ? { after: string(after), windowStart: start }
            : !input.historical && end < input.until
              ? { windowStart: end }
              : {},
          done: !after && (input.historical || end >= input.until),
          coverage: input.historical
            ? "Historical user records exclude deleted accounts; event replay is limited to 90 days."
            : start > input.from
              ? "Event history expired; earlier activity may be missing."
              : undefined,
        };
      }
      // Auth0 search stops at 1,000 matches. Bisect time ranges before reaching that cap.
      if (input.cursor.exportJob) return auth0Export(http, input);
      const from = input.cursor.from || input.from;
      const until = input.cursor.until || input.until;
      const page = Number(input.cursor.page || 0);
      const result = object(
        await request(
          http,
          url(auth0Host(c), "/api/v2/users", {
            search_engine: "v3",
            q: `created_at:[${from} TO ${until}]`,
            sort: "created_at:1",
            per_page: 100,
            page,
            include_totals: "true",
            fields: "user_id,created_at",
            include_fields: "true",
          }),
          { headers: headers(c) },
        ),
      );
      const rows = array(result.users);
      let pending: string[] = input.cursor.pending
        ? JSON.parse(input.cursor.pending)
        : [];
      if (Number(result.total) >= 1000 || (page >= 9 && rows.length === 100)) {
        const midpoint = Math.floor((Date.parse(from) + Date.parse(until)) / 2);
        if (midpoint <= Date.parse(from)) return auth0Export(http, input);
        pending = [new Date(midpoint).toISOString(), until, ...pending];
        return {
          events: [],
          cursor: {
            from,
            until: new Date(midpoint).toISOString(),
            page: "0",
            pending: JSON.stringify(pending),
          },
          done: false,
        };
      }
      const events = await Promise.all(
        rows.map(async (value) => {
          const row = object(value);
          return signup(
            await hashToken(string(row.user_id)),
            row.created_at,
            input,
          );
        }),
      );
      if (rows.length === 100)
        return {
          events,
          cursor: {
            from,
            until,
            page: String(page + 1),
            pending: JSON.stringify(pending),
          },
          done: false,
        };
      const nextFrom = pending.shift(),
        nextUntil = pending.shift();
      return {
        events,
        cursor:
          nextFrom && nextUntil
            ? {
                from: nextFrom,
                until: nextUntil,
                page: "0",
                pending: JSON.stringify(pending),
              }
            : {},
        done: !nextFrom,
        coverage:
          "Auth0 search is eventually consistent; historical user records exclude deleted accounts.",
      };
    },
  };
}
