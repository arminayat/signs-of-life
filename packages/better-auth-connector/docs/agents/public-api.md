# Connector public API

## Implemented today

Import { signsOfLife } from @signs-of-life/better-auth-connector; add signsOfLife({tokens:[dedicatedToken], name:"My app"}) to the existing server plugins array. See ../../README.md for the complete setup example. Exported ESM JS/declarations are built into dist/. Version 0.1.0 is not published to a registry.

Protocol v1 returns only stable IDs, creation timestamps and anonymous status when the anonymous plugin is enabled. All cursors are range-bound; a final empty page is normal. Token rotation temporarily accepts [newToken,oldToken].
