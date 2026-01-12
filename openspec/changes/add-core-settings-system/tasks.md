## 0. Audit System (Foundation)

- [x] 0.1 Create `audit_events` table (generic audit log)
- [x] 0.2 Add indexes for common queries (entity_type, tenant_id, actor_id, time)
- [x] 0.3 Create `AuditService` class with `log()` and `query()` methods
- [x] 0.4 Integrate with AsyncLocalStorage for automatic actor context
- [x] 0.5 Add retention cleanup task (90 days default)
- [ ] 0.6 Add unit tests for AuditService

## 1. Database Schema

- [x] 1.1 Create `settings` table with four-scope model (global, tenant, plugin_global, plugin_tenant)
- [x] 1.2 Create `setting_schemas` table for type validation
- [x] 1.3 Create `feature_flags` table
- [x] 1.4 Create `feature_flag_overrides` table for tenant-level overrides
- [x] 1.5 Add composite unique index with COALESCE for NULL handling
- [x] 1.6 Add indexes for common queries (scope, key, tenant_id, scope_id)
- [x] 1.7 Generate Drizzle migration
- [x] 1.8 Add Zod schemas for API validation

## 2. Encryption Service

- [x] 2.1 Create `EncryptionService` class
- [x] 2.2 Implement AES-256-GCM encrypt/decrypt methods
- [x] 2.3 Add key version support for rotation (keyVersion field)
- [x] 2.4 Parse `SETTINGS_ENCRYPTION_KEYS` JSON env variable
- [x] 2.5 Implement key selection based on version
- [x] 2.6 Add re-encryption utility for key rotation
- [x] 2.7 Add unit tests for encryption

## 3. Settings Service (Core)

- [x] 3.1 Create `SettingsService` class
- [x] 3.2 Implement `get(scope, key, options)` with cascade resolution:
  - [x] 3.2.1 Core cascade: tenant → global → default
  - [x] 3.2.2 Plugin cascade: plugin_tenant → plugin_global → null
- [x] 3.3 Implement `set(scope, key, value, options)` with encryption support
- [x] 3.4 Implement `delete(scope, key, options)`
- [x] 3.5 Implement `list(scope, options)` with filtering
- [x] 3.6 Integrate schema validation (find schema, validate, record version)
- [x] 3.7 Add audit logging on all mutations
- [ ] 3.8 Add unit tests for Settings Service

## 4. Caching Layer

- [x] 4.1 Implement two-level cache (memory + Redis)
- [x] 4.2 Add cache read logic (memory → Redis → DB)
- [x] 4.3 Add write-through invalidation
- [x] 4.4 Implement Redis Pub/Sub for cluster-wide invalidation
- [x] 4.5 Add TTL configuration (memory: 1min, Redis: 5min)
- [ ] 4.6 Add unit tests for caching

## 5. Feature Flags Service

- [x] 5.1 Create `FeatureFlagService` class
- [x] 5.2 Implement `check(key, context)` with evaluation logic:
  - [x] 5.2.1 Check tenant override first
  - [x] 5.2.2 Evaluate conditions
  - [x] 5.2.3 Calculate rollout percentage (murmurhash)
- [x] 5.3 Implement `list()` for admin
- [x] 5.4 Implement `create/update/delete` for admin
- [x] 5.5 Implement `setOverride(key, tenantId, config)`
- [x] 5.6 Add condition evaluation logic (user_role, tenant_plan, user_id, percentage)
- [x] 5.7 Add audit logging for flag changes
- [ ] 5.8 Add unit tests for Feature Flags

## 6. Settings Module

- [x] 6.1 Create `SettingsModule` NestJS module
- [x] 6.2 Register SettingsService, FeatureFlagService, EncryptionService
- [x] 6.3 Configure Redis Pub/Sub subscription
- [x] 6.4 Export services for other modules
- [x] 6.5 Add module to AppModule

## 7. tRPC API

- [x] 7.1 Create `settingsRouter`:
  - [x] 7.1.1 `settings.get` - Get setting value (with permission check)
  - [x] 7.1.2 `settings.set` - Set setting value (admin)
  - [x] 7.1.3 `settings.delete` - Delete setting (admin)
  - [x] 7.1.4 `settings.list` - List settings (admin)
- [x] 7.2 Create `featureFlagsRouter`:
  - [x] 7.2.1 `featureFlags.check` - Check if flag enabled
  - [x] 7.2.2 `featureFlags.list` - List all flags (admin)
  - [x] 7.2.3 `featureFlags.create` - Create flag (admin)
  - [x] 7.2.4 `featureFlags.update` - Update flag (admin)
  - [x] 7.2.5 `featureFlags.delete` - Delete flag (admin)
  - [x] 7.2.6 `featureFlags.setOverride` - Set tenant override (admin)
  - [x] 7.2.7 `featureFlags.removeOverride` - Remove tenant override (admin)
- [x] 7.3 Add routers to main router

## 8. Permission Integration

- [x] 8.1 Define capabilities in permission registry:
  - `settings:read:global`
  - `settings:write:global`
  - `settings:read:tenant`
  - `settings:write:tenant`
  - `feature-flags:read`
  - `feature-flags:manage`
  - `feature-flags:override:tenant`
- [x] 8.2 Add permission middleware to tRPC procedures
- [x] 8.3 Update role definitions (super-admin, tenant-admin)
- [ ] 8.4 Add permission tests

## 9. Plugin API Integration

- [ ] 9.1 Extend `PluginContext` interface with `settings` property
- [ ] 9.2 Implement `PluginSettingsAPI` wrapper:
  - [ ] 9.2.1 Auto-prefix keys with `plugin:{pluginId}:`
  - [ ] 9.2.2 Restrict access to own namespace only
  - [ ] 9.2.3 Support tenant-level plugin settings
- [ ] 9.3 Update PluginManager to inject settings API
- [ ] 9.4 Add cleanup logic on plugin uninstall
- [ ] 9.5 Add integration tests

## 10. Schema Registry

- [x] 10.1 Implement schema registration API
- [x] 10.2 Implement wildcard pattern matching
- [x] 10.3 Add built-in schemas for common settings (email.*, etc.)
- [ ] 10.4 Add schema migration utility
- [x] 10.5 Add tests for schema validation

## 11. Admin UI

- [x] 11.1 Create Settings page component
- [x] 11.2 Add settings list/edit functionality
- [x] 11.3 Add encrypted field masking
- [x] 11.4 Create Feature Flags page component
- [x] 11.5 Add flag list/toggle functionality
- [x] 11.6 Add tenant override management UI

## 12. Documentation & Testing

- [x] 12.1 Create SETTINGS_SYSTEM.md documentation
- [x] 12.2 Add API documentation with examples (in CORE_SETTINGS_SYSTEM.md)
- [ ] 12.3 Write integration tests for full flow
- [ ] 12.4 Add example plugin using settings
- [x] 12.5 Document encryption key management (in CORE_SETTINGS_SYSTEM.md)
- [x] 12.6 Create User Guide (CORE_SETTINGS_GUIDE.md)

---

## Summary

**Completed**: 64/77 tasks (83%)

**Remaining**:
- Unit tests for AuditService, Settings Service, Caching, Feature Flags (4 tasks)
- Permission tests (1 task)
- Plugin API Integration (5 tasks) - deferred to plugin system enhancement
- Schema migration utility (1 task)
- Integration tests and example plugin (2 tasks)

**Core functionality is complete and operational.**
