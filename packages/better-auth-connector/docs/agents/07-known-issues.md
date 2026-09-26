# Connector known issues

## Implemented today

- **Resolved/covered:** equal timestamps skipped or returned empty → single-field ordering and the memory adapter comparing Date equality by object identity → use paired gte/lte timestamp predicates and ID-ordered boundary pages → retain mapped-adapter tied-timestamp tests.
- **Active coverage limit:** deleted accounts are absent from history, and accounts deleted between polls can be missed → current-user read model → no reconstruction workaround; label historical coverage incomplete.
- **Active acceptance boundary:** only Better Auth 1.7.4 is tested automatically; no live customer installation is verified. Never infer broader compatibility from compilation.

- **Resolved:** old dist/src artifacts leaked into a pack after changing rootDir → compiler does not remove obsolete output → build now clears only generated dist before compiling; pack contains JS/declarations, README and LICENSE.
