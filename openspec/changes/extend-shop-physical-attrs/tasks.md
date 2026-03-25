## 1. Database Migration

- [x] 1.1 Create `migrations/007_physical_attrs.sql` using rename-first migration strategy: rename `shopProducts.id` → `spu_id`, rename `shopProductVariations.id` → `sku_id`, migrate legacy business columns to `spu_code` / `sku_code`, and add `sku_type` plus physical attribute columns
- [x] 1.2 Migrate all affected foreign keys and column names in related tables: `shopProductAttributes`, `shopProductCategories`, `shopProductImages`, `shopOrderItems`, `shopVariantAttributeValues`
- [x] 1.3 Split `shopOrderItems` semantics during migration: convert order-item `skuId` to backend SKU primary-key reference and preserve business code in `skuCode`
- [ ] 1.4 Verify migration runs cleanly on a fresh database and on a database with existing data (no data loss, no table rewrite)

## 2. Drizzle Schema Update

- [x] 2.1 Update `plugins/shop/src/shared/schema.ts` — refactor `shopProducts` to use `spuId` as primary key, add `spuCode`, `sourcing_platform`, `sourcing_memo`, and keep `name` JSONB as authoritative multilingual name
- [x] 2.2 Update `plugins/shop/src/shared/schema.ts` — refactor `shopProductVariations` to use `skuId` as primary key, replace `productId` with `spuId` foreign key, add `skuCode`, `skuType`, `weight`, `length`, `width`, `height`, `attribute_type`, `purchase_cost`
- [x] 2.3 Update all related table schemas to align foreign keys and field names with `spuId` / `skuId`
- [x] 2.4 Update `shopOrderItems` schema to separate backend primary-key references from display codes (`spuId` / `skuId` vs `skuCode`)

## 3. Zod Validation Schema Update

- [x] 3.1–3.8 All Zod schema tasks completed (product/variant CRUD schemas, inlineCreate schemas, enums, validation audit)

## 4. Inline Create API

- [x] 4.1 Create `products.inlineCreate` tRPC procedure in Shop server router that atomically creates SPU + 1:1 SKU within a database transaction
- [x] 4.2 Implement SKU code auto-generation logic (`AUTO-YYYYMMDD-XXXX` pattern) when `autoGenerate: true` is passed, and define the default SPU code generation rule if `spuCode` is omitted
- [x] 4.3 Implement organization-scoped business code uniqueness pre-check before transaction, with `(organization_id, spu_code)` / `(organization_id, sku_code)` database constraints on Products / Variations as fallback
- [x] 4.4 Define response contract returning `spuId`, `skuId`, `spuCode`, `skuCode`, `weight`, `attributeType`, `nameCn`
- [x] 4.5 Wire permission check — confirmed `pluginProcedure` inherits `shop.products.create` via plugin manifest

## 5. Existing CRUD Router Updates

- [x] 5.1–5.3 Router contracts verified for SPU/SKU fields and 1:1/1:N/N:1 mapping
- [x] 5.4 Updated all affected routers AND frontend hooks/pages/components (14 files total, 0 legacy references remain)
- [x] 5.5 Updated domain services (`validateSPU` → `validateSpuCode`) and helper logic

## 6. Verification

- [x] 6.1 TypeScript type check — all errors pre-existing (zod/v4 compat, DOM types)
- [x] 6.1b Exhaustive grep scan — 0 `product_id`/`variant_id` references remain in source
- [x] 6.2 Test inline-create validation — 27 automated test cases in `inline-create.test.ts` (schema validation, refine rules, output contract, enum coverage)
- [x] 6.3 Test inline-create without skuCode and autoGenerate=false → verify Zod refine rejects
- [x] 6.4 Test inline-create without required fields (weight, nameCn, attributeType) → verify validation error
- [x] 6.5 Test inline-create dimension constraints (positive integers only) → verified via schema tests
- [ ] 6.6 Test migration on existing database with real product data → verify zero data loss (requires live DB)
