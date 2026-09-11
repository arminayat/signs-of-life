import type { SecretBox } from "../../core/src/model";
const encoder = new TextEncoder();
export function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}
export async function hashToken(token: string) {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", encoder.encode(token)),
  ).toString("base64url");
}
export async function equalSecret(left: string, right: string) {
  const [a, b] = await Promise.all([hashToken(left), hashToken(right)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export function secretBox(
  keys: Record<string, string>,
  current: string,
): SecretBox {
  if (!keys[current]) throw new Error("Active encryption key missing");
  async function key(version: string) {
    const raw = Buffer.from(keys[version] ?? "", "base64");
    if (raw.length !== 32)
      throw new Error("Encryption keys must be base64 encoded 32-byte keys");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  return {
    async seal(value, context) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
        await key(current),
        encoder.encode(JSON.stringify(value)),
      );
      return [
        current,
        Buffer.from(iv).toString("base64url"),
        Buffer.from(encrypted).toString("base64url"),
      ].join(".");
    },
    async open<T>(value: string, context: string): Promise<T> {
      const [version, iv, encrypted] = value.split(".");
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(iv, "base64url"),
          additionalData: encoder.encode(context),
        },
        await key(version),
        Buffer.from(encrypted, "base64url"),
      );
      return JSON.parse(new TextDecoder().decode(decrypted)) as T;
    },
  };
}
