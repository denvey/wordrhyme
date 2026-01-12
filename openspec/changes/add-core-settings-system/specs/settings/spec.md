# Settings Capability Spec

## Overview

The Settings system provides unified configuration management for WordRhyme with three-tier scope hierarchy (Global → Tenant → Plugin), encrypted storage for sensitive data, and Feature Flags for gradual rollout.

---

## ADDED Requirements

### Requirement: Settings Storage

The system SHALL provide a unified settings storage that supports multiple scopes and encrypted values.

#### Scenario: Store global setting
- **WHEN** admin sets a global setting with key "email.smtp.host" and value "smtp.example.com"
- **THEN** the setting is stored with scope "global" and can be retrieved

#### Scenario: Store tenant setting
- **WHEN** admin sets a tenant setting for tenant "t1" with key "email.smtp.host" and value "smtp.tenant1.com"
- **THEN** the setting is stored with scope "tenant" and tenant_id "t1"

#### Scenario: Store encrypted setting
- **WHEN** admin sets a setting with `encrypted: true`
- **THEN** the value is encrypted before storage using AES-256-GCM
- **AND** the encrypted flag is set to true

#### Scenario: Store plugin setting
- **WHEN** plugin "my-plugin" stores a setting with key "api_key"
- **THEN** the key is automatically prefixed as "plugin:my-plugin:api_key"
- **AND** the setting is stored with scope "plugin" and scope_id "my-plugin"

---

### Requirement: Settings Retrieval with Cascade

The system SHALL resolve settings using cascade override: Plugin → Tenant → Global → Default.

#### Scenario: Get tenant setting with override
- **GIVEN** global setting "email.smtp.host" = "smtp.default.com"
- **AND** tenant "t1" setting "email.smtp.host" = "smtp.tenant1.com"
- **WHEN** retrieving "email.smtp.host" for tenant "t1"
- **THEN** return "smtp.tenant1.com"

#### Scenario: Get tenant setting without override
- **GIVEN** global setting "email.smtp.host" = "smtp.default.com"
- **AND** tenant "t2" has no override for "email.smtp.host"
- **WHEN** retrieving "email.smtp.host" for tenant "t2"
- **THEN** return "smtp.default.com"

#### Scenario: Get setting with default value
- **GIVEN** no setting exists for key "nonexistent.key"
- **WHEN** retrieving "nonexistent.key" with default value "fallback"
- **THEN** return "fallback"

#### Scenario: Get encrypted setting
- **WHEN** retrieving a setting that was stored with `encrypted: true`
- **THEN** the value is automatically decrypted before returning

---

### Requirement: Settings Schema Validation

The system SHALL validate settings against optional JSON Schema definitions.

#### Scenario: Valid setting value
- **GIVEN** a setting schema defines "port" as integer between 1 and 65535
- **WHEN** setting "port" to 8080
- **THEN** the value is accepted and stored

#### Scenario: Invalid setting value rejected
- **GIVEN** a setting schema defines "port" as integer between 1 and 65535
- **WHEN** setting "port" to "invalid"
- **THEN** the operation fails with validation error
- **AND** the error message indicates schema violation

---

### Requirement: Settings List and Search

The system SHALL provide listing and searching of settings within a scope.

#### Scenario: List all global settings
- **WHEN** admin requests list of global settings
- **THEN** all global settings are returned with keys, values (decrypted), and metadata

#### Scenario: List tenant settings
- **WHEN** admin requests list of settings for tenant "t1"
- **THEN** all settings for tenant "t1" are returned
- **AND** encrypted values are marked but not exposed in list

#### Scenario: List plugin settings
- **WHEN** plugin "my-plugin" requests its settings list
- **THEN** only settings with prefix "plugin:my-plugin:" are returned
- **AND** the prefix is stripped from returned keys

---

### Requirement: Settings Deletion

The system SHALL support deleting settings with proper authorization.

#### Scenario: Delete single setting
- **WHEN** admin deletes setting "email.smtp.host" at global scope
- **THEN** the setting is removed
- **AND** subsequent get requests fall back to default or return null

#### Scenario: Delete plugin settings on uninstall
- **WHEN** plugin "my-plugin" is uninstalled
- **THEN** all settings with scope "plugin" and scope_id "my-plugin" are deleted

---

### Requirement: Feature Flags

The system SHALL provide feature flags with tenant overrides and condition-based evaluation.

#### Scenario: Check enabled feature flag
- **GIVEN** feature flag "dark_mode" is enabled globally
- **WHEN** checking if "dark_mode" is enabled
- **THEN** return true

#### Scenario: Check disabled feature flag
- **GIVEN** feature flag "beta_feature" is disabled globally
- **WHEN** checking if "beta_feature" is enabled
- **THEN** return false

#### Scenario: Tenant override enables flag
- **GIVEN** feature flag "beta_feature" is disabled globally
- **AND** tenant "t1" has override enabled for "beta_feature"
- **WHEN** checking if "beta_feature" is enabled for tenant "t1"
- **THEN** return true

#### Scenario: Tenant override disables flag
- **GIVEN** feature flag "experimental" is enabled globally
- **AND** tenant "t2" has override disabled for "experimental"
- **WHEN** checking if "experimental" is enabled for tenant "t2"
- **THEN** return false

#### Scenario: Rollout percentage
- **GIVEN** feature flag "gradual_rollout" has rollout_percentage 50
- **WHEN** checking the flag for multiple users
- **THEN** approximately 50% of users have the flag enabled
- **AND** the result is consistent for the same user (based on user ID hash)

#### Scenario: Condition-based evaluation
- **GIVEN** feature flag "admin_tools" has condition `{ type: "user_role", operator: "eq", value: "admin" }`
- **WHEN** checking flag for user with role "admin"
- **THEN** return true
- **WHEN** checking flag for user with role "member"
- **THEN** return false

---

### Requirement: Settings Audit Trail

The system SHALL log all settings changes for audit purposes.

#### Scenario: Setting change logged
- **WHEN** admin changes setting "email.smtp.host" from "old.com" to "new.com"
- **THEN** an audit log entry is created with:
  - Actor (user who made the change)
  - Setting key
  - Old value (redacted if encrypted)
  - New value (redacted if encrypted)
  - Timestamp

#### Scenario: Setting deletion logged
- **WHEN** admin deletes setting "deprecated.config"
- **THEN** an audit log entry is created indicating deletion

---

### Requirement: Plugin Settings API

The system SHALL expose a type-safe settings API to plugins through PluginContext.

#### Scenario: Plugin reads own setting
- **GIVEN** plugin "analytics" has stored setting "tracking_id"
- **WHEN** plugin calls `ctx.settings.get('tracking_id')`
- **THEN** the value is returned

#### Scenario: Plugin writes own setting
- **WHEN** plugin "analytics" calls `ctx.settings.set('api_key', 'secret123', { encrypted: true })`
- **THEN** the value is stored with proper namespace and encryption

#### Scenario: Plugin cannot read other plugin's settings
- **WHEN** plugin "analytics" tries to access "plugin:other-plugin:config"
- **THEN** the operation fails with permission error

#### Scenario: Plugin tenant-level setting
- **WHEN** plugin "analytics" calls `ctx.settings.set('enabled', true, { tenantId: 't1' })`
- **THEN** the setting is stored at tenant level for that plugin
- **AND** only tenant "t1" sees this configuration

---

### Requirement: Settings Permissions

The system SHALL enforce permissions for settings access.

#### Scenario: Admin can read/write global settings
- **GIVEN** user has "settings:write" permission at global scope
- **WHEN** user sets a global setting
- **THEN** the operation succeeds

#### Scenario: Tenant admin can write tenant settings
- **GIVEN** user has "settings:write" permission at tenant scope
- **WHEN** user sets a tenant setting for their tenant
- **THEN** the operation succeeds

#### Scenario: Regular user cannot write settings
- **GIVEN** user does not have "settings:write" permission
- **WHEN** user tries to set any setting
- **THEN** the operation fails with permission denied

#### Scenario: Feature flag management requires permission
- **GIVEN** user does not have "feature-flags:manage" permission
- **WHEN** user tries to create/update/delete a feature flag
- **THEN** the operation fails with permission denied
