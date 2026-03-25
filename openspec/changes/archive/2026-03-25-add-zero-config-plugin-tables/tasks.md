## 1. Schema Helper

- [x] 1.1 Add a zero-config `pluginTable()` helper in `packages/db` that derives prefixed table names from a build-time plugin id constant.
- [x] 1.2 Auto-inject `organizationId`, `aclTags`, and `denyTags` in the helper while preserving standard Drizzle `pgTable` behavior.
- [x] 1.3 Export the helper from `@wordrhyme/db` and document failure behavior when plugin id is unavailable.

## 2. Build Integration

- [x] 2.1 Update plugin server build configs to read `manifest.json` and inject `__WR_PLUGIN_ID__` for schema files.
- [x] 2.2 Ensure `shop` schema loading paths (including drizzle config) can resolve the same plugin id constant during migration generation.

## 3. Example Adoption

- [x] 3.1 Migrate `plugins/shop/src/shared/schema.ts` to `pluginTable()` without changing logical column names.
- [x] 3.2 Verify affected router/schema imports still type-check and update any tests or references impacted by the helper adoption.

## 4. Documentation

- [x] 4.1 Update plugin development docs to require the unified plugin table helper instead of raw `pgTable`.
- [x] 4.2 Document that SQL migrations remain the only runtime schema authority.
