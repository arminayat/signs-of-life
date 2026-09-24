import { Hono } from "hono";
import { z } from "zod";
import { assert, type AppleCredentials } from "../../core/src/model";
import {
  authorizeSupabase,
  exchangeSupabase,
  listSupabaseProjects,
  listSupabaseCatalog,
  emptyCursor,
} from "../../adapters/src/supabase-source";
import { randomToken, hashToken } from "../../adapters/src/crypto";
import { reportingDates } from "../../core/src/time";
import {
  connectionFor,
  supabaseAccess,
  supabaseOAuth,
  type Services,
} from "./services";
import { idSchema, textName, type ApiEnv } from "./api";
export function integrationRoutes(services: Services) {
  const app = new Hono<ApiEnv>();
  const { store, config, secrets } = services;
  app.post("/connections/supabase/start", async (c) => {
    const input = z
      .object({ projectId: idSchema, connectionId: idSchema.optional() })
      .parse(await c.req.json());
    await validateProjectConnection(
      c.get("workspaceId"),
      input.projectId,
      input.connectionId,
    );
    if (input.connectionId)
      assert(
        (await store.connection(c.get("workspaceId"), input.connectionId))
          ?.kind === "supabase",
        "connection_not_found",
        404,
      );
    assert(
      await store.rateLimit(`oauth:${c.get("workspaceId")}`, 20, 3600),
      "rate_limited",
      429,
    );
    const state = randomToken(),
      verifier = randomToken(),
      hash = await hashToken(state);
    await store.challenge({
      hash,
      workspaceId: c.get("workspaceId"),
      purpose: "supabase-oauth",
      destinationId: null,
      secret: await secrets.seal(
        {
          verifier,
          connectionId: input.connectionId,
          projectId: input.projectId,
        },
        hash,
      ),
      expiresAt: new Date(Date.now() + 600_000),
    });
    return c.json({
      url: authorizeSupabase(
        supabaseOAuth(config),
        state,
        await hashToken(verifier),
      ),
    });
  });
  app.get("/connections/supabase/callback", async (c) => {
    const hash = await hashToken(
      z.string().min(20).parse(c.req.query("state")),
    );
    const challenge = await store.useChallenge(
      hash,
      "supabase-oauth",
      c.get("workspaceId"),
    );
    assert(challenge?.secret, "oauth_state_invalid_or_expired", 400);
    const { verifier, connectionId, projectId } = await secrets.open<{
      verifier: string;
      projectId: string;
      connectionId?: string;
    }>(challenge.secret, hash);
    await validateProjectConnection(
      c.get("workspaceId"),
      projectId,
      connectionId,
    );
    const code = z.string().min(1).parse(c.req.query("code"));
    const tokens = await exchangeSupabase(
      supabaseOAuth(config),
      { code, verifier },
      services.http,
    );
    const id = connectionId ?? crypto.randomUUID();
    await store.saveConnection({
      id,
      projectId,
      workspaceId: c.get("workspaceId"),
      kind: "supabase",
      name: "Supabase",
      secret: await secrets.seal(tokens, id),
      externalId: null,
    });
    // Reconnect reactivates recurring jobs while retaining source cursors.
    for (const source of await store.connectionSources(
      c.get("workspaceId"),
      id,
    ))
      await store.enqueue(c.get("workspaceId"), `supabase:${source.id}`, {
        kind: "supabase.collect",
        sourceId: source.id,
      });
    return c.redirect(
      `${config.PUBLIC_URL}/projects/${projectId}/sources?connected=${id}`,
      303,
    );
  });
  app.post("/connections/apple", async (c) => {
    const input = z
      .object({
        projectId: idSchema,
        connectionId: idSchema.optional(),
        name: textName.default("App Store Connect"),
        issuerId: z.uuid(),
        keyId: z.string().regex(/^[A-Z0-9]{10}$/),
        privateKey: z.string().min(100).max(8000),
        vendorNumber: z.string().regex(/^\d{4,20}$/),
      })
      .parse(await c.req.json());
    await validateProjectConnection(
      c.get("workspaceId"),
      input.projectId,
      input.connectionId,
    );
    if (input.connectionId)
      assert(
        (await store.connection(c.get("workspaceId"), input.connectionId))
          ?.kind === "apple",
        "connection_not_found",
        404,
      );
    const credentials: AppleCredentials = {
      issuerId: input.issuerId,
      keyId: input.keyId,
      privateKey: input.privateKey,
      vendorNumber: input.vendorNumber,
    };
    // Validate signing and reporting access before persisting credentials.
    await services.reports.report(credentials, reportingDates(new Date())[0]);
    const id = input.connectionId ?? crypto.randomUUID();
    await store.saveConnection({
      id,
      projectId: input.projectId,
      workspaceId: c.get("workspaceId"),
      name: input.name,
      kind: "apple",
      externalId: input.vendorNumber,
      secret: await secrets.seal(credentials, id),
    });
    return c.json({ id }, 201);
  });
  app.get("/connections/:id/catalog", async (c) => {
    const connection = await connectionFor(
      services,
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    if (connection.kind === "supabase")
      return c.json({
        items: await listSupabaseCatalog(
          await supabaseAccess(services, connection),
          services.http,
        ),
      });
    const credentials = await secrets.open<AppleCredentials>(
      connection.secret,
      connection.id,
    );
    for (const date of reportingDates(new Date(), 7)) {
      const report = await services.reports.report(credentials, date);
      if (report?.length)
        return c.json({
          items: report.map((metric) => ({
            id: metric.appId,
            name: metric.title,
          })),
        });
    }
    return c.json({ items: [], manualAppId: true });
  });
  app.delete("/connections/:id", async (c) => {
    await store.disconnect(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    return c.json({ success: true });
  });
  app.post("/sources", async (c) => {
    const input = z
      .object({
        projectId: idSchema,
        connectionId: idSchema,
        externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
        name: textName,
      })
      .parse(await c.req.json());
    assert(
      await store.project(c.get("workspaceId"), input.projectId),
      "project_not_found",
      404,
    );
    const connection = await connectionFor(
      services,
      c.get("workspaceId"),
      input.connectionId,
    );
    assert(
      connection.projectId === input.projectId,
      "connection_project_mismatch",
      400,
    );
    if (connection.kind === "supabase") {
      const token = await supabaseAccess(services, connection);
      const available = await listSupabaseProjects(token, services.http);
      assert(
        available.some((project) => project.id === input.externalId),
        "supabase_project_not_accessible",
        403,
      );
      await services.accounts.collect(
        token,
        input.externalId,
        emptyCursor(new Date().toISOString()),
        new Date().toISOString(),
      );
    } else assert(/^\d+$/.test(input.externalId), "invalid_apple_app_id");
    return c.json(
      await store.createSource(
        { workspaceId: c.get("workspaceId"), ...input, kind: connection.kind },
        config.MAX_SOURCES,
      ),
      201,
    );
  });
  app.delete("/sources/:id", async (c) => {
    await store.deleteSource(
      c.get("workspaceId"),
      idSchema.parse(c.req.param("id")),
    );
    return c.json({ success: true });
  });
  async function validateProjectConnection(
    workspaceId: string,
    projectId: string,
    connectionId?: string,
  ) {
    assert(
      await store.project(workspaceId, projectId),
      "project_not_found",
      404,
    );
    if (!connectionId) return;
    const connection = await store.connection(workspaceId, connectionId);
    assert(connection, "connection_not_found", 404);
    assert(
      connection.projectId === projectId ||
        (connection.projectId === null &&
          (await store.connectionSources(workspaceId, connectionId)).some(
            (source) => source.projectId === projectId,
          )),
      "connection_project_mismatch",
      400,
    );
  }
  return app;
}
