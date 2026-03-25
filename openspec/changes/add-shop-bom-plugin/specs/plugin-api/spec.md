## ADDED Requirements

### Requirement: BOM plugin consumes Shop SKU identity through plugin boundaries
The system SHALL allow the BOM plugin to consume Shop SKU identity and type information through stable plugin-facing contracts without embedding BOM tables into the Shop plugin.

#### Scenario: BOM plugin validates bundle root using Shop SKU data
- **WHEN** the BOM plugin creates or updates a BOM header
- **THEN** it SHALL verify through Shop plugin data or contracts that the target SKU exists and is `bundle` type

#### Scenario: Shop plugin remains BOM-agnostic
- **WHEN** the BOM plugin is installed or removed
- **THEN** the Shop plugin SHALL continue to operate without requiring built-in BOM table ownership
