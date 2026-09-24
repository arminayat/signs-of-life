# Jobs runtime integrations

## Implemented today

DATABASE Hyperdrive and JOBS Queue are direct runtime integrations; Node uses DATABASE_URL without Queues. Provider calls occur only through backend Services.
See packages/backend/docs/agents/operations.md for environment names and packages/adapters/docs/agents/integrations.md for provider auth/failures. Secrets are runtime inputs, never browser variables. Root fixture tests substitute provider calls; a bundle dry run verifies packaging only.
