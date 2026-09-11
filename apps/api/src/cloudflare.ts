/// <reference path="../worker-configuration.d.ts" />
import { configuration } from "../../../packages/backend/src/config";
import { compose } from "../../../packages/backend/src/compose";
import { authentication } from "../../../packages/backend/src/authentication";
import { createApi } from "../../../packages/backend/src/api";
export default {
  async fetch(request, env, ctx) {
    const config = configuration(
      { ...env, DATABASE_URL: env.DATABASE.connectionString },
      "cloudflare",
    );
    const { services, db, close } = compose(config);
    try {
      return await createApi({
        ...services,
        auth: authentication(config, db),
      }).fetch(request);
    } finally {
      ctx.waitUntil(close());
    }
  },
} satisfies ExportedHandler<ApiBindings>;
