# Adapters internal API

## Implemented today

Exports are the factories/types/helpers in 02-surface-area.md; direct source imports are the only packaging contract. No published versioned SDK or package export map exists.
Example used by composition:

```ts
import { supabaseSource } from "../../adapters/src/supabase-source";
const accounts = supabaseSource(); // AccountSource, real fetch by default
```

Pass a fake Http to test adapters without contacting providers. source/report adapters do not persist tokens/cursors. Channels return DeliveryOutcome and do not mutate delivery rows. Authentication's methods return Responses/cookies; backend chooses its implementation.

## Implemented today — expanded monitoring

monitoring/index.ts exposes monitorAdapter. Callers provide transport and credentials, adapters return allowlisted core data. A verified Stripe lookup reads an invoice or charge within an authenticated account. Unknown references remain separate. No customer email, profile or arbitrary provider payload is returned or persisted.
