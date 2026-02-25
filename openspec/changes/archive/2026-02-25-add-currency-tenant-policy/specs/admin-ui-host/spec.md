## MODIFIED Requirements

### Requirement: Currency Page Policy Awareness
The currency management page (`/settings/currencies`) SHALL remain as a standalone page with its own sidebar menu item. The page SHALL display policy-aware banners and control CRUD operation availability based on the current currency tenant policy mode.

#### Scenario: Unified mode — tenant sees read-only list
- **WHEN** a tenant administrator opens the currency management page
- **AND** the currency policy mode is `unified`
- **THEN** the page SHALL display a banner "Currency configuration is managed by the platform"
- **AND** all CRUD operation buttons (create, edit, delete, toggle, setBase) SHALL be hidden
- **AND** the currency list SHALL be displayed in read-only mode showing platform currencies

#### Scenario: Allow override mode — tenant inheriting platform
- **WHEN** a tenant administrator opens the currency management page
- **AND** the currency policy mode is `allow_override`
- **AND** the tenant has no custom currency records
- **THEN** the page SHALL display a blue banner "Currently using platform default configuration"
- **AND** the banner SHALL include a "Switch to custom configuration" button
- **AND** the currency list SHALL be displayed in read-only mode showing inherited platform currencies

#### Scenario: Allow override mode — tenant using custom
- **WHEN** a tenant administrator opens the currency management page
- **AND** the currency policy mode is `allow_override`
- **AND** the tenant has custom currency records
- **THEN** the page SHALL display a yellow banner "You are using custom configuration"
- **AND** the banner SHALL include a "Reset to platform default" button
- **AND** all CRUD operations SHALL be available for tenant-owned currencies

#### Scenario: Require tenant mode
- **WHEN** a tenant administrator opens the currency management page
- **AND** the currency policy mode is `require_tenant`
- **THEN** all CRUD operations SHALL be available
- **AND** if the tenant has no currencies, a warning banner "Configuration required to use this feature" SHALL be shown

#### Scenario: Platform admin always has full access
- **WHEN** a platform administrator opens the currency management page
- **THEN** all CRUD operations SHALL be available
- **AND** a "Tenant Policy" section SHALL be shown below the currency list
- **AND** the section SHALL contain radio options for `unified`, `allow_override`, and `require_tenant`

## ADDED Requirements

### Requirement: PolicyAwareBanner Component
The system SHALL provide a generic `PolicyAwareBanner` component extracted from `OverridableSettingsContainer`. This component SHALL accept `mode`, `hasCustomConfig`, and action callbacks as props (not `pluginId`), enabling reuse across both plugin settings tabs and standalone pages like currency management.

#### Scenario: Banner visual consistency
- **GIVEN** the `PolicyAwareBanner` component
- **WHEN** rendered with mode `allow_override` and `hasCustomConfig = false`
- **THEN** the visual output SHALL be identical to the current `OverridableSettingsContainer` banner (blue info banner with "Switch to custom" button)
