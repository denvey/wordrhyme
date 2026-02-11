## 1. Custom Data System

- [ ] 1.1 Create Drizzle schema for `custom_field_definitions`, `custom_entity_types`, `custom_entities` tables
- [ ] 1.2 Create per-entity meta table pattern (`product_meta`, `post_meta`, `custom_entity_meta`)
- [ ] 1.3 Create tRPC router `custom-data.ts` with CRUD for field definitions, entity types, and entity instances
- [ ] 1.4 Implement meta-aware query helpers (filter/sort by meta key-value pairs)
- [ ] 1.5 Add Admin page `pages/platform/CustomData.tsx` for managing field definitions and entity types
- [ ] 1.6 Add dynamic field rendering on entity edit pages (read field definitions, render appropriate input)
- [ ] 1.7 Add dynamic column support on entity list pages (custom fields as sortable/filterable columns)
- [ ] 1.8 Write tests for custom data CRUD and meta query helpers

## 2. Admin Widget Slot System

- [ ] 2.1 Define Widget Slot types and registry interface in `@wordrhyme/plugin-api`
- [ ] 2.2 Extend `manifest.json` schema with `admin.widgets` array (slot, component, options)
- [ ] 2.3 Implement `PluginSlot` React component in Admin host that renders registered widgets
- [ ] 2.4 Add `PluginSlot` to Dashboard page (`slot: "dashboard"`)
- [ ] 2.5 Add `PluginSlot` to entity action bars (`slot: "entity.actions.{entityType}"`)
- [ ] 2.6 Add `PluginSlot` to Settings page tabs (`slot: "settings.tab"`)
- [ ] 2.7 Collect widget declarations from manifests at server startup and expose via tRPC
- [ ] 2.8 Write tests for slot registration and rendering

## 3. Plugin Settings Layout Framework

- [ ] 3.1 Create `PluginSettingsLayout` component in `@wordrhyme/plugin-api` (render-props pattern)
- [ ] 3.2 Implement deferred-save state management (in-memory changes until explicit save)
- [ ] 3.3 Add `plugin_instance` scope to Settings service for instance-level settings
- [ ] 3.4 Document usage pattern with example plugin settings page
- [ ] 3.5 Write tests for PluginSettingsLayout save/load cycle

## 4. Simplified Hook Registration API

- [ ] 4.1 Add `ctx.hooks.on(eventName, handler)` convenience method to PluginContext
- [ ] 4.2 Add `ctx.hooks.emit(eventName, payload)` for custom inter-plugin events
- [ ] 4.3 Implement auto-namespacing: `ctx.hooks.emit('myEvent')` → `plugin:{pluginId}:myEvent`
- [ ] 4.4 Add built-in event names enum for discoverability (e.g., `entity:post:afterUpdate`)
- [ ] 4.5 Write tests for hook registration, namespacing, and cross-plugin events

## 5. Plugin Safe Reload with Health Check

- [ ] 5.1 Add `/api/health` endpoint that reports plugin loading status
- [ ] 5.2 Implement health-check probe in PM2 reload flow (HTTP GET with timeout)
- [ ] 5.3 Implement automatic rollback on health-check failure (revert plugin state, mark as `crashed`)
- [ ] 5.4 Add audit log entry for reload success/failure
- [ ] 5.5 Write tests for health check and rollback scenarios

## 6. Data Import/Export Tool

- [ ] 6.1 Create tRPC router `import-export.ts` with export (CSV/JSON/Excel) and import endpoints
- [ ] 6.2 Implement schema-aware export template generation (from Drizzle table definitions)
- [ ] 6.3 Implement import pipeline: parse → validate (Zod) → insert with tenant-scoping
- [ ] 6.4 Add Admin page `pages/platform/DataMigration.tsx` with table selection, format picker, upload UI
- [ ] 6.5 Record all import operations in audit log (who, when, what table, row count)
- [ ] 6.6 Write tests for import validation, tenant isolation, and export correctness
