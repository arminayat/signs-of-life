import { configuration } from "./config";
import { compose } from "./compose";
import { smtpTransport } from "../../adapters/src/smtp";
export function nodeServices() {
  const config = configuration(process.env, "node");
  return compose(
    config,
    config.EMAIL_PROVIDER === "smtp"
      ? smtpTransport(config.SMTP_URL!, config.MAIL_FROM!)
      : undefined,
  );
}
