# admin-ui-host Specification

## Purpose
TBD - created by archiving change add-mvp-core-implementation. Update Purpose after archive.
## Requirements
### Requirement: @wordrhyme/ui Package

The Admin UI SHALL use the centralized `@wordrhyme/ui` package for all UI components. This package SHALL be shared across Admin, Web, and Plugins via Module Federation to eliminate component duplication.

#### Scenario: UI package installed
- **WHEN** the Admin UI project is initialized
- **THEN** `@wordrhyme/ui` is installed as a dependency
- **AND** all UI components are imported from `@wordrhyme/ui`
- **AND** the package is configured as a Module Federation shared dependency

#### Scenario: Plugin imports UI components
- **WHEN** a plugin needs UI components
- **THEN** it imports from `@wordrhyme/ui` (e.g., `import { Button } from '@wordrhyme/ui'`)
- **AND** Module Federation loads components from the host (no duplication)
- **AND** the plugin bundle does NOT include duplicate UI code

---

### Requirement: shadcn/ui + Tailwind 4.0 in @wordrhyme/ui

The `@wordrhyme/ui` package SHALL contain all shadcn/ui components and Tailwind CSS 4.0 configuration. The sidebar-07 template SHALL be included in this package.

#### Scenario: @wordrhyme/ui package structure
- **WHEN** `packages/ui` is created
- **THEN** shadcn/ui is initialized via `npx shadcn@latest init`
- **AND** sidebar-07 template is installed via `npx shadcn@latest add sidebar-07`
- **AND** Tailwind CSS 4.0 is configured with `@theme` directive in `src/styles/globals.css`
- **AND** all components are exported from `src/index.ts`

#### Scenario: shadcn/ui components available
- **WHEN** Admin/Web/Plugin imports from `@wordrhyme/ui`
- **THEN** the following are available:
  - UI primitives: `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`, `Table`, `Form`, etc.
  - Layout components: `AppSidebar`, `NavMain`, `NavUser`, `TeamSwitcher` (sidebar-07)
  - Utilities: `cn()` function, Tailwind theme classes

---

### Requirement: Module Federation Configuration

The Admin UI host SHALL be configured with Rsbuild + Module Federation 2.0. The host SHALL define extension points for plugins to inject UI components.

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

---

### Requirement: Permission-Based Menu Loading

The host SHALL fetch menus from the `menus` table via tRPC API. Menus SHALL be filtered based on the current user's permissions. If a menu has no `requiredPermission`, it SHALL be visible to admin users by default.

#### Scenario: Menus fetched from database
- **WHEN** the Admin UI initializes
- **THEN** it calls `trpc.menu.list.useQuery({ target: 'admin' })`
- **AND** the server returns menu items from `menus` table filtered by user permissions
- **AND** the sidebar renders the menu items in hierarchical order

#### Scenario: Menu with required permission
- **WHEN** a menu item has `requiredPermission = 'plugin:seo:dashboard.read'`
- **AND** the current user has that permission
- **THEN** the menu item is displayed in the sidebar
- **AND** clicking it navigates to the menu's `path`

#### Scenario: Menu without required permission hidden
- **WHEN** a menu item has `requiredPermission = 'plugin:seo:settings.write'`
- **AND** the current user does NOT have that permission
- **THEN** the menu item is NOT displayed in the sidebar

#### Scenario: Menu without permission defaults to admin
- **WHEN** a menu item has `requiredPermission = null`
- **AND** the current user has admin role
- **THEN** the menu item is displayed (default fallback)

#### Scenario: Parent menu hidden cascades to children
- **WHEN** a parent menu is hidden due to permission check
- **THEN** all child menus are automatically hidden
- **AND** the child permission checks are skipped (optimization)

---

### Requirement: Dynamic Menu Registration on Plugin Install

When a plugin is installed, the server SHALL parse `admin.menus` from the manifest and insert records into `menus` table with `source = pluginId`. The Admin UI SHALL automatically refresh menus after plugin installation.

#### Scenario: Plugin menus registered on install
- **WHEN** a plugin is installed with manifest:
  ```json
  {
    "pluginId": "com.vendor.seo",
    "admin": {
      "menus": [
        {
          "id": "seo-dashboard",
          "label": "SEO Dashboard",
          "icon": "ChartBar",
          "path": "/plugins/seo/dashboard",
          "order": 10
        }
      ]
    }
  }
  ```
- **THEN** the server inserts a row into `menus` table with `source = 'com.vendor.seo'`
- **AND** the Admin UI refetches menu list
- **AND** the new menu appears in sidebar

#### Scenario: Plugin menus removed on uninstall
- **WHEN** a plugin is uninstalled
- **THEN** all rows in `menus` where `source = {uninstalledPluginId}` are deleted
- **AND** the Admin UI removes the menu items from sidebar

---

