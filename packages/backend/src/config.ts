import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.url(),
  AUTH_PROVIDER: z.enum(["better-auth", "supabase"]).default("better-auth"),
  AUTH_SESSION_VERSION: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("1"),
  AUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEYS: z
    .string()
    .transform((value, ctx): Record<string, string> => {
      try {
        const keys = JSON.parse(value);
        return z
          .record(
            z.string().regex(/^[a-zA-Z0-9_-]+$/),
            z.string().refine((v) => Buffer.from(v, "base64").length === 32),
          )
          .parse(keys);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Expected JSON map of base64 encoded 32-byte keys",
        });
        return z.NEVER;
      }
    }),
  ENCRYPTION_KEY_VERSION: z.string().default("v1"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SUPABASE_AUTH_URL: z.url().optional(),
  SUPABASE_AUTH_KEY: z.string().optional(),
  SUPABASE_OAUTH_CLIENT_ID: z.string().optional(),
  SUPABASE_OAUTH_CLIENT_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  EMAIL_PROVIDER: z.enum(["disabled", "resend", "smtp"]).default("disabled"),
  MAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAX_PROJECTS: z.coerce.number().int().positive().default(5),
  MAX_SOURCES: z.coerce.number().int().positive().default(10),
  MAX_DESTINATIONS: z.coerce.number().int().positive().default(3),
  SOURCE_URL: z.url().default("https://github.com/arminayat/signs-of-life"),
  BUILD_REVISION: z.string().default("development"),
});
export type Config = z.infer<typeof schema>;
export function configuration(
  input: Record<string, unknown>,
  runtime: "node" | "cloudflare",
): Config {
  const config = schema.parse(
    Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== ""),
    ),
  );
  if (!config.ENCRYPTION_KEYS[config.ENCRYPTION_KEY_VERSION])
    throw new Error("Active encryption key is missing");
  if (
    config.AUTH_PROVIDER === "supabase" &&
    (!config.SUPABASE_AUTH_URL || !config.SUPABASE_AUTH_KEY)
  )
    throw new Error("Supabase Auth URL/key required");
  if (config.EMAIL_PROVIDER !== "disabled" && !config.MAIL_FROM)
    throw new Error("MAIL_FROM required");
  if (config.EMAIL_PROVIDER === "resend" && !config.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY required");
  if (
    config.EMAIL_PROVIDER === "smtp" &&
    (!config.SMTP_URL || runtime !== "node")
  )
    throw new Error("SMTP requires the Node runtime and SMTP_URL");
  if (
    config.TELEGRAM_BOT_TOKEN &&
    (!config.TELEGRAM_BOT_USERNAME || !config.TELEGRAM_WEBHOOK_SECRET)
  )
    throw new Error("Telegram username and webhook secret required");
  return config;
}
