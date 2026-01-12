## ADDED Requirements

### Requirement: CASL-Based Authorization Engine

The Permission Kernel SHALL use CASL (`@casl/ability`) as the underlying authorization engine. All permission evaluations MUST be performed through CASL's `MongoAbility`. The system SHALL support CASL's standard rule format including `action`, `subject`, `fields`, `conditions`, and `inverted` properties.

#### Scenario: CASL ability creation from database rules

- **GIVEN** a user with role "editor" in organization "org-123"
- **AND** the `role_permissions` table contains rules for role "editor":
  ```json
  [
    { "action": "read", "subject": "Content", "conditions": null },
    { "action": "update", "subject": "Content", "conditions": { "authorId": "${user.id}" } }
  ]
  ```
- **WHEN** the Permission Kernel creates an ability for this user
- **THEN** a CASL `MongoAbility` instance is created with interpolated conditions
- **AND** the ability allows reading any Content
- **AND** the ability allows updating only Content where `authorId` matches the user's ID

#### Scenario: CASL manage action grants all permissions

- **GIVEN** a user with role "admin" that has rule `{ action: "manage", subject: "all" }`
- **WHEN** `permissions.can('delete', 'User')` is called
- **THEN** the permission check returns `true`
- **AND** no additional database query is performed for this check

---

### Requirement: ABAC Conditions Support

The Permission Kernel SHALL support Attribute-Based Access Control (ABAC) through CASL conditions. Conditions SHALL be stored as JSON in the database and interpolated with user context at runtime. Supported condition placeholders include `${user.id}`, `${user.orgId}`, and custom attributes from `UserContext.attributes`.

#### Scenario: Owner-based access control

- **GIVEN** a permission rule with condition `{ "ownerId": "${user.id}" }`
- **AND** user "user-456" requests to update Order with `ownerId: "user-456"`
- **WHEN** `permissions.can('update', order)` is called with the order object
- **THEN** the permission check returns `true`

#### Scenario: Department-based access control

- **GIVEN** a permission rule with condition `{ "department": "${user.attributes.department}" }`
- **AND** user has `attributes.department = "sales"`
- **AND** user requests to view Report with `department: "engineering"`
- **WHEN** `permissions.can('read', report)` is called
- **THEN** the permission check returns `false`
- **AND** an audit log entry is created with reason "Condition not satisfied"

#### Scenario: Unsupported condition operator rejected

- **GIVEN** a permission rule with condition `{ "name": { "$regex": ".*admin.*" } }`
- **WHEN** the Permission Kernel attempts to load this rule
- **THEN** a warning is logged
- **AND** the rule is skipped (not added to ability)

---

### Requirement: Field-Level Security

The Permission Kernel SHALL support field-level access control. Rules MAY specify a `fields` array to restrict which properties of a subject can be accessed. The `permittedFieldsOf` function SHALL be provided to retrieve allowed fields for response sanitization.

#### Scenario: Field restriction on read

- **GIVEN** a permission rule:
  ```json
  { "action": "read", "subject": "User", "fields": ["id", "name", "email"] }
  ```
- **WHEN** `permissions.permittedFields('read', 'User')` is called
- **THEN** it returns `["id", "name", "email"]`
- **AND** sensitive fields like `passwordHash` are excluded from the response

#### Scenario: No field restriction returns null

- **GIVEN** a permission rule with `fields: null`
- **WHEN** `permissions.permittedFields('read', 'Content')` is called
- **THEN** it returns `null` (indicating all fields allowed, aligned with CASL behavior)

#### Scenario: Multiple rules with different fields

- **GIVEN** two permission rules for the same action/subject:
  - Rule 1: `{ "action": "read", "subject": "Order", "fields": ["id", "status"] }`
  - Rule 2: `{ "action": "read", "subject": "Order", "fields": ["id", "total"], "conditions": { "ownerId": "${user.id}" } }`
- **WHEN** `permissions.permittedFields('read', 'Order')` is called
- **THEN** it returns the union of fields: `["id", "status", "total"]`

---

### Requirement: Drizzle Query Translation

The Permission Kernel SHALL provide a helper function to translate CASL conditions into Drizzle ORM `where` clauses. This enables database-level filtering without loading all records into memory. Unsupported conditions SHALL throw an error, requiring explicit fallback handling.

#### Scenario: Simple equality condition translation

- **GIVEN** a CASL rule with condition `{ "organizationId": "org-123" }`
- **WHEN** `rulesToDrizzleQuery(ability, 'read', 'Order', orderSchema)` is called
- **THEN** it returns `eq(orderSchema.organizationId, 'org-123')`

#### Scenario: Array condition translation

- **GIVEN** a CASL rule with condition `{ "status": { "$in": ["pending", "approved"] } }`
- **WHEN** `rulesToDrizzleQuery(ability, 'read', 'Order', orderSchema)` is called
- **THEN** it returns `inArray(orderSchema.status, ['pending', 'approved'])`

#### Scenario: Combined conditions with AND

- **GIVEN** a CASL rule with condition `{ "organizationId": "org-123", "ownerId": "user-456" }`
- **WHEN** `rulesToDrizzleQuery(ability, 'read', 'Order', orderSchema)` is called
- **THEN** it returns `and(eq(orderSchema.organizationId, 'org-123'), eq(orderSchema.ownerId, 'user-456'))`

#### Scenario: Unsupported operator throws error

- **GIVEN** a CASL rule with condition `{ "name": { "$regex": "test" } }`
- **WHEN** `rulesToDrizzleQuery(ability, 'read', 'User', userSchema)` is called
- **THEN** it throws `UnsupportedConditionError`
- **AND** the error message includes the unsupported operator

---

### Requirement: Better-Auth Teams Integration

The Permission Kernel SHALL integrate with Better-Auth's teams feature. The `teamMember` table SHALL be extended with a `role` field. User roles SHALL be aggregated from both organization membership and team memberships for permission evaluation.

#### Scenario: Team role included in user context

- **GIVEN** user "user-123" is a member of organization "org-456"
- **AND** user has organization role "member"
- **AND** user is a member of team "team-finance" with role "lead"
- **WHEN** the permission context is built for this user
- **THEN** `userContext.roles` contains `["member", "team:team-finance:lead"]`

#### Scenario: Team-scoped permission check

- **GIVEN** a permission rule in role "team:team-finance:lead":
  ```json
  { "action": "approve", "subject": "Expense", "conditions": { "teamId": "team-finance" } }
  ```
- **AND** user has role "team:team-finance:lead"
- **WHEN** user attempts to approve an Expense with `teamId: "team-finance"`
- **THEN** the permission check returns `true`

#### Scenario: Cross-team access denied

- **GIVEN** user has role "team:team-finance:lead"
- **AND** no rules exist for "team:team-engineering"
- **WHEN** user attempts to approve an Expense with `teamId: "team-engineering"`
- **THEN** the permission check returns `false`

---

### Requirement: Role Permission Schema

The `role_permissions` table SHALL store CASL-compatible permission rules. Each rule MUST have an `action` and `subject`. Rules MAY have `fields` (JSON array), `conditions` (JSON object), and `inverted` (boolean) properties. The table SHALL have a foreign key to the `roles` table.

#### Scenario: Valid rule insertion

- **GIVEN** a role "editor" exists in organization "org-123"
- **WHEN** inserting a rule:
  ```json
  {
    "roleId": "role-editor-id",
    "action": "update",
    "subject": "Content",
    "fields": ["title", "body"],
    "conditions": { "authorId": "${user.id}" },
    "inverted": false
  }
  ```
- **THEN** the insertion succeeds
- **AND** the rule is returned when loading permissions for role "editor"

#### Scenario: Rule with inverted flag

- **GIVEN** a rule with `inverted: true`:
  ```json
  { "action": "delete", "subject": "Content", "conditions": { "status": "published" }, "inverted": true }
  ```
- **WHEN** a user with this rule attempts to delete Content with `status: "published"`
- **THEN** the permission check returns `false` (inverted means "cannot")

#### Scenario: Cascade delete on role removal

- **GIVEN** role "custom-role" has 5 permission rules
- **WHEN** role "custom-role" is deleted
- **THEN** all 5 associated rules are deleted via cascade

---

### Requirement: Dual API Support

The Permission Kernel SHALL support two API styles for permission checks: (1) legacy three-segment string format for simple capability checks, and (2) CASL-style action/subject format for ABAC checks. Both APIs SHALL use the same underlying CASL engine. The three-segment string SHALL be automatically parsed into CASL action/subject pairs.

#### Scenario: Legacy three-segment string API

- **GIVEN** a permission rule `{ action: "read", subject: "Content" }`
- **WHEN** `permissions.can('content:read')` is called with three-segment string
- **THEN** the string is parsed as `{ action: "read", subject: "Content" }`
- **AND** the permission check returns `true`

#### Scenario: Legacy string with scope segment

- **GIVEN** a permission rule `{ action: "create", subject: "Content" }`
- **WHEN** `permissions.can('content:create:space')` is called
- **THEN** the string is parsed as `{ action: "create", subject: "Content" }`
- **AND** the third segment (scope) is ignored for CASL matching
- **AND** the permission check returns `true`

#### Scenario: CASL-style API with subject string

- **GIVEN** a permission rule `{ action: "read", subject: "User" }`
- **WHEN** `permissions.can('read', 'User')` is called with action and subject
- **THEN** the permission check returns `true`

#### Scenario: CASL-style API with subject instance for ABAC

- **GIVEN** a permission rule `{ action: "update", subject: "Order", conditions: { "ownerId": "${user.id}" } }`
- **AND** user ID is "user-123"
- **AND** an order object `{ id: "order-1", ownerId: "user-123" }`
- **WHEN** `permissions.can('update', order)` is called with the order object
- **THEN** the permission check evaluates the condition against the object
- **AND** returns `true` because `order.ownerId` matches user ID

#### Scenario: CASL-style API with non-matching instance

- **GIVEN** a permission rule `{ action: "update", subject: "Order", conditions: { "ownerId": "${user.id}" } }`
- **AND** user ID is "user-123"
- **AND** an order object `{ id: "order-2", ownerId: "user-456" }`
- **WHEN** `permissions.can('update', order)` is called
- **THEN** returns `false` because `order.ownerId` does not match user ID

#### Scenario: Admin full access with fields null

- **GIVEN** a permission rule `{ action: "manage", subject: "all", fields: null }`
- **WHEN** `permissions.can('delete', 'User')` is called
- **THEN** returns `true`
- **AND** `permissions.permittedFields('read', 'User')` returns `null` (all fields allowed)

---

## MODIFIED Requirements

### Requirement: Capability Format

Capabilities SHALL follow the CASL convention of `action` and `subject` pairs. Legacy capability strings in format `resource:action:scope` SHALL be migrated to CASL rules during the schema migration. The Permission Kernel MUST support both formats during the migration period.

#### Scenario: Legacy capability migration

- **GIVEN** existing capability string `content:create:space`
- **WHEN** the migration script runs
- **THEN** it is converted to CASL rule `{ action: "create", subject: "Content" }`

#### Scenario: Wildcard capability migration

- **GIVEN** existing capability string `*:*:*`
- **WHEN** the migration script runs
- **THEN** it is converted to CASL rule `{ action: "manage", subject: "all" }`

#### Scenario: Plugin permission format preserved

- **GIVEN** a plugin permission `plugin:com.vendor.seo:settings.read`
- **WHEN** the migration script runs
- **THEN** it is converted to `{ action: "read", subject: "plugin:com.vendor.seo:settings" }`
- **AND** the plugin namespace is preserved in the subject

---

### Requirement: Permission Caching

Permission checks SHALL be cached per-request using the built CASL `Ability` instance. The Ability object SHALL be created once per request and reused for all permission checks within that request. Cache MUST be invalidated when user roles change.

#### Scenario: Per-request ability caching

- **WHEN** a permission check is performed for User A in Request 1
- **THEN** a CASL Ability is built and cached for Request 1
- **WHEN** a second permission check is performed in the same Request 1
- **THEN** the cached Ability is reused (no additional DB query)
- **WHEN** Request 2 starts for the same user
- **THEN** a fresh Ability is built (cache cleared between requests)

#### Scenario: Ability includes all user roles

- **GIVEN** user has roles `["admin", "team:finance:member"]`
- **WHEN** building the Ability for this user
- **THEN** rules from both "admin" and "team:finance:member" roles are loaded
- **AND** combined into a single Ability instance

---

### Requirement: Plugin Permission Registration

When a plugin is installed, its declared permissions SHALL be automatically registered into the `role_permissions` table in CASL format. Plugin permissions MUST be namespaced with `plugin:{pluginId}:` in the subject field. The system SHALL validate that plugins only declare permissions in their own namespace. Legacy three-segment format in manifests SHALL be automatically converted to CASL rules.

#### Scenario: Plugin permissions registered on install

- **WHEN** a plugin with manifest declares permissions
  ```json
  {
    "pluginId": "com.vendor.seo",
    "permissions": {
      "definitions": [
        { "key": "settings.read", "description": "Read SEO settings" },
        { "key": "settings.update", "description": "Update SEO settings" }
      ]
    }
  }
  ```
- **THEN** the permissions are converted to CASL rules:
  - `{ action: "read", subject: "plugin:com.vendor.seo:settings" }`
  - `{ action: "update", subject: "plugin:com.vendor.seo:settings" }`
- **AND** the rules are stored in `role_permissions` table with `source = 'com.vendor.seo'`

#### Scenario: Plugin permission namespace violation rejected

- **WHEN** a plugin manifest declares permission `core:users:manage`
- **THEN** the manifest validation fails
- **AND** the plugin is marked as `invalid`
- **AND** an error is logged: "Plugin cannot declare non-plugin permissions"

#### Scenario: Plugin permissions removed on uninstall

- **WHEN** a plugin is uninstalled
- **THEN** all permission rules with `source = pluginId` are deleted
- **AND** users who had those permissions lose access (next request)

#### Scenario: Legacy plugin permission format supported

- **GIVEN** a plugin manifest with legacy format `plugin:com.vendor.seo:settings.read`
- **WHEN** the plugin is installed
- **THEN** it is parsed and converted to `{ action: "read", subject: "plugin:com.vendor.seo:settings" }`
- **AND** the rule is stored in CASL format

---

### Requirement: Multi-Tenant Context Switching

The Permission Kernel SHALL support multi-tenant context switching via an optional `currentTeamId` parameter. When `currentTeamId` is provided, only roles from the specified team SHALL be loaded in addition to organization-level roles. This prevents permission leakage when users belong to multiple teams with different roles.

#### Scenario: Context switching loads only current team roles

- **GIVEN** user "user-123" belongs to teams "team-A" (role: admin) and "team-B" (role: viewer)
- **AND** user has organization role "member"
- **WHEN** `createAppAbility(user, 'team-A')` is called
- **THEN** the ability includes rules from roles: ["member", "team:team-A:admin"]
- **AND** rules from "team:team-B:viewer" are NOT included

#### Scenario: No team context loads only org roles

- **GIVEN** user "user-123" has organization role "editor"
- **AND** user belongs to multiple teams
- **WHEN** `createAppAbility(user)` is called without `currentTeamId`
- **THEN** the ability includes only organization-level roles
- **AND** no team-specific roles are loaded

#### Scenario: Permission leakage prevented

- **GIVEN** user is admin in "team-A" and viewer in "team-B"
- **AND** current context is "team-B"
- **WHEN** user attempts to perform admin action on "team-B" resource
- **THEN** the permission check returns `false`
- **AND** user's admin permissions from "team-A" are not evaluated

---

### Requirement: Frontend Rule Sync API

The Permission Kernel SHALL provide a tRPC endpoint to return packed CASL rules for frontend hydration. The endpoint SHALL use `@casl/ability/extra` `packRules()` function to compress rules. The frontend SHALL be able to create a matching `Ability` instance using `unpackRules()`.

#### Scenario: Packed rules returned for current context

- **GIVEN** user has role "editor" with 5 permission rules
- **AND** current team is "team-finance" with 3 additional rules
- **WHEN** `auth.permissions` endpoint is called
- **THEN** response contains packed rules JSON
- **AND** unpacking creates an Ability with 8 rules

#### Scenario: Frontend ability matches backend

- **GIVEN** backend returns packed rules for a user
- **WHEN** frontend creates Ability via `createMongoAbility(unpackRules(rules))`
- **THEN** `ability.can('read', 'Content')` returns same result as backend check

---

### Requirement: Bootstrap Safety (Super Admin Seeding)

The seed script SHALL create a "Super Admin" role with wildcard access rule `{ action: "manage", subject: "all" }`. The seed script SHALL read `INITIAL_ADMIN_EMAIL` from environment variables and assign the Super Admin role to a matching user. This prevents "locked out" scenario on fresh installations.

#### Scenario: Super Admin role created on fresh install

- **GIVEN** a fresh database with no roles
- **WHEN** the seed script runs
- **THEN** a role named "Super Admin" is created
- **AND** it has rule `{ action: "manage", subject: "all", fields: null }`
- **AND** `isSystem: true` is set (cannot be deleted)

#### Scenario: Initial admin assigned by email

- **GIVEN** `INITIAL_ADMIN_EMAIL=admin@example.com` in `.env`
- **AND** user with email "admin@example.com" exists in organization
- **WHEN** the seed script runs
- **THEN** "Super Admin" role is assigned to that user

#### Scenario: Fallback to first user if no email specified

- **GIVEN** `INITIAL_ADMIN_EMAIL` is not set in `.env`
- **AND** organization has one user "first-user"
- **WHEN** the seed script runs
- **THEN** "Super Admin" role is assigned to "first-user"

---

### Requirement: Plugin Permission Cleanup

The Permission Kernel SHALL support cleanup of plugin permissions when a plugin is uninstalled. The `source` column in `role_permissions` SHALL track which plugin registered each rule. A `removePluginRules(pluginId)` function SHALL delete all rules where `source = 'plugin:{pluginId}'`.

#### Scenario: Plugin rules cleaned up on uninstall

- **GIVEN** plugin "com.vendor.seo" has registered 5 permission rules
- **AND** all rules have `source = 'plugin:com.vendor.seo'`
- **WHEN** `removePluginRules('com.vendor.seo')` is called
- **THEN** all 5 rules are deleted from `role_permissions`
- **AND** other plugins' rules are not affected

#### Scenario: Orphaned subjects not shown in Admin UI

- **GIVEN** plugin "com.vendor.coupon" was uninstalled
- **AND** its rules were cleaned up
- **WHEN** Admin UI loads available subjects for dropdown
- **THEN** "plugin:com.vendor.coupon:*" subjects are not included
- **AND** no errors occur due to missing subjects

---

### Requirement: Flexible Plugin Permission Definition

The Permission Kernel SHALL support flexible plugin permission definitions with sensible defaults. Plugin manifests MAY specify permissions with only a `subject` field. If `actions` is not specified, it SHALL default to `['manage']`. If `fields` is not specified, it SHALL default to `null` (all fields).

#### Scenario: Simple plugin permission with defaults

- **GIVEN** plugin manifest:
  ```json
  {
    "permissions": {
      "definitions": [{ "subject": "SeoTools" }]
    }
  }
  ```
- **WHEN** the plugin is registered
- **THEN** rule is created: `{ action: "manage", subject: "plugin:pluginId:SeoTools", fields: null }`

#### Scenario: Complex plugin permission with explicit values

- **GIVEN** plugin manifest:
  ```json
  {
    "permissions": {
      "definitions": [{
        "subject": "Report",
        "actions": ["read", "create"],
        "fields": ["title", "data"]
      }]
    }
  }
  ```
- **WHEN** the plugin is registered
- **THEN** two rules are created:
  - `{ action: "read", subject: "plugin:pluginId:Report", fields: ["title", "data"] }`
  - `{ action: "create", subject: "plugin:pluginId:Report", fields: ["title", "data"] }`

#### Scenario: Admin UI simplifies for manage-only subjects

- **GIVEN** plugin subject "plugin:seo:Tools" only supports `manage` action
- **WHEN** Admin UI renders rule builder for this subject
- **THEN** the Action dropdown is hidden or auto-selected to "manage"

---

### Requirement: Admin Management API

The Permission Kernel SHALL expose tRPC endpoints for administrative management of roles and permissions. Endpoints SHALL be protected by `requirePermission('role:manage')`. A constants file SHALL define `APP_SUBJECTS` and `APP_ACTIONS` arrays for Admin UI dropdowns.

#### Scenario: Permissions meta returned for dropdowns

- **WHEN** `permissions.meta` endpoint is called
- **THEN** response contains:
  ```json
  {
    "subjects": ["all", "User", "Role", "Content", ...],
    "actions": ["manage", "create", "read", "update", "delete"]
  }
  ```

#### Scenario: CASL rules assigned to role

- **GIVEN** role "editor" exists
- **WHEN** `roles.assignPermissions` is called with:
  ```json
  {
    "roleId": "editor-id",
    "rules": [
      { "action": "read", "subject": "Content" },
      { "action": "update", "subject": "Content", "conditions": "{\"authorId\": \"${user.id}\"}" }
    ]
  }
  ```
- **THEN** old rules for role "editor" are deleted
- **AND** new rules are inserted with validated JSON conditions

#### Scenario: Invalid conditions rejected

- **GIVEN** a rule with malformed conditions JSON
- **WHEN** `roles.assignPermissions` is called
- **THEN** validation error is returned: "Invalid JSON format for conditions"
- **AND** no rules are modified

#### Scenario: Admin API protected by permission

- **GIVEN** user with role "viewer" (no admin permissions)
- **WHEN** user calls `permissions.meta` endpoint
- **THEN** error is returned: "Permission denied: role:manage"

---
