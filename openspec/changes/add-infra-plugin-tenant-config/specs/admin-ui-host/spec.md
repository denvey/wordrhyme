## ADDED Requirements

### Requirement: Infrastructure Plugin Settings Visibility

The Settings page SHALL dynamically filter infrastructure plugin tabs based on both static `visibility` and runtime policy visibility. The page SHALL call `infraPolicy.batchGetVisibility(pluginIds[])` once to obtain all infrastructure plugin states, avoiding N+1 requests. For infrastructure plugins with `tenantOverride: true`, the tab visibility for tenant organizations SHALL be determined by the `mode` returned from `batchGetVisibility`. While visibility data is loading, infrastructure plugin tabs SHALL show Skeleton placeholders.

#### Scenario: Plugin tab hidden when mode is unified
- **WHEN** a tenant admin views the Settings page
- **AND** an infrastructure plugin's visibility mode is `unified`
- **THEN** the plugin's settings tab is NOT shown to the tenant

#### Scenario: Plugin tab shown when mode is allow_override
- **WHEN** a tenant admin views the Settings page
- **AND** an infrastructure plugin's visibility mode is `allow_override`
- **THEN** the plugin's settings tab IS shown to the tenant
- **AND** the tab renders with the `OverridableSettingsContainer` wrapper

#### Scenario: Plugin tab shown when mode is require_tenant
- **WHEN** a tenant admin views the Settings page
- **AND** an infrastructure plugin's visibility mode is `require_tenant`
- **THEN** the plugin's settings tab IS shown to the tenant
- **AND** a warning banner indicates "configuration required to use this feature"

#### Scenario: Loading state while visibility is being fetched
- **WHEN** a tenant admin views the Settings page
- **AND** the `batchGetVisibility` request is in progress
- **THEN** infrastructure plugin tabs show Skeleton placeholders
- **AND** tabs are not clickable until data is loaded

#### Scenario: Platform admin always sees infrastructure tabs
- **WHEN** a platform admin views the Settings page
- **THEN** all infrastructure plugin tabs are visible regardless of policy
- **AND** a "Tenant Policy" section is shown below the plugin's configuration form

---

### Requirement: Overridable Settings Container

The admin UI SHALL provide an `OverridableSettingsContainer` component that wraps infrastructure plugin settings forms. This component SHALL handle the "inherit platform default / use custom configuration" toggle interaction uniformly across all infrastructure plugins.

#### Scenario: Inherit mode display
- **WHEN** a tenant has no custom configuration for an infrastructure plugin
- **AND** the plugin's policy allows override
- **THEN** the container shows an info banner: "Currently using platform default configuration"
- **AND** a "Switch to custom configuration" button is shown
- **AND** form fields are disabled and show masked/reference values

#### Scenario: Switch to custom mode
- **WHEN** a tenant clicks "Switch to custom configuration"
- **AND** the plugin's `riskLevel` is `high`
- **THEN** a confirmation dialog is shown explaining the implications
- **AND** upon confirmation, form fields are enabled and empty (not pre-filled with platform secrets)

#### Scenario: Custom mode display
- **WHEN** a tenant has saved custom configuration
- **THEN** the container shows a warning banner: "You are using custom configuration"
- **AND** a "Reset to platform default" button is shown
- **AND** form fields are enabled with the tenant's saved values

#### Scenario: Reset to platform default
- **WHEN** a tenant clicks "Reset to platform default"
- **THEN** the tenant's custom configuration is deleted from `plugin_tenant` scope
- **AND** the display reverts to inherit mode
- **AND** the effective config immediately falls back to platform default

---

### Requirement: Platform Tenant Policy Controls

The platform admin's infrastructure plugin settings page SHALL include a "Tenant Policy" section with radio buttons to control the tenant configuration strategy. Policy changes SHALL take effect immediately without requiring a restart.

#### Scenario: Platform admin sets policy via radio buttons
- **WHEN** a platform admin views an infrastructure plugin's settings tab
- **THEN** below the plugin configuration form, a "Tenant Policy" section is shown
- **AND** three radio options are available:
  - "Unified platform configuration (tenants cannot see or change)"
  - "Allow tenant override (optional, defaults to platform config)"
  - "Require tenant self-configuration (platform does not provide default)"

#### Scenario: Policy change takes effect immediately
- **WHEN** a platform admin changes the tenant policy from "unified" to "allow override"
- **THEN** the policy is saved via `infraPolicy.set`
- **AND** tenants immediately see the plugin's settings tab on their next page load
- **AND** no server restart is required
