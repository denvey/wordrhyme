## MODIFIED Requirements

### Requirement: Core Tables

The database schema SHALL include Core tables: `tenants`, `workspaces`, `users`, `plugins`, `permissions`, `role_permissions`, `user_roles`. All tables MUST be created via Drizzle ORM migrations.

#### Scenario: Tables exist after migration
- **WHEN** the database migration runs
- **THEN** all core tables are created
- **AND** indexes are applied (e.g., tenant_id, user_id)
- **AND** foreign key constraints are enforced

#### Scenario: Plugin schema remains a single migration source
- **WHEN** a plugin defines or changes database tables
- **THEN** the plugin's Drizzle schema MUST remain compatible with SQL migration generation
- **AND** runtime schema changes MUST be applied through SQL migration files rather than runtime DDL inference
- **AND** helper-based field injection MUST happen before migration generation so new installs and upgraded installs converge on the same schema
