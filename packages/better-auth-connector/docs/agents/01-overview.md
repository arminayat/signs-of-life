# Better Auth connector overview

## Implemented today

A distributable server plugin for account-creation monitoring of customer applications. signsOfLife() installs one authenticated read endpoint through the existing Better Auth router. Signs of Life polls it with a dedicated token and hashes account IDs on ingestion. The plugin adds no tables, writes, Auth hooks or browser code. Operator login in Signs of Life is independent.

## Planned/aspirational

Package publication and real customer acceptance have not occurred. Additional Better Auth versions require explicit compatibility tests.
