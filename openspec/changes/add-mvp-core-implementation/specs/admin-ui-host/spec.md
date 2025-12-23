# Admin UI Host Specification

## ADDED Requirements

### Requirement: Module Federation Configuration

The Admin UI host SHALL be configured with Rspack + Module Federation 2.0. The host SHALL define extension points for plugins to inject UI components.

#### Scenario: Host application loads
- **WHEN** the Admin UI is accessed in a browser
- **THEN** the host application loads successfully
- **AND** the layout (header, sidebar, content area) is rendered
- **AND** no JavaScript errors occur

---

### Requirement: Plugin UI Loading

The host SHALL fetch plugin descriptors from the server API. For each plugin with `admin.remoteEntry` defined in `manifest.json`, the server SHALL provide a fully-resolved `admin.remoteEntryUrl` that the host can load via Module Federation.

#### Scenario: Plugin remote entry loaded
- **WHEN** the server API returns a plugin with `admin.remoteEntry = "./dist/admin/remoteEntry.js"`
- **AND** the server provides `admin.remoteEntryUrl = "/plugins/{pluginId}/static/admin/remoteEntry.js"`
- **THEN** the host loads `admin.remoteEntryUrl`
- **AND** the plugin's UI components are available for rendering
- **AND** the plugin appears in the sidebar (if it registered a sidebar item)

#### Scenario: Plugin UI error isolated
- **WHEN** a plugin's remote entry fails to load (404 or JS error)
- **THEN** an error boundary catches the error
- **AND** a fallback UI is displayed for that plugin
- **AND** other plugins continue to render normally

---

### Requirement: Extension Point Registry

The host SHALL provide an extension point registry. Supported extension points for MVP: `sidebar`, `settings.page`. Plugins SHALL register components at these extension points.

#### Scenario: Plugin registers sidebar item
- **WHEN** a plugin calls `registerExtension('sidebar', SidebarComponent)`
- **THEN** the sidebar component is rendered in the host's sidebar
- **AND** clicking the sidebar item navigates to the plugin's page

#### Scenario: Plugin registers settings page
- **WHEN** a plugin calls `registerExtension('settings.page', SettingsComponent)`
- **THEN** a new tab appears in the Settings page
- **AND** clicking the tab renders the plugin's settings UI

---

### Requirement: Authentication (MVP Stub)

For MVP, authentication SHALL be stubbed (hardcoded admin user or no auth). The Admin UI SHALL assume localhost access only. Post-MVP, better-auth integration will be added.

#### Scenario: No authentication required
- **WHEN** the Admin UI is accessed on localhost
- **THEN** no login page is shown
- **AND** the user is treated as "admin" with full access
