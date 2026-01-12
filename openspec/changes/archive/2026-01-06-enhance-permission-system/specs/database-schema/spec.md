# database-schema Specification Delta

## ADDED Requirements

### Requirement: Roles Table

The database SHALL include a `roles` table for storing tenant-scoped role definitions. System roles are protected from deletion.

#### Scenario: Roles table structure
- **GIVEN** the database migration is applied
- **THEN** table `roles` exists with columns:
  - `id` (TEXT, PRIMARY KEY)
  - `organization_id` (TEXT, NOT NULL, FK to organization)
  - `name` (TEXT, NOT NULL)
  - `slug` (TEXT, NOT NULL)
  - `description` (TEXT, nullable)
  - `is_system` (BOOLEAN, NOT NULL, DEFAULT false)
  - `created_at` (TIMESTAMP, NOT NULL, DEFAULT NOW)
  - `updated_at` (TIMESTAMP, NOT NULL, DEFAULT NOW)
- **AND** UNIQUE constraint on (organization_id, slug)

#### Scenario: Role belongs to organization
- **WHEN** a role is created
- **THEN** it must have a valid `organization_id`
- **AND** deleting the organization cascades to delete its roles

---

### Requirement: Role Permissions Table

The database SHALL include a `role_permissions` table for mapping roles to capabilities.

#### Scenario: Role permissions table structure
- **GIVEN** the database migration is applied
- **THEN** table `role_permissions` exists with columns:
  - `id` (TEXT, PRIMARY KEY)
  - `role_id` (TEXT, NOT NULL, FK to roles)
  - `capability` (TEXT, NOT NULL)
  - `created_at` (TIMESTAMP, NOT NULL, DEFAULT NOW)
- **AND** UNIQUE constraint on (role_id, capability)

#### Scenario: Role deletion cascades to permissions
- **WHEN** a role is deleted
- **THEN** all `role_permissions` rows for that role are deleted

---

### Requirement: Core Capabilities Seeding

The `permissions` table SHALL be seeded with Core capabilities that define the fundamental actions in the system.

#### Scenario: Core capabilities seeded
- **GIVEN** database is initialized
- **THEN** `permissions` table contains Core capabilities:
  - `content:create:space`, `content:read:*`, `content:update:*`, `content:delete:*`, `content:publish:*`
  - `media:upload:space`, `media:read:*`, `media:delete:*`
  - `organization:read:*`, `organization:update:*`, `organization:delete:*`
  - `user:read:*`, `user:manage:*`, `user:invite:*`
  - `plugin:install:*`, `plugin:uninstall:*`, `plugin:configure:*`
- **AND** all Core capabilities have `source = 'core'`
