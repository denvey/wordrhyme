# multi-currency Specification

## Purpose
TBD - created by archiving change add-core-multi-currency-system. Update Purpose after archive.
## Requirements
### Requirement: Currency Configuration
The system SHALL support organization-level currency configuration. Each organization MUST have exactly one base currency and MAY have multiple enabled currencies.

#### Scenario: Create base currency for new organization
- **GIVEN** a new organization is created
- **WHEN** the first currency is added
- **THEN** it SHALL be automatically set as the base currency

#### Scenario: Set base currency
- **GIVEN** an organization with multiple currencies
- **WHEN** an administrator sets a different currency as base
- **THEN** the previous base currency is unset AND the new currency becomes base

#### Scenario: Toggle currency enabled status
- **GIVEN** an enabled non-base currency
- **WHEN** an administrator disables it
- **THEN** the currency is marked as disabled AND is not available for display

### Requirement: Exchange Rate Management
The system SHALL maintain exchange rates between the base currency and all enabled currencies. Exchange rates SHALL be versioned for cache invalidation.

#### Scenario: Set manual exchange rate
- **GIVEN** an organization with base currency USD and enabled currency CNY
- **WHEN** an administrator sets rate USD → CNY = 7.25
- **THEN** the rate is stored with source='manual' AND the global version is incremented

#### Scenario: Query current exchange rate
- **GIVEN** an exchange rate USD → CNY with effective_at = 2024-01-01
- **WHEN** querying the rate on 2024-06-01
- **THEN** the system returns the most recent rate before the query time

#### Scenario: Exchange rate version check
- **GIVEN** a frontend cache with version 5
- **WHEN** querying the server version which returns 6
- **THEN** the frontend SHALL invalidate its cache and fetch new rates

### Requirement: Currency Conversion
The system SHALL provide currency conversion using Banker's rounding (half-to-even). All conversions MUST be traceable and auditable.

#### Scenario: Convert with Banker's rounding
- **GIVEN** amount 1999 cents USD, rate USD → CNY = 7.25
- **WHEN** converting to CNY
- **THEN** the result SHALL be 14493 cents CNY (using Banker's rounding: 1999 * 7.25 = 14492.75 → 14493)

#### Scenario: No conversion for same currency
- **GIVEN** amount 1999 cents USD, target currency USD
- **WHEN** converting
- **THEN** the result SHALL be 1999 cents USD with isConverted = false

#### Scenario: Missing exchange rate fallback
- **GIVEN** no exchange rate exists for USD → EUR
- **WHEN** attempting to convert
- **THEN** the system SHALL return the original currency with isConverted = false

### Requirement: Frontend Price Display
The frontend SHALL display prices in the user's selected currency using cached exchange rates. Converted prices MUST be marked as reference prices.

#### Scenario: Price display with conversion
- **GIVEN** user currency is CNY, base price is 1999 cents USD
- **WHEN** displaying the price
- **THEN** the system displays "¥143.93" using the cached exchange rate

#### Scenario: Price display with note
- **GIVEN** a converted price display with showNote=true
- **WHEN** rendering
- **THEN** the system displays "¥143.93 (参考价格)" or equivalent localized text

#### Scenario: Reactive currency switching
- **GIVEN** a page displaying prices in USD
- **WHEN** user switches to CNY currency
- **THEN** all prices on the page SHALL update immediately without page refresh

### Requirement: Settlement Recording
All payment transactions SHALL record both base and settlement currency amounts with the exchange rate used at settlement time.

#### Scenario: Create transaction with FX fields
- **GIVEN** a plan priced at 1999 cents USD, user settling in CNY
- **WHEN** creating a payment transaction
- **THEN** the transaction SHALL record:
  - base_currency = USD
  - base_amount_cents = 1999
  - settlement_currency = CNY
  - settlement_amount_cents = (converted amount)
  - exchange_rate = (rate used)
  - exchange_rate_at = (timestamp of rate)

### Requirement: Data Isolation
Currency and exchange rate data SHALL be isolated per organization. No cross-organization data access is permitted.

#### Scenario: Organization isolation
- **GIVEN** organization A with USD → CNY rate 7.25
- **GIVEN** organization B with USD → CNY rate 7.30
- **WHEN** querying rates for organization A
- **THEN** only the rate 7.25 is returned

