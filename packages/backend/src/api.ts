import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import type { ApiServices } from "./services";
import { AppError, assert } from "../../core/src/model";
import { validTimezone } from "../../core/src/time";
import { integrationRoutes } from "./routes-integrations";
import { destinationRoutes } from "./routes-destinations";
import { publicRoutes } from "./routes-public";
export type ApiEnv = {
  Variables: { workspaceId: string; userId: string; name: string };
};
export const idSchema = z.uuid();
export const textName = z.string().trim().min(1).max(80);
export function createApi(services: ApiServices) {
  const app = new Hono<ApiEnv>();
  app.use("*", secureHeaders());
  app.use(
    "*",
    bodyLimit({
      maxSize: 128_000,
      onError: (c) => c.json({ error: "request_too_large" }, 413),
    }),
  );
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json(
        {
          error: "invalid_input",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    if (error instanceof AppError)
      return Response.json({ error: error.code }, { status: error.status });
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    if (code === "23505") return c.json({ error: "already_exists" }, 409);
    if (code === "23503")
      return c.json({ error: "related_record_not_found" }, 404);
    console.error(
      JSON.stringify({
        event: "api_error",
        path: new URL(c.req.url).pathname,
        code: "internal_error",
      }),
    );
    return c.json({ error: "internal_error" }, 500);
  });
  app.get("/api/health", (c) =>
    c.json({ status: "ok", revision: services.config.BUILD_REVISION }),
  );
  app.get("/api/ready", async (c) => {
    await services.store.health();
    return c.json({
      status: "ready",
      revision: services.config.BUILD_REVISION,
    });
  });
  app.get("/api/config", (c) =>
    c.json({
      authProvider: services.config.AUTH_PROVIDER,
      loginEnabled: services.auth.enabled,
      sourceUrl: services.config.SOURCE_URL,
      revision: services.config.BUILD_REVISION,
      sources: {
        supabase: !!services.config.SUPABASE_OAUTH_CLIENT_ID,
        apple: true,
      },
      channels: {
        telegram: !!services.channels.telegram,
        email: !!services.channels.email,
      },
      limits: {
        projects: services.config.MAX_PROJECTS,
        sources: services.config.MAX_SOURCES,
        destinations: services.config.MAX_DESTINATIONS,
      },
    }),
  );
  app.all("/api/auth/*", (c) => services.auth.handle(c.req.raw));
  app.route("/api", publicRoutes(services));
  app.use("/api/*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method))
      assert(
        c.req.header("origin") === services.config.PUBLIC_URL,
        "invalid_origin",
        403,
      );
    await next();
  });
  app.post("/api/session/login", (c) => services.auth.login(c.req.raw));
  app.post("/api/session/logout", (c) => services.auth.logout(c.req.raw));
  app.use("/api/*", async (c, next) => {
    const headers = new Headers();
    const identity = await services.auth.identity(c.req.raw, headers);
    for (const cookie of headers.getSetCookie())
      c.header("Set-Cookie", cookie, { append: true });
    assert(identity, "authentication_required", 401);
    const member = await services.store.resolveIdentity(identity);
    c.set("workspaceId", member.workspaceId);
    c.set("userId", member.userId);
    c.set("name", member.name);
    await next();
  });
  app.get("/api/session", (c) =>
    c.json({
      userId: c.get("userId"),
      workspaceId: c.get("workspaceId"),
      name: c.get("name"),
    }),
  );
  app.get("/api/dashboard", async (c) =>
    c.json(await services.store.snapshot(c.get("workspaceId"))),
  );
  app.post("/api/projects", async (c) => {
    const input = z
      .object({
        name: textName,
        description: z.string().max(240).default(""),
        timezone: z.string().refine(validTimezone).default("UTC"),
      })
      .parse(await c.req.json());
    return c.json(
      await services.store.createProject(
        c.get("workspaceId"),
        input,
        services.config.MAX_PROJECTS,
      ),
      201,
    );
  });
  app.patch("/api/projects/:id", async (c) => {
    const { destinationIds, ...patch } = z
      .object({
        name: textName.optional(),
        description: z.string().max(240).optional(),
        enabled: z.boolean().optional(),
        timezone: z.string().refine(validTimezone).optional(),
        dailyTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        destinationIds: z.array(idSchema).max(100).optional(),
      })
      .parse(await c.req.json());
    await services.store.updateProject(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
      patch,
      destinationIds,
    );
    return c.json({ success: true });
  });
  app.delete("/api/projects/:id", async (c) => {
    await services.store.deleteProject(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    return c.json({ success: true });
  });
  app.delete("/api/workspace", async (c) => {
    const input = z
      .object({ confirmation: z.literal("DELETE") })
      .parse(await c.req.json());
    await services.store.deleteWorkspace(c.get("workspaceId"));
    return services.auth.logout(c.req.raw);
  });
  app.route("/api", integrationRoutes(services));
  app.route("/api", destinationRoutes(services));
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
