## ADDED Requirements

### Requirement: Inline SPU+SKU atomic creation
The system SHALL provide a tRPC procedure (`inlineCreate`) that atomically creates one Product (SPU) record and one associated Variant (SKU) record within a single database transaction. If either creation fails, the entire operation SHALL be rolled back.

#### Scenario: Successful inline creation
- **WHEN** a valid payload is submitted with product fields (`spuCode`, `nameCn`, `sourcingPlatform`, `sourceUrl`) and variant fields (`skuCode`, `weight`, `attributeType`)
- **THEN** the system SHALL create one `shopProducts` record and one `shopProductVariations` record with `spuId` on the SKU row referencing the new SPU
- **AND** the server SHALL auto-generate `spuId` and `skuId`
- **AND** the server SHALL map `spuCode` / `skuCode` to the `spuCode` / `skuCode` column of the respective tables
- **AND** the server SHALL treat `nameCn` as convenience input only and persist `shopProducts.name` as `{ "zh-CN": "<nameCn>" }`

#### Scenario: Transaction rollback on SKU validation failure
- **WHEN** a payload is submitted with a valid product but a duplicate `skuCode` within the same organization
- **THEN** the system SHALL rollback the transaction, no Product record SHALL be persisted, and the response SHALL include a descriptive error indicating the `skuCode` conflict

---

### Requirement: Inline creation input validation
The system SHALL validate the following fields as required in the `inlineCreate` payload:
- `spuCode`: optional string; if omitted the system MAY generate a default SPU business code
- `skuCode`: non-empty string, organization-scoped unique, unless `autoGenerate: true`
- `nameCn`: non-empty string, max 128 characters
- `weight`: positive integer (unit: grams)
- `attributeType`: one of `general`, `battery`, `pure_battery`, `liquid_powder`

All other fields (`length`, `width`, `height`, `purchaseCost`, `sourcingPlatform`, `sourceUrl`, `sourcingMemo`) SHALL be optional.

#### Scenario: Missing required weight
- **WHEN** a payload is submitted without `weight`
- **THEN** the system SHALL reject the request with a validation error before any database write

#### Scenario: SKU code auto-generation hint
- **WHEN** the caller omits `skuCode` and sends `autoGenerate: true`
- **THEN** the system SHALL generate a unique code following the pattern `AUTO-YYYYMMDD-XXXX` (4 random alphanumeric characters) and use it as the SKU row's `skuCode`

#### Scenario: Single-SKU product still creates a SKU row
- **WHEN** a caller creates a product with no extra variant dimensions such as color or size
- **THEN** the system SHALL still create exactly one SKU row
- **AND** downstream modules SHALL reference that purchasable unit by `skuId`

### Requirement: Quote and mapping anchor on `skuId`
The system SHALL use `skuId` as the canonical backend SKU identifier for Quote Contracts, Mapping, inventory, and fulfillment integrations. `skuCode` SHALL remain a business-facing code only.

#### Scenario: Quote contract binds to backend SKU
- **WHEN** a quotation or pricing module needs to lock a price to a backend SKU
- **THEN** it SHALL persist and reference the target SKU by `skuId`
- **AND** it MAY display `skuCode` to the user for recognition

---

### Requirement: Inline creation response contract
The system SHALL return the following fields in the `inlineCreate` response:
- `spuId`: the created SPU primary key
- `skuId`: the created SKU primary key
- `spuCode`: the stored SPU business code
- `skuCode`: the stored SKU business code
- `weight`: the stored weight (grams)
- `attributeType`: the stored cargo type
- `nameCn`: the submitted Chinese convenience name used to build the persisted multilingual `name`

#### Scenario: Response used for quotation item binding
- **WHEN** the Quotation module calls `inlineCreate` and receives a response
- **THEN** it SHALL use `skuId` as the canonical SKU identifier to bind the new item into the quotation detail list

---

### Requirement: Inline creation permission control
The `inlineCreate` procedure SHALL be protected by the Shop plugin's existing permission system. Only users with `shop.products.create` permission SHALL be able to invoke this endpoint.

#### Scenario: Unauthorized user blocked
- **WHEN** a user without `shop.products.create` permission calls `inlineCreate`
- **THEN** the system SHALL return a permission denied error without creating any records
