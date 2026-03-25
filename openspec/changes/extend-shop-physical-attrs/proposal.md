# Change: Extend Shop Plugin Physical Attributes

## Why

Quotation（报价）和 Shipping（物流）两大业务模块均强依赖 Shop 插件的商品物理属性（重量、尺寸、货物类型）来驱动运费试算与毛利核算。当前 Shop 插件的四表架构缺失这些关键物理字段，导致上游模块无法完成核心业务闭环。同时，报价系统需要从报价工作台内联快速建档（Inline SKU Creation），避免销售跳页操作打断出单心流。

## What Changes

- **调整 Shop 主键/编码模型**：将 `shopProducts.spuId` 定义为 SPU 主键，将 `shopProductVariations.skuId` 定义为 SKU 主键；新增 `spuCode` / `skuCode` 作为各自业务编码字段，不再使用 `productId` / `variantId`
- **扩展 SKU/Variants 表**：新增 `skuCode`（SKU 业务编码）、`weight`（实际重量，单位 g）、`length/width/height`（包装尺寸，单位 cm）、`attribute_type`（普货/带电/液体等货物属性）、`purchase_cost`（采购底价）字段
- **预留 SKU 类型**：新增 `skuType` 字段，用于区分 `single` / `bundle` 等 SKU 类型，为后续组合 SKU / BOM 打底
- **扩展 SPU/Products 表**：新增 `spuCode`（SPU 业务编码）、`sourcing_platform`（货源渠道）、`sourcing_memo`（内部采购附言）字段
- **新增 Inline Create API**：在 Shop 插件 tRPC router 中新增 `products.inlineCreate` procedure，支持一次请求同时创建 SPU + 1:1 SKU 并回填至调用方
- **新增数据库迁移**：为上述新字段创建 migration SQL
- **更新 Zod Schema / tRPC Router**：确保新字段在 CRUD 接口和前端类型中可用

## Capabilities

### New Capabilities
- `shop-physical-attrs`: 为 Shop 插件的 Products (SPU) 和 Variants (SKU) 表扩展物理属性字段（重量、尺寸、货物类型、采购价、货源信息），并提供相应的 CRUD 支持
- `shop-inline-create`: 提供从报价工作台内联极速建档的 API 端点（同时创建 SPU + 1:1 SKU），支持无跳转建档回填

### Modified Capabilities
_(无现有 spec 变更)_

## Impact

- **受影响代码**：
  - `plugins/shop/src/shared/schema.ts` — 调整 `shopProducts` / `shopProductVariations` 主键与外键命名，新增 `spuCode` / `skuCode` 与物理属性字段定义
  - `plugins/shop/src/shared/schemas.ts` — 更新 Zod 校验 schema
  - `plugins/shop/src/server/routers/products.ts` — 现有 `id` / `spuId` 语义重塑，upsert 与 CRUD 输入输出需同步
  - `plugins/shop/src/server/routers/variations.ts` — 现有 `productId` / `id` / `skuId` 语义重塑，batchCreate 与 CRUD 输入输出需同步
  - `plugins/shop/src/server/routers/product-images.ts` — `productId` 引用需随 SPU 主键迁移策略一并调整
  - `plugins/shop/src/server/routers/external-mappings.ts` — 通过 `shopOrderItems` 的 `productId` / `variantId` 引用链受到影响
  - `plugins/shop/src/admin/hooks/useProductImages.ts` 及相关 Product Detail 页面 — 现有 `productId` / `variantId` 输入输出命名需同步调整
  - `plugins/shop/src/shared/product.service.ts` 及其他 ID 校验/格式化逻辑 — `spuId` / `skuId` 从业务编码切换为主键后需同步改为 `spuCode` / `skuCode`
  - `plugins/shop/migrations/` — 新增 migration SQL 文件
  - 受影响关联表包括：`shopProductAttributes`、`shopProductCategories`、`shopProductImages`、`shopOrderItems`、`shopVariantAttributeValues`
- **受影响 API**：Shop 插件的 product/variant CRUD tRPC 路由，新增 `products.inlineCreate` procedure
- **跨模块依赖**：Quotation 模块（ds-quotation）和 Shipping 模块将作为消费方引用这些新字段
- **有控制的模型重构**：本次除新增字段外，还会重塑 SPU/SKU 主键与外键命名；由于项目仍处于早期阶段，接受这次受控的 schema / API 调整以换取后续长期一致性

## Contract Clarifications

- `inlineCreate` 仅定义为 tRPC procedure，不额外引入 REST 端点
- `inlineCreate` 输入/输出契约使用 TypeScript/camelCase 命名；数据库列仍保持 snake_case
- `shopProducts.spuId` 为主键，`shopProductVariations.skuId` 为主键，`shopProductVariations.spuId` 为指向 SPU 的外键
- `shopProducts.spuCode` / `shopProductVariations.skuCode` 分别承载 SPU / SKU 业务编码，数据库与 API 命名保持一致
- 报价、契约、配单、履约等下游模块统一以 `skuId` 作为底层 SKU 的主引用键，`skuCode` 仅用于业务展示与人工识别
- 本次主键重塑是显式破坏性 schema 迁移：所有仍引用旧 `id` / `productId` / `variantId` 的关联表与 router 必须同步迁移
- `shopOrderItems` 中现有业务编码语义字段需同步收敛：订单项的 `skuId` 改为底层 SKU 主键引用，业务编码单独落到 `skuCode`
- `inlineCreate` 请求中允许调用方传入 `skuCode`，若 `autoGenerate: true` 且未传入，则服务端自动生成 `skuCode`
- `spuId` / `skuId` 由服务端生成，调用方无需传入
- 服务端创建 SPU 时会同步写入：
  - `nameCn`（便捷输入字段，不落库）→ `shopProducts.name`，格式为 `{ "zh-CN": "<nameCn>" }`
  - `sourceUrl` → `shopProducts.url`
- 单 SKU 商品仍会落一条 SKU 记录；`inlineCreate` 固定创建 1 条 SPU + 1 条 SKU，保证报价、库存、物流、定价都以可售卖单元（SKU）为统一锚点
- 系统需支持 BOM / 组合映射：一个前端商品可映射到 1 个或多个底层 `skuId`，且某个 `skuId` 可声明为 `bundle` 类型以承接组合 SKU 场景
