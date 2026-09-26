# Connector conventions

## Implemented today

Read through ctx.context.adapter with logical model user and logical fields id/createdAt/isAnonymous so configured model mappings work. Select only needed fields. Use bounded pages and stable ties; never use customer email or arbitrary metadata. A timestamp-sorted batch re-reads its final timestamp sorted by ID because the adapter exposes only one sort field.

Keep source framework-neutral beyond Better Auth; no Node-only runtime dependencies, hooks or customer schema additions. Exclude auth headers/responses from logs. Test additional supported peer versions before widening the package constraint.
