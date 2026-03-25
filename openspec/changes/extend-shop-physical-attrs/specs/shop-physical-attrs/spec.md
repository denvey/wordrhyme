## ADDED Requirements

### Requirement: Variant physical weight storage
The system SHALL allow storing physical weight in grams (`weight`) on each product variant (SKU) record. The field SHALL accept positive integers only (unit: grams) and SHALL be nullable at the database level.

#### Scenario: Weight stored on variant creation
- **WHEN** a variant is created or updated with `weight: 350`
- **THEN** the database SHALL persist `350` in the `weight` column of `shopProductVariations`

#### Scenario: Weight is nullable for non-logistics products
- **WHEN** a variant is created without providing `weight`
- **THEN** the database SHALL store `NULL` for `weight` without error

---

### Requirement: Variant package dimensions storage
The system SHALL allow storing package dimensions (`length`, `width`, `height`) as nullable integer fields (unit: centimeters) on each product variant (SKU) record.

#### Scenario: Full dimensions stored
- **WHEN** a variant is created with `length: 20`, `width: 10`, `height: 15`
- **THEN** all three dimension values SHALL be persisted in the corresponding columns

#### Scenario: Partial dimensions allowed
- **WHEN** a variant is created with only `length: 20` and no width/height
- **THEN** the system SHALL store `20` for length and `NULL` for width and height without error

---

### Requirement: Variant cargo attribute type
The system SHALL allow classifying each variant by cargo attribute type (`attribute_type`). Valid values SHALL be: `general`, `battery`, `pure_battery`, `liquid_powder`. The field SHALL default to `general`.

#### Scenario: Default attribute type
- **WHEN** a variant is created without specifying `attribute_type`
- **THEN** the system SHALL default to `general`

#### Scenario: Battery type set for restricted goods
- **WHEN** a variant is created with `attribute_type: battery`
- **THEN** the Shipping module SHALL be able to filter channels that support battery cargo when querying rates for this variant

### Requirement: Variant SKU type is reserved for bundle expansion
The system SHALL provide a `sku_type` field on each SKU record to distinguish at least `single` and `bundle` variants. The field SHALL default to `single`.

#### Scenario: Single SKU default type
- **WHEN** a SKU is created without specifying `sku_type`
- **THEN** the system SHALL default `sku_type` to `single`

#### Scenario: Bundle SKU reserved for combo products
- **WHEN** a SKU is created to represent a combo, kit, gift box, or blind-box package
- **THEN** the system SHALL allow `sku_type: bundle`
- **AND** downstream Mapping / Pricing modules MAY treat that SKU as a combo-style backend SKU

---

### Requirement: Variant purchase cost storage
The system SHALL allow storing the purchase cost (`purchase_cost`) as a nullable integer (in CNY cents) on each variant. This field is used by the Quotation module for margin calculation.

#### Scenario: Purchase cost stored
- **WHEN** a variant is created with `purchase_cost: 2500`
- **THEN** the database SHALL persist `2500` (representing ¥25.00) in the `purchase_cost` column

#### Scenario: Purchase cost omitted
- **WHEN** a variant is created without `purchase_cost`
- **THEN** the system SHALL store `NULL` and upstream modules SHALL treat cost as unknown

#### Scenario: Phase 1 purchase cost currency is fixed to CNY
- **WHEN** a variant is created with `purchase_cost`
- **THEN** the system SHALL interpret the stored value as CNY cents
- **AND** multi-currency purchase support SHALL remain out of scope for this change

---

### Requirement: Product sourcing platform
The system SHALL allow recording the sourcing platform (`sourcing_platform`) on each product (SPU). Valid values SHALL include: `1688`, `taobao`, `pinduoduo`, `self_sourced`. The API layer SHALL validate this field against the allowed enum values, while the database column remains nullable text for backward compatibility.

#### Scenario: Sourcing platform recorded
- **WHEN** a product is created with `sourcing_platform: 1688`
- **THEN** the database SHALL persist `1688` in the `sourcing_platform` column of `shopProducts`

#### Scenario: Sourcing platform nullable
- **WHEN** a product is created without `sourcing_platform`
- **THEN** the system SHALL store `NULL` without error

---

### Requirement: Product multilingual name remains JSONB-backed
The system SHALL continue using the existing `name` JSONB field on each product (SPU) as the authoritative multilingual product name. This change SHALL NOT add a dedicated persisted `name_cn` column.

#### Scenario: Chinese name stored inside multilingual name
- **WHEN** a product is created with `name: {"zh-CN": "夏日冰霸杯", "en": "Summer Tumbler"}`
- **THEN** the multilingual JSONB field SHALL persist both localized names and remain queryable as a single source of truth

#### Scenario: Inline create backfills i18n name from Chinese name
- **WHEN** `inlineCreate` is called with only `nameCn: "夏日冰霸杯"`
- **THEN** the system SHALL persist `shopProducts.name = {"zh-CN": "夏日冰霸杯"}` to satisfy the existing non-null product name contract
- **AND** no additional `name_cn` database column SHALL be required

---

### Requirement: Product sourcing memo
The system SHALL allow storing an internal sourcing memo (`sourcing_memo`) as a nullable text field on each product (SPU) for internal procurement notes.

#### Scenario: Memo stored
- **WHEN** a product is created with `sourcing_memo: "老张微信拿货，满500件起批"`
- **THEN** the text SHALL be persisted and retrievable via the product detail API

---

### Requirement: Database migration for new fields
The system SHALL provide a new SQL migration file that reshapes the Shop primary key / foreign key model to use `spu_id` and `sku_id` as primary keys, uses `spu_id` as the SKU foreign key, and adds the new `spu_code` / `sku_code` and physical attribute columns.

#### Scenario: Migration runs on existing database
- **WHEN** the migration is applied to a database with existing product and variant records
- **THEN** all existing records SHALL retain their original data, keys SHALL be migrated to the new `spu_id` / `sku_id` primary key model, and the new columns SHALL be `NULL` (or `general` for `attribute_type`). Column comments SHALL declare units (grams for weight, centimeters for dimensions)

#### Scenario: Migration is idempotent-safe
- **WHEN** the migration file is reviewed
- **THEN** it SHALL explicitly handle key migration, foreign key replacement, `spu_code` / `sku_code` backfill, and new column creation without leaving the schema in a partially migrated state

### Requirement: SPU / SKU business code uniqueness remains organization-scoped
The system SHALL enforce `spu_code` uniqueness per organization in the Products table and `sku_code` uniqueness per organization in the Variations table. This change SHALL NOT introduce a cross-organization global uniqueness requirement.

#### Scenario: Same SKU code allowed in different organizations
- **WHEN** two different organizations create variants with the same `sku_code`
- **THEN** both records MAY coexist without violating this change's requirements

#### Scenario: Duplicate SKU code blocked within one organization
- **WHEN** the same organization creates a second variant with an existing `sku_code`
- **THEN** the system SHALL reject the write via application pre-check or the database unique constraint on `(organization_id, sku_code)`

### Requirement: Every sellable item has a SKU record
The system SHALL always model a sellable unit as a SKU record, even when a product has only one default specification.

#### Scenario: Single-SKU product still has one SKU row
- **WHEN** a product has no meaningful variant matrix
- **THEN** the system SHALL still create one SKU row linked to the parent SPU through `spu_id`

### Requirement: Shop schema SHALL support BOM and combination mapping
The system SHALL support downstream Mapping modules expressing 1:1, 1:N, and N:1 relationships against backend `sku_id` records, including scenarios where a target SKU is a `bundle` type.

#### Scenario: Frontend product maps to multiple backend SKUs
- **WHEN** a frontend product is configured as a multi-pack, bundle, or gift set
- **THEN** the Mapping layer SHALL be able to reference multiple backend `sku_id` records without schema conflict

#### Scenario: Frontend product maps to one bundle SKU
- **WHEN** a frontend product is configured to ship as a pre-packed combo
- **THEN** the Mapping layer SHALL be able to reference a single backend `sku_id` whose `sku_type` is `bundle`
