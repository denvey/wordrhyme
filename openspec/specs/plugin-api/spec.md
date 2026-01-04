# plugin-api Specification

## Purpose
TBD - created by archiving change add-mvp-core-implementation. Update Purpose after archive.
## Requirements
### Requirement: Plugin API Package

A separate npm package `@wordrhyme/plugin-api` SHALL be created. This package MUST export TypeScript types and runtime helpers for plugin authors. Plugins SHALL only import from `@wordrhyme/plugin-api`, never from `@wordrhyme/core`.

#### Scenario: Plugin imports API package
- **WHEN** a plugin imports `import { definePlugin } from '@wordrhyme/plugin-api'`
- **THEN** the import succeeds
- **AND** TypeScript types are available
- **AND** the plugin can use runtime helpers

---

### Requirement: Capability Interface

The Plugin API SHALL define interfaces for all capabilities: Logger, Permission, Data, Hook (future). Each capability interface MUST be fully documented with TSDoc.

#### Scenario: Logger Capability interface
- **WHEN** a plugin accesses `ctx.logger`
- **THEN** the logger conforms to the `LoggerCapability` interface
- **AND** methods include: `info()`, `warn()`, `error()`, `debug()`

#### Scenario: Permission Capability interface
- **WHEN** a plugin accesses `ctx.permissions`
- **THEN** the permissions conform to the `PermissionCapability` interface
- **AND** method `can(user, capability, scope)` is available

---

### Requirement: Plugin Context Type

The Plugin API SHALL export a `PluginContext` type that includes all available capabilities. Lifecycle hooks SHALL receive this context as their first parameter.

#### Scenario: Lifecycle hook receives context
- **WHEN** a plugin's `onEnable(ctx)` hook is called
- **THEN** `ctx` conforms to the `PluginContext` type
- **AND** `ctx.logger` is available
- **AND** `ctx.permissions` is available (permission adjudication is always available)
- **AND** `ctx.data` is available (only if declared in `manifest.json`)

---

### Requirement: Plugin Manifest Schema

The Plugin API SHALL export a TypeScript type for `manifest.json`. The schema MUST match the validation rules in `PLUGIN_CONTRACT.md`. A Zod schema SHALL be provided for runtime validation.

#### Scenario: Manifest type validates structure
- **WHEN** a plugin author writes a manifest using the `PluginManifest` type
- **THEN** TypeScript validates required fields: `pluginId`, `version`, `vendor`, `type`, `runtime`, `engines.wordrhyme`
- **AND** optional fields are typed correctly: `capabilities`, `server`, `admin`, `permissions`

#### Scenario: Zod schema validates at runtime
- **WHEN** a `manifest.json` file is parsed
- **THEN** the Zod schema validates the structure
- **AND** type errors are caught with descriptive messages
- **AND** the inferred TypeScript type matches the exported type

---

