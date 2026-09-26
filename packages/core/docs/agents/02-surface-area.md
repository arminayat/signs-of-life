# Core surface area

## Implemented today

All paths below are relative to packages/core.

| Source / interface                                                                                                                               | Inputs and behavior                                                                                                        | Effects                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| src/model.ts: SourceKind, ChannelKind, Cursor, AccountEvent, DownloadMetric, JobPayload, DeliveryOutcome, credential/identity/notification types | Discriminated source/channel/job/outcome contracts                                                                         | Types only                                           |
| SecretBox, AccountSource, ReportSource, Channel, EmailTransport                                                                                  | Encryption, normalized collection, nullable reports and delivery contracts                                                 | Interfaces only; adapter implementations perform I/O |
| AppError(code, status=400), assert(condition, code, status=400)                                                                                  | Throw typed application errors                                                                                             | No persistence                                       |
| src/store.ts: MonitorStore and record types                                                                                                      | Workspace lifecycle, snapshots, collection, deliveries, jobs, challenges, retention                                        | Interface only; implemented in packages/db           |
| src/time.ts: localDay, dailyReady, reportingDates, validTimezone, shortAccount                                                                   | IANA-zone date/time formatting; default previous seven UTC reporting dates; timezone validation; first eight ID characters | Pure computation, no persistence                     |

HTTP endpoints, CLI commands and schedules are not present in this child.

## Implemented today — expanded monitoring

monitoring.ts exports ProviderAdapter catalog/collect/definitions/metric/webhook/lookup ports and normalized decimal-string report/event shapes. provider-registry.ts exports providers/providerDefinition with authentication, resource boundaries, setup fields and supported events. monitor-store.ts defines state, atomic pages, metrics, dashboards, secret CAS and webhook inbox operations. JobPayload adds monitor.collect, monitor.metric and monitor.webhook.
