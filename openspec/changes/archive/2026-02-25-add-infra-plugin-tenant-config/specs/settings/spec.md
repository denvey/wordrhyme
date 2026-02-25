## ADDED Requirements

### Requirement: Infrastructure Plugin Configuration Scoping

Infrastructure plugin configurations SHALL be stored using a three-key model under the plugin settings scope: `infra.policy` (control plane), `infra.config` in `plugin_global` (platform default), and `infra.config` in `plugin_tenant` (tenant override). The `infra.policy` key SHALL only be writable via the `infraPolicy` Core router by platform administrators. Sensitive fields within infrastructure configs MUST be stored with `encrypted: true`. The system SHALL use the plugin's manifest `infrastructure.sensitiveFields` array to determine which JSON fields within `infra.config` require partial masking when returned to tenant frontends.

#### Scenario: Platform admin saves infrastructure policy
- **WHEN** a platform admin saves an infrastructure policy for plugin `com.wordrhyme.storage-s3`
- **THEN** the policy is stored at key `infra.policy` with scope `plugin_global`
- **AND** the policy contains a `mode` field with value `unified`, `allow_override`, or `require_tenant`

#### Scenario: Platform admin saves platform default config
- **WHEN** a platform admin saves S3 configuration
- **THEN** the config is stored at key `infra.config` with scope `plugin_global`
- **AND** fields listed in manifest `infrastructure.sensitiveFields` (e.g., `secretAccessKey`) are stored with `encrypted: true`
- **AND** the config is available as fallback for all tenants

#### Scenario: Tenant saves override config
- **WHEN** a tenant admin saves custom S3 configuration
- **AND** the plugin's `infra.policy.mode` is `allow_override`
- **THEN** the config is stored at key `infra.config` with scope `plugin_tenant`
- **AND** fields listed in manifest `infrastructure.sensitiveFields` are stored with `encrypted: true`
- **AND** the tenant's effective config switches to their custom values

#### Scenario: Sensitive fields partially masked for tenants
- **WHEN** a tenant reads infrastructure config in "inherit" mode via `infraPolicy.getVisibility` or the OverridableSettingsContainer
- **THEN** only fields listed in manifest `infrastructure.sensitiveFields` are masked (e.g., `********`)
- **AND** non-sensitive fields (e.g., `region`, `bucket`) are shown with actual values as reference
- **AND** the actual platform secret values are never transmitted to the tenant frontend

#### Scenario: Plugin uninstall cleans up all scopes
- **WHEN** an infrastructure plugin is uninstalled
- **AND** the plugin's `dataRetention.onUninstall` is `delete` (default)
- **THEN** both `infra.policy` and `infra.config` are deleted from `plugin_global` scope
- **AND** `infra.config` is deleted from all `plugin_tenant` scopes
