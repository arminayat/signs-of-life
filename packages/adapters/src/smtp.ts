import nodemailer from "nodemailer";
import type { EmailTransport } from "../../core/src/model";
export function smtpTransport(url: string, from: string): EmailTransport {
  const target = new URL(url);
  if (!["smtp:", "smtps:"].includes(target.protocol))
    throw new Error("SMTP_URL must use smtp or smtps");
  const transport = nodemailer.createTransport(
    {
      host: target.hostname,
      port: Number(target.port || (target.protocol === "smtps:" ? 465 : 587)),
      secure: target.protocol === "smtps:",
      auth: target.username
        ? {
            user: decodeURIComponent(target.username),
            pass: decodeURIComponent(target.password),
          }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    },
    { from, disableFileAccess: true, disableUrlAccess: true },
  );
  return {
    async send(message) {
      try {
        const result = await transport.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text:
            message.text +
            (message.unsubscribeUrl
              ? `\n\nManage notifications: ${message.unsubscribeUrl}`
              : ""),
          headers: message.unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : undefined,
        });
        return result.accepted.length
          ? { status: "accepted", providerId: result.messageId }
          : { status: "failed", code: "smtp_rejected" };
      } catch (error) {
        const code = (error as { code?: string }).code;
        return code === "EAUTH" || code === "EENVELOPE"
          ? { status: "failed", code: `smtp_${code}` }
          : { status: "uncertain", code: "smtp_outcome_unknown" };
      }
    },
  };
}
