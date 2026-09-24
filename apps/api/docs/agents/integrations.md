# API runtime integrations

## Implemented today

DATABASE Hyperdrive connects Cloudflare to PostgreSQL; the web API service binding is the ingress. Node uses DATABASE_URL. Auth/source/channel adapters are instantiated by backend.
See packages/backend/docs/agents/operations.md for environment names and packages/adapters/docs/agents/integrations.md for provider auth/failures. Secrets are runtime inputs, never browser variables. Root fixture tests substitute provider calls; a bundle dry run verifies packaging only.
