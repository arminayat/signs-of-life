import { AppError } from "../../core/src/model";
export type Http = typeof fetch;
export async function boundedText(
  response: Response,
  maxBytes = 2_000_000,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes)
        throw new AppError("provider_response_too_large", 502);
      value += decoder.decode(part.value, { stream: true });
    }
    return value + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function jsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      `provider_http_${response.status}`,
      response.status === 429 ? 429 : 502,
    );
  }
  return JSON.parse(await boundedText(response)) as T;
}
