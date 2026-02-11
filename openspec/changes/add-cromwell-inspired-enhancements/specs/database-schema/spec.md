## ADDED Requirements

> **Ownership Note**: The Custom Data System (custom_field_definitions, custom_entity_types, per-entity meta tables, custom_entities) is a **Core-owned feature**, not a plugin feature. These tables are part of Core's database schema. Plugins MAY register fields/entities via the `source` column (tracked for cleanup on uninstall), but the tables themselves belong to Core and are governed by DATA_MODEL_GOVERNANCE.md.

### Requirement: Custom Field Definitions Table

The database schema SHALL include a `custom_field_definitions` table for storing dynamic field definitions that can be attached to any entity type. Fields SHALL be tenant-scoped and support multiple field types.

```sql
custom_field_definitions (
  id            uuid PK,
  entity_type   varchar NOT NULL,   -- 'product', 'post', 'custom:{type}'
  field_key     varchar NOT NULL,
  field_label   varchar NOT NULL,
  field_type    varchar NOT NULL,   -- 'text','richtext','select','image','gallery','color'
  field_options jsonb,              -- select options, validation, defaults
  sort_order    int DEFAULT 0,
  source        varchar,            -- plugin ID if registered by plugin, NULL if user-created
  organization_id varchar NOT NULL FK,
  created_at    timestamp,
  updated_at    timestamp,
  UNIQUE(entity_type, field_key, organization_id)
)
```

#### Scenario: Custom field definition created
- **WHEN** an admin creates a custom field with key "brand" for entity type "product"
- **THEN** a row is inserted into `custom_field_definitions`
- **AND** the field is scoped to the current organization
- **AND** the unique constraint prevents duplicate keys per entity type per org

#### Scenario: Plugin-sourced field definition
- **WHEN** a plugin registers a custom field with `source = 'com.vendor.seo'`
- **THEN** the field is stored with `source` set to the plugin ID
- **AND** the field cannot be deleted by the admin while the plugin is installed

---

### Requirement: Custom Entity Types Table

The database schema SHALL include a `custom_entity_types` table for storing user-defined or plugin-defined entity types. Each entity type SHALL generate a sidebar link in the Admin panel.

```sql
custom_entity_types (
  id              uuid PK,
  entity_type     varchar NOT NULL,   -- e.g., 'movie'
  list_label      varchar NOT NULL,   -- 'Movies'
  entity_label    varchar NOT NULL,   -- 'Movie'
  icon            varchar,            -- sidebar icon identifier
  source          varchar,            -- plugin ID or NULL
  organization_id varchar NOT NULL FK,
  created_at      timestamp,
  updated_at      timestamp,
  UNIQUE(entity_type, organization_id)
)
```

#### Scenario: Custom entity type created
- **WHEN** an admin creates entity type "movie" with list label "Movies"
- **THEN** a row is inserted into `custom_entity_types`
- **AND** a "Movies" link appears in the Admin sidebar under a "Custom" section

#### Scenario: Custom entity type uniqueness enforced
- **WHEN** an admin tries to create entity type "movie" that already exists for the same org
- **THEN** the database unique constraint prevents duplication
- **AND** an error message is shown: "Entity type 'movie' already exists"

---

### Requirement: Per-Entity Meta Tables

The database schema SHALL use per-entity meta tables for storing custom field values. Each default entity (product, post) SHALL have its own `{entity}_meta` table. Custom entities SHALL share a single `custom_entity_meta` table.

```sql
-- Pattern for each core entity
product_meta (
  id              uuid PK,
  entity_id       varchar NOT NULL FK references products(id),
  meta_key        varchar NOT NULL,
  meta_value      text,
  organization_id varchar NOT NULL FK,
  INDEX(entity_id, meta_key),
  INDEX(meta_key, meta_value(255))   -- prefix index for search/sort
)

-- Shared table for custom entities
custom_entity_meta (
  id              uuid PK,
  entity_id       varchar NOT NULL FK references custom_entities(id),
  meta_key        varchar NOT NULL,
  meta_value      text,
  organization_id varchar NOT NULL FK,
  INDEX(entity_id, meta_key),
  INDEX(meta_key, meta_value(255))
)
```

#### Scenario: Meta value stored for product
- **WHEN** a user sets custom field "brand" = "Nike" on product "shoe-1"
- **THEN** a row is inserted into `product_meta` with entity_id = "shoe-1", meta_key = "brand", meta_value = "Nike"
- **AND** the value is scoped to the current organization

#### Scenario: Meta query with filtering
- **WHEN** an admin filters products by custom field "brand" = "Nike"
- **THEN** the query JOINs `product_meta` on entity_id and meta_key = "brand"
- **AND** filters by meta_value = "Nike"
- **AND** the prefix index enables efficient lookups

#### Scenario: Meta query with sorting
- **WHEN** an admin sorts products by custom field "brand" ascending
- **THEN** the query JOINs `product_meta` and ORDER BY meta_value ASC
- **AND** products without the "brand" field appear last (NULL sorting)

---

### Requirement: Custom Entities Table

The database schema SHALL include a `custom_entities` table for storing instances of user-defined entity types.

```sql
custom_entities (
  id              uuid PK,
  entity_type     varchar NOT NULL,   -- FK to custom_entity_types.entity_type
  slug            varchar NOT NULL,
  name            varchar NOT NULL,
  organization_id varchar NOT NULL FK,
  created_by      varchar FK,
  created_at      timestamp,
  updated_at      timestamp,
  UNIQUE(entity_type, slug, organization_id)
)
```

#### Scenario: Custom entity instance created
- **WHEN** an admin creates a "movie" entity with name "Inception" and slug "inception"
- **THEN** a row is inserted into `custom_entities`
- **AND** the entity is scoped to the current organization
- **AND** custom field values are stored in `custom_entity_meta`
