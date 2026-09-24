# Security

Please report vulnerabilities privately through the repository's GitHub security reporting feature when enabled. Do not publish credentials, private reports or customer data in issues. If private reporting is unavailable, open an issue requesting a private contact without including exploit details.

Operators should keep the database on a private network where possible, use TLS for public endpoints, keep `signs_of_life` and `signs_of_life_identity` out of exposed Data API schemas, restrict database roles, back up encryption keys separately, and apply dependency updates after verification. Do not use local test hosts or fixture identities in production.

Signs of Life uses no application telemetry by default. Platform providers can collect infrastructure logs according to their own settings. Configure log retention and access for your installation.
