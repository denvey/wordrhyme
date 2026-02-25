## ADDED Requirements

### Requirement: Infrastructure Plugin Manifest Declaration

Plugins that provide infrastructure services (storage, auth, email, payment) SHALL declare a top-level `infrastructure` section in their manifest (same level as `dataRetention` and `notifications`). The `infrastructure.tenantOverride` field indicates whether the plugin's code supports per-tenant configuration. The `infrastructure.riskLevel` field indicates the security sensitivity of tenant override. The `infrastructure.sensitiveFields` array declares which JSON field names within the plugin's config contain secrets and MUST be masked when returned to tenant frontends.

#### Scenario: Plugin declares tenant override support with sensitive fields
- **WHEN** a plugin manifest contains `infrastructure: { tenantOverride: true, riskLevel: "high", sensitiveFields: ["secretAccessKey"] }`
- **THEN** the manifest validation succeeds
- **AND** the plugin is recognized as an infrastructure plugin supporting tenant configuration
- **AND** the platform admin can configure tenant policy for this plugin
- **AND** the `secretAccessKey` field is masked when returned to tenant frontends

#### Scenario: Plugin without infrastructure declaration
- **WHEN** a plugin manifest does NOT contain an `infrastructure` section
- **THEN** the plugin is treated as a standard plugin
- **AND** no tenant policy controls are available
- **AND** existing behavior is unchanged

#### Scenario: Invalid riskLevel rejected
- **WHEN** a plugin manifest contains `infrastructure: { tenantOverride: true, riskLevel: "critical" }`
- **THEN** manifest validation fails
- **AND** the error indicates riskLevel must be one of: `high`, `medium`, `low`

#### Scenario: Old manifests without infrastructure still valid
- **WHEN** a plugin manifest omits the `infrastructure` field entirely
- **THEN** manifest validation succeeds
- **AND** the plugin loads normally

---

### Requirement: Infrastructure Plugin Policy API

The system SHALL provide a dedicated Core tRPC router `infraPolicy` for managing per-plugin tenant configuration policies. The router SHALL expose two tiers of endpoints: platform-only full policy CRUD, and tenant-safe minimal visibility queries. Platform endpoints SHALL require `manage:Settings` permission and platform organization context. Tenant visibility endpoints SHALL be accessible to any authenticated user.

#### Scenario: Platform admin reads full policy
- **WHEN** a platform admin calls `infraPolicy.get(pluginId)`
- **THEN** the full policy object is returned: `{ mode: 'unified' | 'allow_override' | 'require_tenant' }`

#### Scenario: Platform admin sets policy
- **WHEN** a platform admin calls `infraPolicy.set(pluginId, { mode: 'allow_override' })`
- **THEN** the policy is stored under `infra.policy` key in `plugin_global` scope
- **AND** tenants can see the plugin's settings tab on their next page load

#### Scenario: Tenant queries visibility for single plugin
- **WHEN** a tenant admin calls `infraPolicy.getVisibility(pluginId)`
- **THEN** a minimal response is returned: `{ mode: 'allow_override', hasCustomConfig: true }`
- **AND** no internal policy details are exposed

#### Scenario: Tenant queries visibility in batch
- **WHEN** a tenant admin calls `infraPolicy.batchGetVisibility(['plugin-a', 'plugin-b', 'plugin-c'])`
- **THEN** an array of `{ pluginId, mode, hasCustomConfig }` is returned in a single request
- **AND** the Settings page can filter tabs without N+1 requests

#### Scenario: Non-platform user cannot modify policy
- **WHEN** a tenant admin attempts to call `infraPolicy.set(pluginId, ...)`
- **THEN** the request is denied with a permission error

#### Scenario: Default policy for new infrastructure plugins
- **WHEN** an infrastructure plugin is installed and no policy has been set
- **THEN** the default policy mode is `unified`
- **AND** the plugin settings tab is only visible to platform admins

---

### Requirement: Tenant Configuration Policy Enforcement

When a tenant attempts to read, write, or delete infrastructure plugin settings, the system SHALL enforce the plugin's `infra.policy` before allowing access. Policy enforcement MUST happen server-side on ALL access paths (set, get, delete, list), not only in the UI. Plugin-exposed tRPC routers that persist infra config MUST also be subject to policy enforcement.

#### Scenario: Tenant writes config when mode is allow_override
- **WHEN** a tenant calls `plugin.settings.set(key, value)` for an infrastructure plugin
- **AND** the plugin's `infra.policy.mode` is `allow_override`
- **THEN** the value is stored in `plugin_tenant` scope
- **AND** the tenant's effective configuration uses their custom value

#### Scenario: Tenant writes config when mode is unified
- **WHEN** a tenant calls `plugin.settings.set(key, value)` for an infrastructure plugin
- **AND** the plugin's `infra.policy.mode` is `unified`
- **THEN** the request is denied with a policy error
- **AND** the tenant's configuration is unchanged

#### Scenario: Tenant reads config when mode is unified
- **WHEN** a tenant calls `plugin.settings.get(key)` for an infrastructure plugin
- **AND** the plugin's `infra.policy.mode` is `unified`
- **THEN** the request is denied with a policy error
- **AND** the platform config is NOT exposed to the tenant

#### Scenario: Tenant deletes config resets to inherit
- **WHEN** a tenant calls `plugin.settings.delete(key)` for an infrastructure plugin
- **AND** the plugin's `infra.policy.mode` is `allow_override`
- **THEN** the tenant's custom configuration is removed
- **AND** the effective config falls back to platform default

#### Scenario: Effective config resolution with tenant override
- **WHEN** a plugin resolves its effective configuration
- **AND** `infra.policy.mode` is `allow_override`
- **AND** a `plugin_tenant` config exists for the current tenant
- **THEN** the tenant's config is used as the effective config

#### Scenario: Effective config resolution without tenant override
- **WHEN** a plugin resolves its effective configuration
- **AND** `infra.policy.mode` is `allow_override`
- **AND** NO `plugin_tenant` config exists for the current tenant
- **THEN** the `plugin_global` platform config is used as the effective config

#### Scenario: Effective config resolution when tenant config required
- **WHEN** a plugin resolves its effective configuration
- **AND** `infra.policy.mode` is `require_tenant`
- **AND** NO `plugin_tenant` config exists for the current tenant
- **THEN** the effective config is `null`
- **AND** the plugin's functionality is unavailable for this tenant

#### Scenario: Policy change from allow_override to unified preserves tenant data
- **WHEN** a platform admin changes policy from `allow_override` to `unified`
- **AND** tenants have custom configurations stored in `plugin_tenant`
- **THEN** the tenant data is preserved in the database
- **AND** `resolveInfraConfig` ignores tenant data and returns platform config
- **AND** if the policy is later changed back to `allow_override`, tenant configs become effective again
