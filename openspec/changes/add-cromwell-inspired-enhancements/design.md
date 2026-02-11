# Design: Cromwell-Inspired CMS Enhancements

## Context

WordRhyme is a Contract-First Headless CMS with strong governance but limited product-level features for non-developer users. Cromwell CMS provides a proven reference for Custom Data, Widget Slots, and Plugin DX patterns that can be adapted to WordRhyme's architecture without violating frozen contracts.

**Stakeholders**: Plugin developers, Admin panel users (content operators), Core maintainers

**Constraints**:
- MUST comply with SYSTEM_INVARIANTS.md and PLUGIN_CONTRACT.md
- MUST maintain multi-tenant isolation
- Plugins CANNOT modify Core tables
- All data tenant-scoped
- No runtime hot-swapping

## Goals / Non-Goals

**Goals**:
- Enable content operators to extend data models without developer intervention
- Provide standardized Admin UI extension points for plugins
- Simplify plugin settings DX with consistent UI framework
- Make hook registration as simple as 3 lines of code
- Ensure zero-downtime plugin updates even on failure

**Non-Goals**:
- Visual page builder (P2, separate proposal)
- Theme system / frontend rendering layer (separate concern)
- E-commerce toolkit (separate proposal if needed)
- EditorJS integration (separate proposal)
- GraphQL API (WordRhyme uses tRPC)

## Decisions

### Decision 1: Per-Entity Meta Tables (not single meta table)

**What**: Each entity gets its own `{entity}_meta` table instead of a single `custom_meta` table.

**Why**: Cromwell learned from WordPress's `wp_postmeta` single-table bloat problem. Per-entity meta tables scale better and allow entity-specific indexes.

**Alternatives considered**:
- Single `custom_meta` table (WordPress approach) — rejected: query performance degrades at scale
- JSONB column on entity table — rejected: cannot index/sort individual fields efficiently

### Decision 2: Widget Slots via Manifest Declaration (not runtime registration)

**What**: Plugins declare Widget Slots in `manifest.json`, Core collects at startup.

**Why**: Aligns with WordRhyme's "startup-only loading" principle. Cromwell's `registerWidget()` is runtime, which conflicts with our Rolling Reload model.

**Alternatives considered**:
- Runtime `registerWidget()` calls (Cromwell approach) — rejected: conflicts with startup-only loading
- Convention-based discovery (export named components) — rejected: too implicit, hard to validate

### Decision 3: Hook Convenience API as Core-Mediated Wrapper

**What**: `ctx.hooks.on()` / `ctx.hooks.emit()` are thin wrappers over existing Hook system. Plugins can only subscribe to and emit **Core-registered events** with defined schemas. Manifest must declare `events.subscribe`/`events.emit`.

**Why**: EVENT_HOOK_GOVERNANCE §7.1 allows Core-mediated events but prohibits arbitrary cross-plugin communication. This preserves Core as the event owner while improving plugin DX.

**Alternatives considered**:
- Open plugin event bus (any plugin defines events) — rejected: violates EVENT_HOOK_GOVERNANCE §7 Hard Ban on implicit dependencies
- New event bus system — rejected: duplicates existing hooks, violates simplicity principle
- Decorator-based hooks (`@OnEvent('name')`) — rejected: requires class-based plugins, too opinionated

### Decision 4: Health Check Probe via HTTP (not process-level)

**What**: After Rolling Reload, send HTTP health check to `/api/health` on new instances.

**Why**: HTTP probe is language-agnostic, testable, and works with PM2's existing lifecycle.

**Alternatives considered**:
- PM2 `--wait-ready` with `process.send('ready')` — viable but less observable
- TCP port check — too shallow, doesn't verify plugin loading

### Decision 5: Import/Export as Platform Feature (not plugin)

**What**: Data Import/Export is a Core platform feature at `pages/platform/DataMigration.tsx`.

**Why**: It needs direct DB access across all entity types, which violates plugin data isolation rules.

**Alternatives considered**:
- Plugin-based import/export — rejected: would need Core data access (violates PLUGIN_CONTRACT)
- CLI-only tool — rejected: content operators need GUI

## Data Model

### Custom Field Registry (`custom_field_definitions`)
```
id: uuid PK
entity_type: varchar — target entity (e.g., 'product', 'post', 'custom:{type}')
field_key: varchar — unique per entity_type
field_label: varchar
field_type: enum('text', 'richtext', 'select', 'image', 'gallery', 'color')
field_options: jsonb — select options, validation rules, etc.
sort_order: int
organization_id: varchar FK — tenant scope
created_at, updated_at: timestamp
UNIQUE(entity_type, field_key, organization_id)
```

### Custom Entity Types (`custom_entity_types`)
```
id: uuid PK
entity_type: varchar UNIQUE per org — e.g., 'movie'
list_label: varchar — 'Movies'
entity_label: varchar — 'Movie'
icon: varchar — sidebar icon
organization_id: varchar FK
source: varchar nullable — plugin ID if registered by plugin
created_at, updated_at: timestamp
```

### Entity Meta Tables (`{entity}_meta`)
```
id: uuid PK
entity_id: varchar FK — references parent entity
meta_key: varchar
meta_value: text
organization_id: varchar FK
INDEX(entity_id, meta_key)
INDEX(meta_key, meta_value(255)) — for search/sort
```

### Custom Entities (`custom_entities`)
```
id: uuid PK
entity_type: varchar — FK to custom_entity_types
slug: varchar
name: varchar
organization_id: varchar FK
created_by: varchar FK
created_at, updated_at: timestamp
```

### Widget Slot Registration (in manifest.json, no DB table)
```json
{
  "admin": {
    "widgets": [
      {
        "slot": "dashboard",
        "component": "DashboardWidget",
        "options": { "w": 4, "h": 2 }
      },
      {
        "slot": "entity.actions.product",
        "component": "ProductSeoAction"
      }
    ]
  }
}
```

## Risks / Trade-offs

- **Risk**: Custom fields with meta tables add JOIN complexity to queries
  - **Mitigation**: Use JSONB aggregation for read-heavy paths; meta tables for write/search
- **Risk**: Widget Slots in manifest means plugins can't dynamically register widgets
  - **Mitigation**: Acceptable trade-off for startup-only loading principle; covers 95% of use cases
- **Risk**: Health check probe adds latency to Rolling Reload
  - **Mitigation**: 3-second timeout with 2 retries; total max 9 seconds added to reload cycle
- **Risk**: Import/Export could be used to inject malicious data
  - **Mitigation**: All imports go through existing validation (Zod schemas) and permission checks

## Migration Plan

1. Add new DB tables via Drizzle migration (non-breaking, additive)
2. Add tRPC routers for custom-data CRUD
3. Add Widget Slot system to Admin host
4. Extend `@wordrhyme/plugin-api` with convenience APIs
5. Add health check to PM2 reload flow
6. Add Import/Export platform page

**Rollback**: All changes are additive. Rollback = revert migration + remove new files.

## Open Questions

1. Should custom entity meta support binary data (files/images) or only text serialization?
2. Maximum number of custom fields per entity? (Suggest: 50 per entity per organization)
3. Should Import/Export support streaming for large datasets (>10k rows)?
