import {
  betterAuthentication,
  supabaseAuthentication,
} from "../../adapters/src/auth";
import type { Config } from "./config";
import type { Database } from "../../db/src/client";
export function authentication(config: Config, db: Database) {
  return config.AUTH_PROVIDER === "supabase"
    ? supabaseAuthentication(config)
    : betterAuthentication(config, db);
}
