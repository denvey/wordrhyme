## ADDED Requirements

### Requirement: Infrastructure Policy Context Swap

The system SHALL automatically swap the organization context for READ operations based on infra policy configuration. Module identification SHALL be derived from the tRPC request path (not from procedure-level declarations). Policy mode SHALL be queried from the Settings service with caching.

#### Scenario: Path-driven module identification for plugin routes
- **WHEN** a request arrives at path `pluginApis.lbac-teams.list`
- **THEN** the infra policy middleware extracts module = `lbac-teams`
- **AND** queries Settings for `infra.policy.lbac-teams`

#### Scenario: Path-driven module identification for core routes
- **WHEN** a request arrives at path `currency.list`
- **THEN** the infra policy middleware extracts module = `currency`
- **AND** queries Settings for `infra.policy.currency`

#### Scenario: Context Swap for unified mode
- **WHEN** a tenant user makes a READ request
- **AND** the module's infra policy mode is `unified`
- **THEN** `ctx.organizationId` is swapped to `platform`
- **AND** `ctx.originalOrganizationId` preserves the original tenant ID

#### Scenario: Context Swap for allow_override without custom data
- **WHEN** a tenant user makes a READ request
- **AND** the module's infra policy mode is `allow_override`
- **AND** the tenant has NOT switched to custom configuration
- **THEN** `ctx.organizationId` is swapped to `platform`

#### Scenario: No Context Swap for allow_override with custom data
- **WHEN** a tenant user makes a READ request
- **AND** the module's infra policy mode is `allow_override`
- **AND** the tenant HAS switched to custom configuration
- **THEN** `ctx.organizationId` remains as the tenant's own ID

#### Scenario: No Context Swap for require_tenant mode
- **WHEN** a tenant user makes a READ request
- **AND** the module's infra policy mode is `require_tenant` (or not configured)
- **THEN** `ctx.organizationId` remains unchanged (no infra policy effect)

#### Scenario: Public routes automatically covered
- **WHEN** a publicProcedure receives a request with an organization context
- **THEN** the infra policy middleware applies Context Swap based on the request path
- **AND** no `permission.subject` declaration is required

---

### Requirement: Infrastructure Policy Write Guard

The system SHALL block WRITE operations (create, update, delete, manage) when infra policy disallows tenant modifications. WRITE operations SHALL never trigger Context Swap (always use original organizationId).

#### Scenario: Write blocked in unified mode
- **WHEN** a tenant user makes a WRITE request (action = create/update/delete/manage)
- **AND** the module's infra policy mode is `unified`
- **THEN** the request is rejected with FORBIDDEN
- **AND** the error message indicates "Configuration is managed by the platform"

#### Scenario: Write blocked in allow_override without custom data
- **WHEN** a tenant user makes a WRITE request
- **AND** the module's infra policy mode is `allow_override`
- **AND** the tenant has NOT switched to custom configuration
- **THEN** the request is rejected with FORBIDDEN
- **AND** the error message indicates "Switch to custom configuration first"

#### Scenario: Write allowed in require_tenant mode
- **WHEN** a tenant user makes a WRITE request
- **AND** the module's infra policy mode is `require_tenant`
- **THEN** the request proceeds with the original `ctx.organizationId`

---

### Requirement: Meta-Operation Bypass

The system SHALL exempt meta-operations (`switchToCustom`, `resetToPlatform`) from the infra policy guard. These operations modify the policy state itself and MUST NOT be blocked by their own guard (chicken-and-egg paradox). Meta-operations SHALL still be subject to RBAC permission checks.

#### Scenario: switchToCustom bypasses guard
- **WHEN** a tenant user calls `switchToCustom` procedure
- **AND** the module's infra policy mode is `allow_override`
- **AND** the tenant has no custom data yet
- **THEN** the guard does NOT block the request
- **AND** the RBAC permission check (e.g., `manage` on `CurrencyPolicy`) still applies

#### Scenario: resetToPlatform bypasses guard
- **WHEN** a tenant user calls `resetToPlatform` procedure
- **THEN** the guard does NOT block the request
- **AND** the RBAC permission check still applies

---

### Requirement: Settings-Driven Policy Configuration

Infra policy mode and tenant customization status SHALL be stored in the Settings service (not in resolver registrations or DB queries). The system SHALL fail-fast if Settings is not initialized.

#### Scenario: Policy mode from Settings
- **WHEN** a platform admin sets `infra.policy.currency` = `allow_override` in Settings (global scope)
- **THEN** the infra policy middleware applies `allow_override` mode for all `currency.*` routes

#### Scenario: Default mode when not configured
- **WHEN** no Settings entry exists for `infra.policy.{module}`
- **THEN** the system defaults to `require_tenant` (no infra policy effect)

#### Scenario: Customization flag from Settings
- **WHEN** a tenant calls `switchToCustom`
- **THEN** Settings key `infra.customized.{module}` is set to `true` for that tenant
- **WHEN** a tenant calls `resetToPlatform`
- **THEN** Settings key `infra.customized.{module}` is set to `false` for that tenant

#### Scenario: Fail-fast on uninitialized Settings
- **WHEN** the SettingsService has not been injected via `initInfraPolicySettings()`
- **AND** a request triggers the infra policy middleware
- **THEN** the system throws an explicit error: "SettingsService not initialized"
- **AND** does NOT silently default to `require_tenant`

---

### Requirement: Unified Startup Scan

The system SHALL scan all registered tRPC procedures at startup via `_def.procedures` (Flat Map) and build registries for Infra Policy, Billing, and RBAC. The scan SHALL happen once and be shared across all three systems.

#### Scenario: Startup scan populates permission registry
- **WHEN** the application starts
- **THEN** `_def.procedures` is scanned for all registered procedures
- **AND** a permission registry is built mapping each path to its action + subject
- **AND** procedures created by `createCrudRouter` have action and subject auto-derived

#### Scenario: Undeclared procedure default policy
- **WHEN** a procedure has no explicit `meta.permission` declaration
- **AND** cannot be auto-derived (not from `createCrudRouter`)
- **AND** no admin configuration or permission group applies
- **THEN** the system applies the platform-level default policy (audit/deny/allow)
- **AND** in `audit` mode, the request proceeds but an audit log is recorded

#### Scenario: All procedures exported to registry
- **WHEN** the application starts
- **THEN** ALL procedures (including those without permission declarations) are registered
- **AND** each entry includes the procedure `name` (last path segment) for Admin UI display
- **AND** pending mutations are listed in the startup log as a warning

---

### Requirement: RBAC Permission Auto-Derivation

For procedures created by `createCrudRouter`, the system SHALL auto-derive RBAC permissions from the table name and operation type. Explicitly declared `meta.permission` SHALL take priority over auto-derived values. Non-standard mutations SHALL NOT auto-derive `manage` as action.

#### Scenario: Action derived from operation type
- **WHEN** `createCrudRouter` generates a `list` procedure
- **THEN** the permission action is auto-derived as `read`
- **WHEN** `createCrudRouter` generates a `create` procedure
- **THEN** the permission action is auto-derived as `create`

#### Scenario: Non-standard mutation does NOT auto-derive action
- **WHEN** a mutation procedure name is not in CRUD_ACTION_MAP (e.g., `approve`, `publish`, `archive`)
- **THEN** the action is NOT auto-derived (returns `null`)
- **AND** the procedure is exported to the registry with `source: 'pending'`
- **AND** permission resolution follows: admin config → group → Default Policy

#### Scenario: Subject derived from table name
- **WHEN** `createCrudRouter` is called with `table: currencies`
- **THEN** the permission subject is auto-derived as `Currency`
- **AND** the derivation follows: table name → singularize → PascalCase

#### Scenario: Explicit declaration takes priority
- **WHEN** a procedure has explicit `meta.permission: { action: 'manage', subject: 'CurrencyPolicy' }`
- **THEN** the explicit values are used instead of auto-derived values

#### Scenario: Subject title from i18n
- **WHEN** the Admin UI needs to display the subject title
- **THEN** the system uses the standard `t(subject)` translation function (same as all other i18n in the project)
- **AND** falls back to humanized subject name if translation is missing (e.g., `ExchangeRate` → `Exchange Rate`)

---

### Requirement: Permission Grouping

The system SHALL support permission grouping to reduce fine-grained permission management overhead. Developers SHALL define default groups via `meta.permission.group`. Admins SHALL be able to modify groups in the Admin UI. Procedures in the same group SHALL share the group's permission configuration.

#### Scenario: Developer defines default permission group
- **WHEN** a developer sets `meta.permission: { group: 'CurrencyPolicy' }` on a procedure
- **THEN** the procedure is registered in the `CurrencyPolicy` group
- **AND** inherits the group's permission if configured

#### Scenario: Admin configures group permission
- **WHEN** an admin sets `rbac.group.CurrencyPolicy` = `{ action: 'manage', subject: 'CurrencyPolicy' }` in Settings
- **THEN** all procedures in the `CurrencyPolicy` group inherit this permission
- **AND** individual admin overrides on specific procedures take priority

#### Scenario: Admin modifies grouping
- **WHEN** an admin reassigns a procedure from group `A` to group `B` via Admin UI
- **THEN** the procedure's permission follows group `B`'s configuration
- **AND** the change is stored in Settings as `rbac.override.{path}`

#### Scenario: Ungrouped and unconfigured procedure
- **WHEN** a procedure has no `meta.permission.group`, no admin configuration, and no explicit `meta.permission`
- **THEN** Default Policy applies (audit/deny/allow)

#### Scenario: Permission resolution priority
- **GIVEN** the following runtime priority order: admin config > explicit `meta.permission` > auto-crud > group permission > Default Policy
- **WHEN** multiple sources provide permission for a procedure
- **THEN** the admin configuration wins (highest priority)
- **AND** permission templates are NOT a runtime layer (templates batch-write to Settings, becoming admin config)

#### Scenario: Permission template application
- **WHEN** an admin applies a permission template (e.g., 'standard-saas')
- **THEN** all procedures matching template rules have their permissions batch-written to Settings as `rbac.override.{path}`
- **AND** these become regular admin configurations (highest runtime priority)
- **AND** existing admin overrides are preserved (template skips already-configured procedures)
- **AND** admin can further customize individual procedures after template application
