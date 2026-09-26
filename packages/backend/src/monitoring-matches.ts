import { AppError } from "../../core/src/model";
import type { Observation } from "../../core/src/monitoring";
import type { Source } from "../../core/src/store";
import type { Services } from "./services";
import { adapterFor, monitoringCredentials } from "./monitoring-access";

// Authenticate the referenced object against a billing account in this project.
// Amounts, dates and customer identifiers never participate in matching.
export async function verifiedMatches(
  services: Services,
  source: Source,
  events: Observation[],
) {
  if (!events.some((e) => e.candidate)) return events;
  const snapshot = await services.store.snapshot(
    source.workspaceId,
    source.projectId,
  );
  const cache = new Map<string, Observation[]>();
  const result: Observation[] = [];
  for (const event of events) {
    const refs = new Map<string, Observation>();
    if (event.candidate)
      for (const entry of snapshot.connections) {
        if (
          !entry.active ||
          entry.projectId !== source.projectId ||
          entry.kind !== event.candidate.provider
        )
          continue;
        const connection = await services.store.connection(
          source.workspaceId,
          entry.id,
        );
        if (!connection?.active) continue;
        const key = `${connection.id}:${event.candidate.object}`;
        let matches = cache.get(key);
        if (!matches) {
          const credentials = await monitoringCredentials(services, connection);
          try {
            matches = await adapterFor(services, event.candidate.provider)
              .lookup!(credentials, event.candidate.object);
          } catch (error) {
            if (
              !(error instanceof AppError) ||
              ![
                "provider_reconnect_required",
                "provider_permission_denied",
                "provider_http_404",
              ].includes(error.code)
            )
              throw error;
            matches = [];
          }
          cache.set(key, matches);
        }
        for (const match of matches)
          if (
            match.reference &&
            match.environment === event.environment &&
            match.kind === event.kind
          )
            refs.set(JSON.stringify(match.reference), match);
      }
    const match = refs.size === 1 ? [...refs.values()][0] : undefined;
    result.push(
      match
        ? {
            ...event,
            reference: match.reference,
            amount: match.amount,
            currency: match.currency,
            occurredAt: match.occurredAt,
          }
        : event,
    );
  }
  return result;
}
