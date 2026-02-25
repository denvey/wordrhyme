## MODIFIED Requirements

### Requirement: Data Isolation
Currency and exchange rate data SHALL support a platform-tenant hierarchy. Platform-level currencies (`organizationId = 'platform'`) serve as system defaults. Tenant access to currencies SHALL be governed by a policy mode stored in the Settings system under `core.currency.policy`.

The system SHALL support three policy modes:

| Mode | Behavior |
|------|----------|
| `unified` | All tenants use platform currencies and exchange rates. Tenants MUST NOT create or modify currency data. |
| `allow_override` | Tenants inherit platform currencies by default. Tenants MAY create their own currency records to override platform defaults (whole-set override, not per-record). |
| `require_tenant` | Platform provides no default currencies to tenants. Each tenant MUST configure their own currencies before the feature is functional. |

#### Scenario: Unified mode — tenant reads platform currencies
- **GIVEN** the currency policy mode is `unified`
- **AND** the platform organization has currencies USD, CNY, EUR configured
- **WHEN** a tenant queries enabled currencies
- **THEN** the system SHALL return the platform's currencies (USD, CNY, EUR)

#### Scenario: Unified mode — tenant cannot mutate
- **GIVEN** the currency policy mode is `unified`
- **WHEN** a tenant administrator attempts to create, update, or delete a currency
- **THEN** the system SHALL reject the request with a FORBIDDEN error

#### Scenario: Allow override — tenant inherits platform by default
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has no custom currency records
- **WHEN** the tenant queries enabled currencies
- **THEN** the system SHALL return the platform's currencies

#### Scenario: Allow override — tenant uses custom currencies
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has created their own currency records
- **WHEN** the tenant queries enabled currencies
- **THEN** the system SHALL return the tenant's currencies (not the platform's)

#### Scenario: Require tenant — empty without configuration
- **GIVEN** the currency policy mode is `require_tenant`
- **AND** the tenant has no currency records
- **WHEN** the tenant queries enabled currencies
- **THEN** the system SHALL return an empty list

#### Scenario: Organization isolation preserved
- **GIVEN** organization A with custom currencies
- **AND** organization B with no custom currencies (inheriting platform)
- **WHEN** querying currencies for each organization
- **THEN** each organization receives only its resolved currencies with no cross-organization leakage

### Requirement: Mode-Aware Management Reads
All currency and exchange rate read APIs (including admin management list/get) SHALL use mode-aware resolution, not raw tenant-local queries. The resolved data source depends on the current policy mode and whether the tenant has custom data.

#### Scenario: Admin list shows resolved currencies in unified mode
- **GIVEN** the currency policy mode is `unified`
- **AND** a tenant administrator opens the currency management UI
- **WHEN** the management API lists currencies
- **THEN** the system SHALL return the platform's currencies (not the tenant's empty set)
- **AND** all records SHALL be marked as read-only (`source: 'platform'`)

#### Scenario: Admin list shows inherited currencies in allow_override mode
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has no custom currency records
- **WHEN** the management API lists currencies
- **THEN** the system SHALL return the platform's currencies
- **AND** all records SHALL be marked as inherited (`source: 'platform'`)

#### Scenario: Admin list shows tenant currencies after override
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has created custom currency records
- **WHEN** the management API lists currencies
- **THEN** the system SHALL return the tenant's currencies (`source: 'tenant'`)

### Requirement: Mutation Ownership Guard
In `allow_override` mode, tenants SHALL only mutate tenant-owned currency and exchange rate records. Platform-owned records inherited via fallback SHALL be read-only for tenants. Mutation attempts on platform-owned records SHALL be rejected with a FORBIDDEN error.

#### Scenario: Tenant cannot edit inherited platform currency
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has no custom currencies (inheriting platform)
- **WHEN** a tenant administrator attempts to update a platform-owned currency
- **THEN** the system SHALL reject the request with a FORBIDDEN error
- **AND** the error message SHALL indicate that the tenant must "switch to custom" first

#### Scenario: Tenant can edit own currencies after switching to custom
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has switched to custom currencies
- **WHEN** a tenant administrator updates a tenant-owned currency
- **THEN** the system SHALL allow the mutation

#### Scenario: Switch to custom copies platform data
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has no custom currencies
- **WHEN** a tenant administrator triggers "switch to custom"
- **THEN** the system SHALL copy platform currencies and exchange rates to the tenant
- **AND** subsequent queries SHALL return tenant-owned data (`source: 'tenant'`)

#### Scenario: Reset to platform removes tenant data
- **GIVEN** the currency policy mode is `allow_override`
- **AND** the tenant has custom currencies
- **WHEN** a tenant administrator triggers "reset to platform"
- **THEN** the system SHALL delete the tenant's currency and exchange rate records
- **AND** subsequent queries SHALL return platform data (`source: 'platform'`)

## ADDED Requirements

### Requirement: Currency Policy Management
The system SHALL provide API endpoints for platform administrators to get and set the currency tenant policy. The policy SHALL be stored in the Settings system under `core.currency.policy` with `global` scope. The default policy mode SHALL be `unified`.

#### Scenario: Platform admin sets policy mode
- **GIVEN** a platform administrator
- **WHEN** setting the currency policy mode to `allow_override`
- **THEN** the policy is persisted in Settings with key `core.currency.policy`
- **AND** tenant currency queries immediately reflect the new mode

#### Scenario: Non-platform user cannot set policy
- **GIVEN** a tenant administrator (non-platform organization)
- **WHEN** attempting to set the currency policy mode
- **THEN** the system SHALL reject the request with a FORBIDDEN error

#### Scenario: Tenant queries policy visibility
- **GIVEN** any authenticated user
- **WHEN** querying currency policy visibility
- **THEN** the system SHALL return the current mode and whether the tenant has custom currency configuration

### Requirement: Currency Seed at Platform Level
The system SHALL seed default currencies (USD, CNY, EUR, GBP, JPY) for the `platform` organization during system initialization. Tenant organizations SHALL NOT receive independent currency seeds; they inherit from platform based on the active policy mode.

#### Scenario: Platform organization gets default currencies
- **GIVEN** the system is being initialized
- **WHEN** the seed script runs
- **THEN** the `platform` organization SHALL have 5 default currencies with USD as base currency

#### Scenario: Tenant organization has no seeded currencies
- **GIVEN** a new tenant organization is created
- **WHEN** the creation completes
- **THEN** the tenant SHALL have zero currency records in the database
- **AND** currency resolution depends on the active policy mode
