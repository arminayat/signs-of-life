# Connector integrations

## Implemented today

Better Auth is the only runtime integration: its adapter abstracts database/model mappings and its endpoint router hosts the plugin. The host supplies dedicated tokens and optional app name. No hosted Signs of Life credential, customer session secret, email or browser instrumentation is needed.

Signs of Life connects using the existing auth base URL and a dedicated token. Its installation operator must allowlist the public HTTPS hostname. TLS, network safety, polling, hashing, scheduling and encrypted credential storage belong to Signs of Life adapters/backend, not this package. Apply normal application rate limits to the endpoint.
