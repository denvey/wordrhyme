## ADDED Requirements

### Requirement: Unified Plugin Governance Model

The system SHALL use a single Plugin Contract across all deployment modes. A plugin package MUST remain structurally identical regardless of whether it is used in a multi-tenant SaaS environment or an instance-managed deployment.

The contract includes, at minimum:

- manifest metadata
- capability declarations
- lifecycle hooks
- schema definitions
- migration assets

#### Scenario: Same plugin package used in two deployment modes

- **WHEN** the same plugin package is published to the marketplace
- **AND** one environment installs it as a platform-managed SaaS plugin
- **AND** another environment installs it as an instance-managed plugin
- **THEN** both environments use the same plugin contract and package structure
- **AND** only governance scope and migration trigger strategy differ

### Requirement: Installation Scope is a Governance Concern

The system SHALL model plugin installation target as a governance concern, not as a separate plugin type.

Supported installation scopes MAY include:

- `platform`
- `tenant`
- `instance`

#### Scenario: Instance-managed deployment

- **WHEN** a private deployment installs a plugin for a single managed instance
- **THEN** the system treats it as an instance-scoped installation under the same Plugin Contract
- **AND** this does NOT require a different plugin package format

### Requirement: Multiple Migration Trigger Strategies

The system SHALL support more than one migration trigger strategy under the same plugin governance model.

Supported strategies MAY include:

- startup-managed
- install-managed
- deploy-managed

#### Scenario: SaaS default strategy

- **WHEN** the platform operates in multi-tenant SaaS mode
- **THEN** plugin upgrades default to a platform-managed strategy
- **AND** migrations are executed by the platform runtime or deployment pipeline
- **AND** tenants do not manually upgrade plugin schema

#### Scenario: Instance-managed compatibility strategy

- **WHEN** the platform operates in a private or single-instance deployment mode
- **THEN** plugin installation or enablement MAY trigger initialization and migration
- **AND** this behavior is treated as an instance-managed governance mode
- **AND** not as a separate plugin ecosystem

### Requirement: Shopify-first Default for Marketplace Governance

For marketplace-governed SaaS environments, the system SHALL prefer platform-managed plugin lifecycle governance by default.

#### Scenario: Official marketplace plugin in SaaS

- **WHEN** an official plugin is installed from the marketplace into a multi-tenant SaaS deployment
- **THEN** the plugin version is governed by the platform
- **AND** schema evolution is managed by the platform
- **AND** tenant installation status only controls availability and activation, not package format
