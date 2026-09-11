export type SourceKind = "supabase" | "apple";
export type ChannelKind = "telegram" | "email";
export type Notification = { title: string; text: string };
export type Identity = {
  issuer: string;
  subject: string;
  name: string;
  email?: string;
};
export type Cursor = { at: string; id: string; catchup?: boolean };
export type AccountEvent = {
  id: string;
  createdAt: string;
  provider: string;
  anonymous?: boolean;
};
export type DownloadMetric = {
  appId: string;
  title: string;
  downloads: number;
  redownloads: number;
};
export type JobPayload =
  | { kind: "supabase.collect"; sourceId: string }
  | { kind: "apple.collect"; connectionId: string }
  | { kind: "daily"; projectId: string }
  | { kind: "deliver"; deliveryId: string };
export type DeliveryOutcome =
  | { status: "accepted"; providerId?: string }
  | { status: "retry"; afterSeconds: number; code: string }
  | { status: "failed" | "uncertain"; code: string };
export interface SecretBox {
  seal(value: unknown, context: string): Promise<string>;
  open<T>(value: string, context: string): Promise<T>;
}
export interface EmailTransport {
  send(message: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
    unsubscribeUrl?: string;
  }): Promise<DeliveryOutcome>;
}
export interface Channel {
  send(
    address: string,
    notification: Notification,
    idempotencyKey: string,
    unsubscribeUrl?: string,
  ): Promise<DeliveryOutcome>;
}
export interface AccountSource {
  collect(
    accessToken: string,
    projectRef: string,
    cursor: Cursor,
    until: string,
  ): Promise<AccountEvent[]>;
}
export interface ReportSource {
  report(
    credentials: AppleCredentials,
    date: string,
  ): Promise<DownloadMetric[] | null>;
}
export type AppleCredentials = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  vendorNumber: string;
};
export type SupabaseTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function assert(
  condition: unknown,
  code: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(code, status);
}
