import type { Identity } from "./model";
export interface Authentication {
  enabled: boolean;
  identity(request: Request, headers: Headers): Promise<Identity | null>;
  login(request: Request): Promise<Response>;
  logout(request: Request): Promise<Response>;
  handle(request: Request): Promise<Response>;
}
