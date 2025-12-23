# Permission Kernel Specification

## ADDED Requirements

### Requirement: White-list Authorization Model

The Permission Kernel SHALL implement a deny-by-default authorization model. All capabilities are denied unless explicitly granted. Permissions MUST be evaluated centrally (plugins cannot self-authorize).

#### Scenario: Undeclared capability denied
- **WHEN** a user attempts to use a capability not in their role
- **THEN** the permission check returns `false`
- **AND** the request is rejected with a 403 error
- **AND** an audit log entry is created

#### Scenario: Declared capability granted
- **WHEN** a user has role "admin"
- **AND** role "admin" has capability `core:users:manage`
- **WHEN** the user calls `permissions.can(user, 'core:users:manage', scope)`
- **THEN** the permission check returns `true`

---

### Requirement: Tenant-scoped Permissions

All permissions MUST be scoped to a tenant. Cross-tenant access SHALL be denied by default. Permission checks MUST include `tenantId` in the scope.

#### Scenario: Same-tenant access granted
- **WHEN** User A (tenant T1) has capability `content:read:space`
- **AND** User A requests content in tenant T1
- **THEN** the permission check passes

#### Scenario: Cross-tenant access denied
- **WHEN** User A (tenant T1) has capability `content:read:space`
- **AND** User A requests content in tenant T2
- **THEN** the permission check fails
- **AND** a 403 error is returned

---

### Requirement: Capability Format

Capabilities SHALL follow the format `resource:action:scope`. The Permission Kernel MUST validate capability format during permission checks.

#### Scenario: Valid capability format
- **WHEN** a capability is defined as `content:create:space`
- **THEN** the format validation passes
- **AND** the capability can be assigned to roles

#### Scenario: Invalid capability format rejected
- **WHEN** a capability is defined as `invalid-format`
- **THEN** the format validation fails
- **AND** an error is returned

#### Scenario: Plugin permission namespacing
- **WHEN** a plugin declares a permission definition key `settings.read`
- **THEN** Core namespaces it as `plugin:{pluginId}:settings.read` for storage and evaluation
- **AND** any non-`plugin:` permission declared by a plugin is rejected as invalid

---

### Requirement: Permission Caching

Permission checks MAY be cached per-request to improve performance. Cached permissions SHALL NOT persist across requests. Cache MUST be invalidated when user roles change.

#### Scenario: Per-request caching
- **WHEN** a permission check is performed for User A in Request 1
- **THEN** the result is cached for the duration of Request 1
- **WHEN** the same permission is checked again in Request 1
- **THEN** the cached result is returned (no DB query)
- **WHEN** Request 2 starts for the same user
- **THEN** a fresh permission check is performed (cache cleared)

#### Scenario: Role change invalidates cache
- **WHEN** User A's role is changed during Request 1
- **THEN** the permission cache for User A is cleared
- **AND** subsequent checks query fresh data
