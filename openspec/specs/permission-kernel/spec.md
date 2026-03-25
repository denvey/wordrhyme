# permission-kernel Specification

## Purpose
Define the centralized authorization model, evaluation rules, and enforcement boundaries for permissions across core and plugins.
## Requirements
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

---

### Requirement: Plugin Permission Registration

When a plugin is installed, its declared permissions SHALL be automatically registered into the `permissions` table. Plugin permissions MUST be namespaced with `plugin:{pluginId}:`. The system SHALL validate that plugins only declare permissions in their own namespace.

#### Scenario: Plugin permissions registered on install
- **WHEN** a plugin with manifest declares permissions
  ```json
  {
    "pluginId": "com.vendor.seo",
    "permissions": {
      "definitions": [
        { "key": "settings.read", "description": "Read SEO settings" }
      ]
    }
  }
  ```
- **THEN** the permission is registered as `plugin:com.vendor.seo:settings.read`
- **AND** the `permissions` table contains a row with `source = 'com.vendor.seo'`

#### Scenario: Plugin permission namespace violation rejected
- **WHEN** a plugin manifest declares permission `core:users:manage`
- **THEN** the manifest validation fails
- **AND** the plugin is marked as `invalid`
- **AND** an error is logged: "Plugin cannot declare non-plugin permissions"

#### Scenario: Plugin permissions removed on uninstall
- **WHEN** a plugin is uninstalled
- **THEN** all permissions with `source = pluginId` are deleted
- **AND** users who had those permissions lose access (next request)

---

### Requirement: Audit Logging

All permission checks that result in `deny` or `error` SHALL be logged to the `audit_logs` table. Successful `allow` checks MAY be logged for sensitive resources (e.g., user management, plugin installation). Audit logs SHALL be queryable by tenant, actor, action, and time range.

#### Scenario: Denied permission logged
- **WHEN** User A attempts action `content:delete:space` without permission
- **THEN** an audit log entry is created:
  ```json
  {
    "actorType": "user",
    "actorId": "user-123",
    "tenantId": "tenant-456",
    "action": "permission.check",
    "resource": "content:delete:space",
    "result": "deny",
    "reason": "Missing capability: content:delete:space"
  }
  ```

#### Scenario: Sensitive action logged
- **WHEN** User A successfully installs a plugin
- **THEN** an audit log entry is created with `result: 'allow'`
- **AND** metadata includes plugin ID and version

---

### Requirement: Cross-Plugin Permission Dependencies

Plugins SHALL NOT depend on permissions defined by other plugins. Plugin A cannot require that users have permission `plugin:B:*`. If a plugin needs to coordinate with another plugin, it MUST use Core-mediated events or capabilities (future feature).

#### Scenario: Cross-plugin permission dependency rejected
- **WHEN** Plugin A's manifest declares required permission `plugin:seo:settings.read`
- **THEN** the manifest validation fails
- **AND** the plugin is marked as `invalid`
- **AND** error logged: "Plugins cannot depend on other plugin permissions"

#### Scenario: Core permission dependency allowed
- **WHEN** Plugin A's manifest declares required Core permission `content:read:space`
- **THEN** the manifest validation passes
- **AND** Plugin A can check `ctx.permissions.can('content:read:space')` at runtime

---
