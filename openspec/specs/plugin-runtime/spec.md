# plugin-runtime Specification

## Purpose
Define how plugins are discovered, validated, loaded, isolated, and executed at runtime.
## Requirements
### Requirement: Plugin Manifest Validation

The system SHALL scan the `/plugins` directory for `manifest.json` files. Each manifest MUST conform to the schema: `{ pluginId, version, vendor, type, runtime, engines.wordrhyme, capabilities, permissions?, server, admin }`. Invalid manifests SHALL be rejected with a descriptive error. Validation SHALL be performed using Zod schemas.

For plugins that include `admin.remoteEntry`, the value SHALL be treated as a file path relative to the plugin root (example: `"./dist/admin/remoteEntry.js"`). The server SHALL publish a resolved URL for the host (example: `"/plugins/{pluginId}/static/admin/remoteEntry.js"`).

#### Scenario: Valid manifest accepted
- **WHEN** a plugin directory contains a valid `manifest.json`
- **THEN** the plugin is registered in the `plugins` table
- **AND** the plugin status is set to `enabled`
- **AND** the plugin metadata is available to the system

#### Scenario: Invalid manifest rejected
- **WHEN** a plugin manifest is missing the `pluginId` field
- **THEN** the plugin is marked as `invalid`
- **AND** an audit log entry is created with the validation error
- **AND** the plugin is NOT loaded

#### Scenario: Zod validation catches type errors
- **WHEN** a plugin manifest has `version: 123` (number instead of string)
- **THEN** Zod validation fails with a descriptive error
- **AND** the plugin is marked as `invalid`

#### Scenario: Version mismatch rejected
- **WHEN** a plugin declares `engines.wordrhyme: "0.2.x"` but Core is `0.1.x`
- **THEN** the plugin is disabled during dependency resolution
- **AND** an error is logged indicating version incompatibility

---

### Requirement: Plugin Lifecycle Management

Plugins SHALL support lifecycle hooks: `onInstall`, `onEnable`, `onDisable`, `onUninstall`. The system MUST call these hooks at the appropriate times. Lifecycle hooks MUST execute within error boundaries (plugin errors SHALL NOT crash the system).

#### Scenario: Install lifecycle
- **WHEN** a plugin is installed for the first time
- **THEN** the `onInstall` hook is called (if defined)
- **AND** the `onEnable` hook is called
- **AND** the plugin is marked as `enabled` in the database

#### Scenario: Enable lifecycle
- **WHEN** a disabled plugin is enabled
- **THEN** the `onEnable` hook is called
- **AND** the plugin status is updated to `enabled`

#### Scenario: Disable lifecycle
- **WHEN** an enabled plugin is disabled
- **THEN** the `onDisable` hook is called
- **AND** the plugin status is updated to `disabled`
- **AND** the plugin's routes and UI are unregistered

#### Scenario: Uninstall lifecycle
- **WHEN** a plugin is uninstalled
- **THEN** the `onDisable` hook is called (if enabled)
- **AND** the `onUninstall` hook is called
- **AND** the plugin files are removed from `/plugins`
- **AND** the plugin is removed from the database

#### Scenario: Lifecycle hook error isolation
- **WHEN** a plugin's `onEnable` hook throws an error
- **THEN** the error is caught and logged
- **AND** the plugin is marked as `crashed`
- **AND** other plugins continue to load normally
- **AND** the system does NOT crash

---

### Requirement: Controlled Runtime Execution (MVP-Simplified)

All plugin execution (lifecycle hooks and request handlers) MUST run behind a Runtime Adapter that implements the abstract `PluginRuntime` interface. For the MVP, the adapter SHALL implement **Logical Isolation (In-Process)**. The adapter MUST enforce, at minimum: **wall-time execution timeouts** (for async tasks) and `try/catch` error boundaries. Exceeding wall-time limits SHALL result in task cancellation where possible and SHALL increment the plugin's error counter.

#### Scenario: Async lifecycle hook timeout
- **WHEN** a plugin's `onEnable` (asynchronous) does not complete within the configured wall-time timeout
- **THEN** the runtime rejects the promise
- **AND** the plugin is marked as `degraded` or `disabled`
- **AND** the system continues booting

#### Scenario: Error isolation in same process
- **WHEN** a plugin's `onEnable` throws a synchronous exception
- **THEN** the Runtime Adapter catches the exception
- **AND** the error is logged without crashing the Core process
- **AND** the plugin status is updated to `disabled`

---

### Requirement: Plugin Isolation

Plugins MUST be isolated from each other and from Core internals. Plugins SHALL NOT access other plugins' state or data. Plugins SHALL only interact with Core via the Capability API (`@wordrhyme/plugin-api`).

#### Scenario: Plugin cannot access Core internals
- **WHEN** a plugin attempts to `import '@wordrhyme/core/internal'`
- **THEN** the import fails (module not found or access denied)
- **AND** the plugin cannot load

#### Scenario: Plugin cannot access another plugin's data
- **WHEN** Plugin A attempts to read Plugin B's data via direct database access
- **THEN** the query returns no results (tenant + plugin isolation enforced)
- **OR** the Capability API blocks the query (capability not declared)

---

### Requirement: Plugin Capability White-listing

Plugins SHALL only access capabilities declared in their manifest's `capabilities` section. Undeclared capabilities MUST be denied at injection time.

#### Scenario: Declared capability granted
- **WHEN** a plugin declares `capabilities.data.read: true` in its manifest
- **THEN** the plugin receives a Data Capability instance during `onEnable`
- **AND** the plugin can call `ctx.data.read(...)`

#### Scenario: Undeclared capability denied
- **WHEN** a plugin does NOT declare a Data capability in its manifest
- **THEN** the plugin does NOT receive a Data Capability instance
- **AND** attempting to call `ctx.data.*` throws an error

---

### Requirement: Plugin Dependency Resolution

The system SHALL build a dependency graph based on plugin manifests. Circular dependencies SHALL be rejected. Conflicting plugins SHALL NOT be enabled simultaneously.

#### Scenario: Valid dependencies resolved
- **WHEN** Plugin A declares `dependencies: ["plugin-b@1.x"]`
- **AND** Plugin B version 1.2.0 is installed
- **THEN** both plugins load successfully
- **AND** Plugin B loads before Plugin A

#### Scenario: Circular dependency rejected
- **WHEN** Plugin A depends on Plugin B
- **AND** Plugin B depends on Plugin A
- **THEN** both plugins are marked as `invalid`
- **AND** an error is logged indicating circular dependency

#### Scenario: Conflicting plugins disabled
- **WHEN** Plugin A declares `conflicts: ["plugin-b"]`
- **AND** both Plugin A and Plugin B are installed
- **THEN** the system disables one of them (based on priority or install order)
- **AND** logs a warning about the conflict

---

### Requirement: Plugin Permission Registration

When a plugin is installed, the system SHALL extract permission definitions from the manifest and register them in the `permissions` table. Each permission SHALL be namespaced as `plugin:{pluginId}:{key}`. The system SHALL validate that plugin-declared permissions do not use reserved namespaces (`core`, `system`).

#### Scenario: Plugin permissions auto-registered
- **WHEN** a plugin manifest contains:
  ```json
  {
    "pluginId": "com.vendor.seo",
    "permissions": {
      "definitions": [
        { "key": "settings.read", "description": "Read SEO settings" },
        { "key": "settings.write", "description": "Modify SEO settings" }
      ]
    }
  }
  ```
- **THEN** two permissions are inserted into `permissions` table:
  - `capability: "plugin:com.vendor.seo:settings.read", source: "com.vendor.seo"`
  - `capability: "plugin:com.vendor.seo:settings.write", source: "com.vendor.seo"`

#### Scenario: Reserved namespace rejected
- **WHEN** a plugin manifest contains permission with key `core:users:manage`
- **THEN** manifest validation fails
- **AND** the plugin is marked as `invalid`
- **AND** error logged: "Plugin permissions cannot use reserved namespaces: core, system"

#### Scenario: Plugin permissions cleaned up on uninstall
- **WHEN** a plugin is uninstalled
- **THEN** all rows in `permissions` table with `source = pluginId` are deleted
- **AND** cached permission results are invalidated
- **AND** users lose access to those permissions on next request

---
