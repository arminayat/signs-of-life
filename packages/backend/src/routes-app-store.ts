import { Hono } from "hono";
import { z } from "zod";
import { assert, type AppleCredentials } from "../../core/src/model";
import { datesBetween, summarizeAppStore } from "../../core/src/app-store";
import { connectionFor, type Services } from "./services";
import { idSchema, type ApiEnv } from "./api";
const day = z.iso.date();
/** App Store statistics for one App Store source (the dashboard Stats page). */
export function appStoreRoutes(services: Services) {
  const app = new Hono<ApiEnv>();
  async function appleSource(workspaceId: string, id: string | undefined) {
    const source = await services.store.source(workspaceId, idSchema.parse(id));
    assert(source?.kind === "apple", "source_not_found", 404);
    return source;
  }
  app.get("/sources/:id/app-store", async (c) => {
    const workspaceId = c.get("workspaceId");
    const source = await appleSource(workspaceId, c.req.param("id"));
    const { from, to } = z.object({ from: day, to: day }).parse(c.req.query());
    const dates = datesBetween(from, to);
    assert(dates.length && dates.length <= 366, "invalid_range", 400);
    return c.json(
      summarizeAppStore(
        dates,
        await services.store.appStoreDays(workspaceId, source.id, from, to),
      ),
    );
  });
  // Versions, reviews and ratings are read live from Apple and never stored.
  app.get("/sources/:id/app-store/listing", async (c) => {
    const workspaceId = c.get("workspaceId");
    const source = await appleSource(workspaceId, c.req.param("id"));
    const countries = [
      ...new Set(
        (c.req.query("countries") ?? "")
          .split(",")
          .filter((country) => /^[A-Z]{2}$/.test(country)),
      ),
    ].slice(0, 10);
    assert(
      await services.store.rateLimit(`app-store:${workspaceId}`, 120, 3600),
      "rate_limited",
      429,
    );
    const connection = await connectionFor(
      services,
      workspaceId,
      source.connectionId,
      "apple",
    );
    const credentials = await services.secrets.open<AppleCredentials>(
      connection.secret,
      connection.id,
    );
    return c.json(
      await services.reports.listing(
        credentials,
        source.externalId,
        countries.length ? countries : ["US"],
      ),
    );
  });
  return app;
}
