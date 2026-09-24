# Backend data contracts

## Implemented today

Physical schema/migrations belong to packages/db/docs/agents/data-model.md; domain record types belong to packages/core/src/store.ts.

- User identity is issuer+subject → application user → one owner workspace; email is not an identity join key.
- Project carries enabled, timezone, dailyTime and destination routing. enabled pauses notification fanout/send, not collector observation.
- Connection owns encrypted credentials; new connections have a project; null projectId is the migrated shared exception. Source carries external app/project ID, baseline/cursor.
- Delivery is durable per destination/key, separate from its job and provider outcome. Accepted, failed, uncertain and cancelled stop sends. Verification deliveries can target unverified destinations.
- Jobs contain one of supabase.collect/sourceId, apple.collect/connectionId, daily/projectId, deliver/deliveryId. Database lease token fences completion.
- Snapshot removes ciphertext, refresh leases and unsubscribe hash and redacts verification text. Its project variant restricts delivery history, not every workspace array. Overview uses uncapped aggregation separate from snapshot feed limits.
