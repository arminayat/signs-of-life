import type {
  MonitorKind,
  ProviderAdapter,
} from "../../../core/src/monitoring";
import type { Http } from "../http";
import { authSource } from "./auth-sources";
import { stripe } from "./stripe";
import { polar } from "./polar";
import { paddle } from "./paddle";
import { revenuecat } from "./revenuecat";
import { posthog } from "./posthog";
import { ga4 } from "./ga4";
export function monitorAdapter(
  kind: MonitorKind,
  http: Http,
  allowedHosts: string[] = [],
): ProviderAdapter {
  switch (kind) {
    case "stripe":
      return stripe(http);
    case "polar":
      return polar(http);
    case "paddle":
      return paddle(http);
    case "revenuecat":
      return revenuecat(http);
    case "posthog":
      return posthog(http);
    case "ga4":
      return ga4(http);
    default:
      return authSource(kind, http, allowedHosts);
  }
}
