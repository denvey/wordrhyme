## ADDED Requirements

> **Ownership Note**: The page builder modification storage is a **Core-owned feature**. The `page_block_modifications` table belongs to Core's database schema, not to any plugin. Plugins contribute block types via manifest declarations, but block modification persistence is managed by Core.

### Requirement: Page Block Modifications Table

The database schema SHALL include a `page_block_modifications` table for persisting user-layer block modifications made in the page builder editor. Each row represents a single block's modification delta relative to the source/author layer.

```sql
page_block_modifications (
  id              uuid PK,
  page_id         varchar NOT NULL,        -- page identifier
  block_id        varchar NOT NULL,        -- block unique ID within page
  block_type      varchar NOT NULL,        -- 'container','text','image','html','gallery','plugin'
  modification    jsonb NOT NULL,          -- delta: style overrides, content changes, reorder
  is_deleted      boolean DEFAULT false,   -- soft-delete flag
  is_virtual      boolean DEFAULT false,   -- true if block was created in editor (not in source)
  organization_id varchar NOT NULL FK,
  created_by      varchar FK,
  created_at      timestamp,
  updated_at      timestamp,
  UNIQUE(page_id, block_id, organization_id)
)
```

#### Scenario: User modification persisted
- **WHEN** a user modifies block "hero_text" style in the page builder editor
- **THEN** a row is upserted into `page_block_modifications` with the style delta
- **AND** the modification is scoped to the current `organization_id`

#### Scenario: Block deletion stored as soft-delete
- **WHEN** a user deletes a source-defined block in the editor
- **THEN** the row's `is_deleted` is set to `true`
- **AND** the block can be restored by setting `is_deleted` to `false`

#### Scenario: Virtual block persisted
- **WHEN** a user creates a new block in the editor (not present in source)
- **THEN** a row is inserted with `is_virtual = true`
- **AND** the full block content is stored in `modification` JSONB

#### Scenario: Tenant isolation enforced
- **WHEN** querying block modifications for a page
- **THEN** `ScopedDb` automatically filters by the current `organization_id`
- **AND** cross-tenant access is impossible
