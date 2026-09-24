# Jobs runtime conventions

## Implemented today

Runtime handlers own transport/lifetime only. Queue consumer processes messages serially within the batch. Application failures are normally handled and persisted by runOne, so Queue ack does not imply successful collection/delivery.

## Planned/aspirational — maintenance rules

Keep job kinds and provider retries in core/backend; DB owns claim fencing and dispatch expiry. Preserve finally pool closure and invalid-message handling. Do not move authoritative state into Queue bodies or infer completion from Queue acceptance.
