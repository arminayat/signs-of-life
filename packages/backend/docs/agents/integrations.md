# Backend integration ownership

## Implemented today

Backend owns integration lifecycle and setup orchestration; packages/adapters/docs/agents/integrations.md owns wire formats, normalization and send outcomes.
services.ts builds the monitoring callback URL, checks active connections, decrypts tokens and coordinates refresh leases. routes-integrations.ts owns one-use project-bound OAuth state and synchronous Apple credential validation. compose.ts installs source factories and configured channels; authentication.ts selects platform login.
routes-destinations.ts creates verification/test jobs; routes-public.ts validates Telegram/Resend callbacks. Provider calls can occur during connection/catalog HTTP requests as well as background execution.
Root tests/helpers.ts injects fake providers/auth/channels with real PostgreSQL; these never establish hosted provider acceptance.

## Implemented today — monitoring providers

Ten additional adapters are composed through monitoring-access.ts; provider protocols live in adapters/monitoring. Setup permissions, OAuth registration/callbacks, webhook subscriptions and coverage are in root docs/monitoring-integrations.md. Better Auth monitoring concerns the customer server plugin, never Signs of Life login. No live provider acceptance is implied by fixtures.
