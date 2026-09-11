import type { EmailTransport } from "../../core/src/model";
import { database } from "../../db/src/client";
import { postgresStore } from "../../db/src/store";
import { secretBox } from "../../adapters/src/crypto";
import { supabaseSource } from "../../adapters/src/supabase-source";
import { appleSource } from "../../adapters/src/apple-source";
import {
  telegramChannel,
  emailChannel,
  resendTransport,
} from "../../adapters/src/channels";
import type { Config } from "./config";
import type { Services } from "./services";
export function compose(config: Config, email?: EmailTransport) {
  const { db, close } = database(config.DATABASE_URL);
  const transport =
    email ??
    (config.EMAIL_PROVIDER === "resend"
      ? resendTransport(config.RESEND_API_KEY!, config.MAIL_FROM!)
      : undefined);
  const services: Services = {
    http: fetch,
    config,
    store: postgresStore(db),
    secrets: secretBox(config.ENCRYPTION_KEYS, config.ENCRYPTION_KEY_VERSION),
    accounts: supabaseSource(),
    reports: appleSource(),
    channels: {
      ...(config.TELEGRAM_BOT_TOKEN
        ? { telegram: telegramChannel(config.TELEGRAM_BOT_TOKEN) }
        : {}),
      ...(transport ? { email: emailChannel(transport) } : {}),
    },
  };
  return { services, db, close };
}
