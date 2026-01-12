# permission-kernel Specification Delta

## MODIFIED Requirements

### Requirement: Database-Driven Role Permissions

The Permission Kernel SHALL load role-permission mappings from the database instead of hardcoded constants. Role lookups SHALL be scoped to the current organization.

#### Scenario: Load permissions from database
- **GIVEN** organization "org-A" has role "editor" with capabilities `content:create:space`, `content:read:*`
- **WHEN** a user with role "editor" in org-A calls `permissions.can('content:create:space')`
- **THEN** the Permission Kernel queries `role_permissions` via `roles` table
- **AND** returns `true` because the capability is granted

#### Scenario: Role not found falls back gracefully
- **GIVEN** user has role "unknown-role" not defined in database
- **WHEN** `permissions.can()` is called
- **THEN** the permission check returns `false`
- **AND** an audit log entry is created with reason "Role not found"

#### Scenario: Tenant isolation on role lookup
- **GIVEN** organization "org-A" has role "editor" with `content:delete:*`
- **AND** organization "org-B" has role "editor" without `content:delete:*`
- **WHEN** a user in org-B with role "editor" calls `permissions.can('content:delete:*')`
- **THEN** the Permission Kernel queries only org-B's role definitions
- **AND** returns `false`

---

### Requirement: Request-Level Role Caching

Role-permission lookups SHALL be cached per-request to avoid redundant database queries. The cache key SHALL include organization ID and role slug.

#### Scenario: Cached role permissions within request
- **GIVEN** user has role "admin" in org-A
- **WHEN** `permissions.can('content:create:space')` is called
- **THEN** role permissions are loaded from database
- **WHEN** `permissions.can('content:delete:space')` is called in the same request
- **THEN** cached role permissions are used (no additional database query)

#### Scenario: Cache cleared between requests
- **WHEN** Request 1 completes
- **AND** Request 2 starts for the same user
- **THEN** role permissions are loaded fresh from database

---

## ADDED Requirements

### Requirement: Role CRUD API

Administrators SHALL be able to create, read, update, and delete custom roles within their organization via tRPC API.

#### Scenario: Create custom role
- **GIVEN** user is an admin in org-A
- **WHEN** user calls `roles.create({ name: 'Content Editor', description: 'Can edit content' })`
- **THEN** a new role is created in the `roles` table
- **AND** `is_system` is set to `false`
- **AND** the role is scoped to org-A

#### Scenario: List roles
- **GIVEN** org-A has roles: owner, admin, member, viewer, content-editor
- **WHEN** user calls `roles.list()`
- **THEN** all 5 roles are returned
- **AND** each role includes `isSystem` flag

#### Scenario: Update role name
- **GIVEN** role "content-editor" exists in org-A
- **WHEN** admin calls `roles.update({ roleId, name: 'Senior Editor' })`
- **THEN** the role name is updated
- **AND** `updatedAt` timestamp is refreshed

#### Scenario: Delete custom role
- **GIVEN** role "content-editor" exists with `is_system = false`
- **WHEN** admin calls `roles.delete({ roleId })`
- **THEN** the role is deleted
- **AND** all associated `role_permissions` are cascade deleted

#### Scenario: Cannot delete system role
- **GIVEN** role "owner" exists with `is_system = true`
- **WHEN** admin calls `roles.delete({ roleId })`
- **THEN** the operation fails with error "Cannot delete system role"

#### Scenario: Non-admin cannot manage roles
- **GIVEN** user has role "member" (not admin/owner)
- **WHEN** user calls any `roles.*` mutation
- **THEN** the operation fails with 403 Forbidden

---

### Requirement: Permission Assignment to Roles

Administrators SHALL be able to assign capabilities to roles. Each role has a set of capabilities that determine what actions users with that role can perform.

#### Scenario: Assign permissions to role
- **GIVEN** role "content-editor" exists in org-A
- **WHEN** admin calls `roles.assignPermissions({ roleId, capabilities: ['content:create:space', 'content:update:own'] })`
- **THEN** the `role_permissions` table is updated
- **AND** previous permissions for that role are replaced with the new set

#### Scenario: Assign wildcard permission
- **WHEN** admin calls `roles.assignPermissions({ roleId, capabilities: ['content:*:*'] })`
- **THEN** the wildcard capability is stored
- **AND** permission checks match all content-related capabilities

#### Scenario: Get role with permissions
- **WHEN** admin calls `roles.get({ roleId })`
- **THEN** the role details are returned
- **AND** includes array of assigned capabilities

---

### Requirement: Available Capabilities Listing

The system SHALL provide an API to list all available capabilities (Core + Plugin) that can be assigned to roles.

#### Scenario: List all capabilities
- **WHEN** admin calls `permissions.list()`
- **THEN** all capabilities from the `permissions` table are returned
- **AND** includes Core capabilities (source = 'core')
- **AND** includes Plugin capabilities (source = pluginId)

#### Scenario: Capabilities grouped by source
- **WHEN** admin calls `permissions.list()`
- **THEN** results include `source` field for each capability
- **AND** can be grouped by source for UI display

---

### Requirement: Default Role Seeding

When an organization is created, the system SHALL automatically seed default system roles with predefined capabilities.

#### Scenario: Default roles created for new organization
- **WHEN** a new organization is created
- **THEN** the following roles are created: owner, admin, member, viewer
- **AND** each role has `is_system = true`
- **AND** each role has default capabilities matching the governance spec

#### Scenario: Default role capabilities
- **GIVEN** organization is created
- **THEN** role "owner" has capability `*:*:*`
- **AND** role "admin" has capabilities `organization:*:*`, `plugin:*:*`, `user:manage:*`, `content:*:*`
- **AND** role "member" has capabilities `content:read:space`, `content:comment:*`
- **AND** role "viewer" has capability `content:read:public`

---

### Requirement: Role Validation on Member Assignment

When assigning a role to a member, the system SHALL validate that the role exists in the member's organization.

#### Scenario: Valid role assignment
- **GIVEN** role "content-editor" exists in org-A
- **WHEN** admin assigns role "content-editor" to a member of org-A
- **THEN** the `member.role` field is updated to "content-editor"

#### Scenario: Invalid role assignment rejected
- **GIVEN** role "content-editor" does NOT exist in org-A
- **WHEN** admin attempts to assign role "content-editor" to a member of org-A
- **THEN** the operation fails with error "Role not found in organization"

#### Scenario: Cross-org role assignment rejected
- **GIVEN** role "special-role" exists in org-B only
- **WHEN** admin in org-A attempts to assign "special-role" to a member
- **THEN** the operation fails with error "Role not found in organization"
