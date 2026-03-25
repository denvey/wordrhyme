# Design: Extend Shop Plugin Physical Attributes

## Context

Shop 插件当前有 13 张表的四表核心架构（Products/SPU + ProductVariations/SKU + Attributes + Categories 等），但缺少报价和物流模块所需的物理属性字段。Quotation PRD 明确要求 `plugin-shop` 作为"三层解耦"架构的底层物理真理源，Shipping PRD 的 `calculateRates` RPC 需要商品重量、尺寸和货物属性来驱动运费计算。

当前 `shopProductVariations` 表仅有价格、库存、图片等电商基础字段；`shopProducts` 表缺少中国采购场景的货源信息字段。商品名本身已由现有 `name` JSONB 字段承载多语言，不再新增独立的 `name_cn` 持久化列。本次同时借窗口期统一主键/编码命名：`spuId` / `skuId` 作为稳定主键，`spuCode` / `skuCode` 作为业务编码。字段命名对齐业内标准（Shopify/WooCommerce），不带单位后缀，单位（g/cm）通过 column comment 和文档约定。

## Goals / Non-Goals

**Goals:**
- 将 `spuId` / `skuId` 收敛为 SPU / SKU 主键，并去除 `productId` / `variantId` 这类跨语义命名
- 为 Products / Variations 两表补充 `spuCode` / `skuCode` 业务编码字段
- 为 Variations (SKU) 预留 `skuType`，支撑未来 `single` / `bundle` / `virtual_bundle` 等扩展
- 为 Variants (SKU) 表补齐物流算价所需的物理属性字段（weight, length/width/height, attribute_type, purchase_cost）
- 为 Products (SPU) 表补齐采购货源字段（sourcing_platform, sourcing_memo）
- 提供 inline-create API，支持一次请求同时创建 SPU + 1:1 SKU
- 在项目早期窗口期内完成主键/外键命名收敛，避免后续历史包袱
- 明确以 `skuId` 作为报价、契约、配单、履约的底层统一锚点，并兼容 BOM / 组合映射

**Non-Goals:**
- 不实现商品抓取/爬虫功能 — inline-create 仅提供极简手工建档
- 不修改 Shop 的现有 CRUD 权限模型
- 不在本次 change 中落地完整的阶梯报价引擎；但字段与主键模型必须兼容后续 Pricing / Mapping 扩展

## Decisions

### 1. 新字段全部设为 nullable（而非 NOT NULL + default）

**选择**：除 `attribute_type` 给默认值 `general` 外，其余新字段均为 nullable。
**原因**：Shop 是通用电商插件，非所有业务场景都需要物流属性。只有 Quotation 的 inline-create 表单侧做前端必填校验（如 weight），不在数据库层强制约束，避免破坏现有 CRUD 流程。
**替代方案**：在数据库层面 NOT NULL + default 0 → 被否决，因为 `weight = 0` 对物流引擎来说不是合法数据，它是语义错误而非空值。

### 2. 采购底价 (purchase_cost) 放在 Variants 表

**选择**：将 `purchase_cost` 存储在 SKU/Variants 表而非 SPU/Products 表。
**原因**：同一 SPU 的不同变体（颜色/尺寸）可能采购成本不同。跟随 Quotation PRD 的字段映射表（明确标注 "SKU 表"）。Quotation 模块按 `shop_variant_id` 引用，放在 Variants 表可实现 O(1) 直查。

### 3. `skuId` 作为报价与映射统一锚点

**选择**：下游 Quote Contract、Mapping、履约、库存等模块统一引用 `skuId` 作为底层 SKU 主键；`skuCode` 仅作为展示与人工识别字段。
**原因**：
- `skuId` 是稳定主键，适合跨模块关联
- `skuCode` 可能受业务规则影响，适合对人展示，不适合作为内部唯一引用锚点
- 这样可满足 OmniDS “报价永远挂底层 SKU” 的要求，同时避免后续编码规则变动带来的联动成本

### 4. `shopOrderItems` 同步拆分主键引用与业务编码

**选择**：
- `shopOrderItems.skuId` 迁移为底层 SKU 主键引用
- `shopOrderItems.productId` / `variantId` 迁移为 `spuId` / `skuId`
- 订单项中新增或保留独立的 `skuCode` 业务编码字段用于展示与追踪
**原因**：
- 当前 `shopOrderItems.skuId` 语义是业务编码，而本次全局要把 `skuId` 收敛为主键
- 若不在订单项中显式拆开“主键引用”和“业务编码”，订单、外部映射、履约链路会语义冲突
**替代方案**：保持订单项旧字段语义不变 → 被否决，因为会让 `skuId` 在不同上下文中表示不同概念

### 5. 现有 `id` 列采用 rename 迁移为 `spuId` / `skuId`

**选择**：
- 迁移顺序固定为：
  - `shopProducts.spu_id` → `spu_code`
  - `shopProducts.id` → `spu_id`
  - `shopProductVariations.sku_id` → `sku_code`
  - `shopProductVariations.id` → `sku_id`
- `shopProducts.id` 迁移为新的 `spuId` 主键
- `shopProductVariations.id` 迁移为新的 `skuId` 主键
- 现有业务列 `spu_id` / `sku_id` 重命名并收敛为 `spu_code` / `sku_code`
**原因**：
- 现有 `id` 已经是稳定 UUID 主键，直接复用其值比“删除主键后重新建一套主键”风险更低
- 这样可以最大化复用已有关联关系语义，只需要对字段名和外键指向做一次性收敛
- 若继续保留 `id` 作为冗余列，会形成双主键语义，长期更混乱
**替代方案**：
- 删除 `id` 并用现有 `spu_id` / `sku_id` 业务列升格为主键 → 被否决，因为需要先处理现有业务列与关联关系的语义冲突
- 保留 `id` 作为普通列 → 被否决，因为会制造冗余且缺乏明确权威主键

### 6. 关联表在本次一并完成外键命名迁移

**选择**：以下关联表与字段在本次 change 中统一迁移到新的主键命名：
- `shopProductAttributes.productId` → `spuId`
- `shopProductCategories.productId` → `spuId`
- `shopProductImages.productId` / `variantId` → `spuId` / `skuId`
- `shopOrderItems.productId` / `variantId` → `spuId` / `skuId`
- `shopVariantAttributeValues.variantId` → `skuId`
**原因**：
- 若核心表已改成 `spuId` / `skuId`，关联表继续保留旧命名会导致模型分裂
- 本项目仍处早期，适合一次性完成跨表一致性收敛
**替代方案**：仅迁移核心表，关联表保持旧命名 → 被否决，因为会让命名兼容层长期存在并增加认知负担

### 7. 所有业务编码校验逻辑切换到 `spuCode` / `skuCode`

**选择**：现有对 `spuId` / `skuId` 的格式校验、展示、输入约束逻辑统一改为面向 `spuCode` / `skuCode`。
**原因**：
- 当前代码库已存在把 `spuId` 当业务编码校验的逻辑
- 一旦 `spuId` / `skuId` 变成主键，再继续沿用旧校验会造成主键语义污染
**替代方案**：暂时保留旧校验逻辑 → 被否决，因为会让代码在实现阶段出现隐性语义错误

### 8. Inline-create 使用事务保证 SPU + SKU 原子创建

**选择**：在单个数据库事务中同时创建 Products 记录和 Variations 记录。
**原因**：Quotation PRD 要求 "50-200ms 内弹窗销毁并回填"，不允许出现 SPU 创建成功但 SKU 创建失败的脏数据状态。使用 Drizzle 的 `db.transaction()` 封装。

### 9. `spuId` / `skuId` 作为主键，`spuCode` / `skuCode` 作为业务编码

**选择**：
- `shopProducts.spuId` 作为 SPU 主键
- `shopProductVariations.skuId` 作为 SKU 主键
- `shopProductVariations.spuId` 作为指向 `shopProducts.spuId` 的外键
- Products / Variations 两表分别新增 `spuCode` / `skuCode` 作为业务编码列
- `shopProductVariations.skuType` 作为 SKU 类型字段，默认 `single`
**原因**：
- `xxxId` 在本项目中直接表示实体主键，避免与 `id` / `productId` / `variantId` 混用
- `spuCode` / `skuCode` 明确表达业务编码语义，避免将 `skuId` 误解为业务编码
- `skuType` 为组合 SKU / BOM / 盲盒等场景预留统一入口
- 统一命名后，SPU / SKU 领域对象与表结构一一对应，后续报价和库存引用更直接

### 10. `purchase_cost` 在 Phase 1 明确为 CNY 分

**选择**：`purchase_cost` 本次固定定义为人民币分（CNY cents），暂不引入 `purchase_currency`。
**原因**：
- 当前采购场景主要面向 1688 / 国内供货链，Phase 1 以人民币为主
- 提前引入多币种采购会扩大报价、采购、汇率联动范围
**替代方案**：现在就增加 `purchase_currency` → 暂缓，后续如出现明确多币种采购需求，再通过独立 change 扩展

### 11. Inline-create 契约使用 camelCase，并补齐现有表必填字段的服务端映射

**选择**：`inlineCreate` 的 tRPC 输入/输出使用 camelCase：`spuCode`、`skuCode`、`nameCn`、`attributeType`、`sourceUrl`、`autoGenerate`。其中 `nameCn` 仅作为便捷输入，不新增数据库列；数据库层映射到 `spu_code`、`sku_code`、`attribute_type`、`url` 与现有 `name` JSONB。
**原因**：Shop 插件现有 Drizzle/Zod/tRPC 代码均使用 TypeScript 命名风格；若 inline-create 单独使用 snake_case，会造成调用方与现有 CRUD 约定不一致。
**补充映射**：
- `spuCode` → `shopProducts.spuCode`
- `skuCode` → `shopProductVariations.skuCode`
- `nameCn`（不落库）→ `shopProducts.name = { "zh-CN": nameCn }`，满足现有 `name` JSONB 非空约束
- `sourceUrl` → `shopProducts.url`
- `spuId` / `skuId` 由服务端生成，调用方无需提供

### 12. Inline-create 首期不接收 `images`

**选择**：`inlineCreate` 首期不接收 `images` 字段，图片仍由现有产品图片能力单独维护。
**原因**：
- 现有 `shopProductImages` 已有独立 router / hook / 主图同步逻辑
- 在主键重塑阶段将图片写入与 inline create 耦合会扩大改造面
**替代方案**：在 inlineCreate 中直接支持 `images` → 暂缓，后续可通过独立增强 change 补充

### 13. 单 SKU 商品仍保留 SKU 行

**选择**：即使商品只有一个可售卖规格，也仍然落一条 SKU 记录。
**原因**：
- 报价、物流、成本、库存天然都以 SKU 为最细粒度
- 保持“每个可售卖单元必有 SKU”比“有时有 SKU、有时没有 SKU”更容易维护
- `inlineCreate` 固定创建 1 条 SPU + 1 条 SKU，可覆盖单 SKU 商品，也能自然演进到多 SKU

### 14. 支持 BOM / 组合映射

**选择**：系统显式支持一个前端商品映射到多个底层 `skuId`，并允许某个底层 `skuId` 自身为 `bundle` 类型 SKU，以承接组合 SKU、礼盒、盲盒等场景。
**原因**：
- OmniDS 文档明确要求支持 1:1、1:N、N:1 的 Mapping 关系
- 组合商品在报价、仓储、履约中经常需要两种模式：
  - 直接映射到多个普通 SKU
  - 映射到一个预先建档的组合 SKU（BOM/Combo SKU）
- 预留 `skuType` 后，Shop 底座不会阻塞后续 Mapping / Pricing 扩展

### 15. 新增 migration 文件执行主键/外键收敛与字段扩展

**选择**：新增编号为 `007_physical_attrs.sql` 的 migration 文件，在同一次迁移中完成主键/外键调整、`spuCode` / `skuCode` 字段补充及物理属性扩展。
**原因**：当前项目尚处早期阶段，集中完成命名和键模型收敛，比延续旧模型再叠加兼容层更低成本。

### 16. tRPC inline-create 端点独立于现有 CRUD router

**选择**：在 `products` router 下新增 `inlineCreate` procedure，而非修改现有的 `create` procedure，也不额外暴露 REST 端点。
**原因**：inline-create 的行为是"同时创建 SPU + SKU 并返回组合结果"，与标准的单表 CRUD create 语义完全不同。独立 procedure 保持现有接口不变，降低回归风险。

### 17. SKU / SPU 业务编码遵循租户内唯一，而非跨租户全局唯一

**选择**：`inlineCreate` 只保证 `organizationId + spuCode` / `organizationId + skuCode` 在各自表内唯一，不要求跨租户全局唯一。
**原因**：业务编码是租户域内可读标识，应与组织隔离保持一致，避免无必要的全局索引约束。
**替代方案**：改为跨租户全局唯一 → 被否决，因为这会改变现有多租户模型，并可能影响历史数据导入与外部平台映射。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 新字段 nullable 可能导致下游模块拿到 null 值后计算异常 | Quotation 和 Shipping 模块在消费端做 null guard 校验，inline-create 表单侧做前端必填校验。字段单位（g/cm/cents）通过 column comment 声明，避免歧义 |
| 业务编码租户内唯一校验在高并发下可能竞态 | 数据库侧为 Products / Variations 分别增加 `(organization_id, spu_code)` / `(organization_id, sku_code)` 唯一约束，应用层增加 pre-check + 数据库约束双保险 |
| migration 同时调整主键/外键，执行复杂度高于单纯加列 | 变更限定在项目早期执行；迁移脚本需显式覆盖主键、外键、唯一索引与数据回填步骤，并通过 fresh DB / existing DB 双路径验证 |
| inline-create 可能被滥用创建大量垃圾 SPU/SKU | 该端点显式要求 `shop.products.create` 权限，仅授权用户可调用 |
