# database-schema Specification

## Purpose
TBD - created by archiving change add-mvp-core-implementation. Update Purpose after archive.
## Requirements
### Requirement: Core Tables

The database schema SHALL include Core tables: `tenants`, `workspaces`, `users`, `plugins`, `permissions`, `role_permissions`, `user_roles`. All tables MUST be created via Drizzle ORM migrations.

#### Scenario: Tables exist after migration
- **WHEN** the database migration runs
- **THEN** all core tables are created
- **AND** indexes are applied (e.g., tenant_id, user_id)
- **AND** foreign key constraints are enforced

---

### Requirement: Plugin Metadata Storage

The `plugins` table SHALL store plugin metadata: `id`, `plugin_id`, `version`, `status`, `manifest` (JSONB), `installed_at`, `updated_at`.

#### Scenario: Plugin metadata stored
- **WHEN** a plugin is installed
- **THEN** a row is inserted into the `plugins` table
- **AND** the `manifest` column stores the full `manifest.json` as JSONB
- **AND** the `status` is set to `enabled`

---

### Requirement: Multi-Tenant Schema

All tenant-scoped tables SHALL include a `tenant_id` column. Foreign keys to `tenants` table SHALL enforce referential integrity.

#### Scenario: Tenant isolation enforced
- **WHEN** querying the `users` table
- **THEN** rows are filtered by `tenant_id`
- **AND** cross-tenant data is not accessible

---

### Requirement: Permission Schema

The `permissions` table SHALL store capability definitions: `id`, `capability` (e.g., `content:read`), `description`. The `role_permissions` table SHALL map roles to capabilities. The `user_roles` table SHALL map users to roles (tenant-scoped).

#### Scenario: Permission hierarchy
- **WHEN** User A has role "editor" in tenant T1
- **AND** role "editor" has capability `content:create`
- **THEN** User A can perform `content:create` in tenant T1
- **AND** User A cannot perform `content:delete` (not in role)

---

