# Change: Add Cromwell-Inspired CMS Enhancements

## Why

WordRhyme has a strong technical foundation (Drizzle/tRPC/MF2.0/CASL) but lacks several **product-level capabilities** that mature CMS platforms like Cromwell CMS provide. These gaps limit WordRhyme to a "developer-only tool" rather than a platform usable by both developers and content operators.

After deep analysis of Cromwell CMS's architecture, documentation, and source code, we identified capabilities that can be adopted without compromising WordRhyme's governance contracts or architectural principles.

## What Changes

### 1. Custom Data System (Custom Fields + Custom Entities)
- Admin GUI for adding custom fields to any entity (text, select, image, gallery, color, rich-text)
- Admin GUI for creating custom entity types (like WordPress Custom Post Types)
- Per-entity meta tables (avoid single-table bloat)
- Plugin API for programmatic field/entity registration
- tRPC endpoints for CRUD on custom entities with meta filtering/sorting

### 2. Admin Widget Slot System
- Standardized extension points (Slots) in Admin UI: `dashboard`, `entity.actions`, `settings.tab`, `entity.sidebar`
- Plugin registration API: `registerWidget(slot, component)`
- Host renders `<PluginSlot name="..." />` at each extension point
- Slots are declarable in plugin manifest

### 3. Plugin Settings Layout Framework
- `PluginSettingsLayout` component in `@wordrhyme/plugin-api` for consistent plugin settings UI
- Instance-level settings scope (`plugin_instance_{blockId}`) for multi-placement scenarios
- Render-props pattern: `({ settings, changeSetting }) => JSX`
- Deferred save (in-memory until explicit save action)

### 4. Simplified Hook Registration API
- Convenience API on PluginContext: `ctx.hooks.on(eventName, handler)` / `ctx.hooks.emit(eventName, payload)`
- Auto-namespacing: plugin hooks prefixed with `plugin:{pluginId}:`
- Custom inter-plugin events (fire + subscribe)
- Maps to existing EVENT_HOOK_GOVERNANCE Side-Effect hooks

### 5. Plugin Safe Reload with Health Check
- After Rolling Reload, Manager sends health-check probe to new instances
- Health check failure triggers automatic rollback (revert to previous plugin state)
- Failed plugin marked as `crashed`, audit log entry created
- Zero downtime guaranteed in both success and failure paths

### 6. Data Import/Export Tool
- Platform-level Admin page for bulk data import/export
- Supported formats: CSV, JSON, Excel (.xlsx)
- Schema-aware templates (auto-generated from Drizzle table definitions)
- All import operations recorded in audit log
- Tenant-scoped (cannot import cross-tenant data)

## Impact

- Affected specs: `plugin-api`, `admin-ui-host`, `database-schema`, `plugin-runtime`
- Affected code:
  - `packages/plugin/src/` (Plugin API extensions)
  - `apps/admin/src/components/` (Widget Slot system, PluginSettingsLayout)
  - `apps/admin/src/pages/platform/` (Custom Data management, Data Migration)
  - `apps/server/src/db/schema/` (meta tables, custom entity tables)
  - `apps/server/src/trpc/routers/` (custom-data router, import-export router)
  - `apps/server/src/plugins/` (hook convenience API, health check)
- No breaking changes to existing contracts
- All additions comply with PLUGIN_CONTRACT.md and SYSTEM_INVARIANTS.md
