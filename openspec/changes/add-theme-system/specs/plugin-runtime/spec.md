## ADDED Requirements

### Requirement: Theme Lifecycle Management

The plugin runtime SHALL handle theme-type plugins with theme-specific lifecycle rules. Only one theme SHALL be active per organization. Theme activation is a **configuration change** (not a code change) and SHALL take effect immediately without a server restart, per PLUGIN_CONTRACT.md §4.3. Theme deactivation SHALL fall back to a default system template.

#### Scenario: Theme activation updates organization setting
- **WHEN** an admin activates theme `com.wordrhyme.theme-blog` for organization `org-1`
- **THEN** the setting `active_theme` is set to `com.wordrhyme.theme-blog` for `org-1`
- **AND** any previously active theme for `org-1` is deactivated
- **AND** the theme's `onEnable` hook is called
- **AND** no server restart or Rolling Reload is triggered (config change only)

#### Scenario: Theme uninstall falls back to default
- **WHEN** the active theme is uninstalled
- **THEN** the `active_theme` setting is cleared for the organization
- **AND** the system renders a default "no theme" placeholder
- **AND** the Admin panel displays a warning: "No active theme configured"

#### Scenario: Multi-tenant theme isolation
- **WHEN** organization `org-1` activates theme A
- **AND** organization `org-2` activates theme B
- **THEN** visitors to `org-1` see theme A
- **AND** visitors to `org-2` see theme B
- **AND** theme settings are fully isolated per organization
