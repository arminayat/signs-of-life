import { SMTPServer } from "smtp-server";
import { expect, it } from "vitest";
import { smtpTransport } from "../packages/adapters/src/smtp";
it("delivers through a real local SMTP protocol exchange without a managed email service", async () => {
  const messages: string[] = [];
  const server = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    authOptional: true,
    onData(stream, _session, done) {
      let text = "";
      stream.on("data", (chunk) => {
        text += chunk.toString();
      });
      stream.on("end", () => {
        messages.push(text);
        done();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const result = await smtpTransport(
      `smtp://127.0.0.1:${address.port}`,
      "Product Monitor <monitor@example.test>",
    ).send({
      to: "recipient@example.test",
      subject: "Local SMTP test",
      text: "Your product update.",
      idempotencyKey: "smtp-test",
      unsubscribeUrl: "https://monitor.example.test/unsubscribe/opaque",
    });
    expect(result.status).toBe("accepted");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("To: recipient@example.test");
    expect(messages[0]).toContain("Your product update.");
    expect(messages[0]).toContain(
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});
