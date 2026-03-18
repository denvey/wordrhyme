# Proposal: DSUni Plugin Integration (v2 — 架构重构)

**Change ID**: `add-dsuni-plugin-integration`
**Schema**: `spec-driven`
**Created**: 2026-01-30
**Updated**: 2026-03-17 (架构决策 v2 — 多模型评审)
**Status**: APPROVED

---

## 架构演进记录

> [!IMPORTANT]
> 本文档经过三模型（Antigravity + ChatGPT + Claude）架构评审，确定了 DSUni 的定位和数据归属。

### v1（旧方案 — 已废弃）

DSUni 自有全部数据表（`plugin_dsuni_products`、`plugin_dsuni_orders` 等），直接管理产品和订单数据。

**废弃原因**：与 Shop 插件功能重叠，数据所有权不清晰。

### v2（当前方案 — A+C 混合）

DSUni 是**纯编排层**，不持有产品/订单数据。数据分层：

```
Shop 插件 → 事实数据（Source of Truth）：产品、订单、External Identity Mapping
DSUni 插件 → 运行态 + 编排：同步状态、店铺连接、调度
平台基建 → 队列、定时任务、设置存储
```

---

## Context

### User Need

将 DSUni 建设为**跨平台渠道连接器**，连接 Shop 插件与外部平台（1688、AliExpress、Shopify、WooCommerce），支持：
- 多店铺管理（同一平台多个店铺）
- 产品导入/推送
- 订单同步
- 同步状态仪表盘

### 关键架构决策

#### 决策 1：数据所有权 — external_mappings 归 Shop

**结论**：external_mappings = External Identity（身份信息），归 Shop 主数据。

**论据**：
1. `checkOrderProcurable` 需要 `order_items JOIN external_mappings`，不可跨插件 JOIN
2. 映射是实体属性（`product.externalIds['shopify']`），不是渠道属性
3. 映射生命周期 ≠ DSUni 生命周期，卸载 DSUni 映射数据仍有效
4. 数据归属必须稳定，功能可以变化 — 插件系统核心原则

#### 决策 2：同步状态从 external_mappings 分离

**结论**：Shop 的 `external_mappings` 只保留静态映射，同步运行态（status/error/retry）移到 DSUni 自有的 `sync_states` 表。

**论据**：映射 = 低频事实数据；同步状态 = 高频运行态。分离后互不影响。

#### 决策 3：DSUni 不自建任务队列

**结论**：使用平台 `ctx.queue`（PluginQueueCapability）和 `scheduledTasks`。

**论据**：平台已提供完整的 addJob/getJobStatus/cancelJob + 优先级 + 重试策略 + cron 调度。

#### 决策 4：支持同平台多店铺

**结论**：DSUni 需要 `stores` 表记录店铺连接（一个平台多个店铺），凭据通过 `ctx.settings` 加密存储。

---

## Requirements

### Requirement 1: DSUni 核心 — 纯编排层

**Priority**: MUST HAVE

DSUni 插件定位为**编排器**，不直接操作 Shop 数据库表。

#### Scenario: DSUni 通过 Shop API 操作数据
**WHEN** DSUni 需要创建/查询产品和订单
**THEN** 它调用 `pluginApis.shop.products.create()` 等 tRPC API
**AND** 不直接 `ctx.db.insert({ table: 'products' })`
**AND** 不 import Shop 的 Drizzle schema

#### Scenario: DSUni 通过 Shop API 操作映射
**WHEN** DSUni 导入外部产品后需要记录映射
**THEN** 调用 `pluginApis.shop.externalMappings.batchLink()` 创建映射
**AND** 不直接写入 `shop_external_mappings` 表

### Requirement 2: DSUni 自有数据 — stores + sync_states

**Priority**: MUST HAVE

#### Scenario: stores 表支持多店铺
**WHEN** 用户连接外部平台
**THEN** 在 `plugin_dsuni_stores` 表创建记录
**AND** 同一平台可以有多个店铺（美国站、欧洲站等）
**AND** OAuth 凭据通过 `ctx.settings.set(key, value, { encrypted: true })` 加密存储
**AND** `stores` 表只存引用 key，不存明文凭据

#### Scenario: sync_states 表跟踪同步状态
**WHEN** DSUni 同步一个 mapping 到外部平台
**THEN** 在 `plugin_dsuni_sync_states` 表记录状态
**AND** `mapping_id` 为 soft FK（逻辑外键，无数据库约束）
**AND** 此表可删除/可重建，不影响 Shop 主数据

### Requirement 3: Shop 需补充的 API

**Priority**: MUST HAVE

#### Scenario: Shop 提供批量映射查询
**WHEN** DSUni 需要批量操作映射
**THEN** Shop 的 `externalMappingsRouter` 提供以下 API：
- `batchGetByEntityIds({ entityType, entityIds[], platform? })`
- `getByExternalIds({ platform, externalIds[] })`
- `exists({ entityType, entityId, platform })`
- `listByPlatform({ platform, entityType?, limit?, offset? })`

### Requirement 4: Shop external_mappings 表结构调整

**Priority**: MUST HAVE

#### Scenario: 移除同步状态字段
**WHEN** 采用 A+C 混合架构
**THEN** Shop 的 `external_mappings` 表移除：`sync_status`、`last_synced_at`、`sync_error`
**AND** 这些字段移到 DSUni 的 `sync_states` 表

### Requirement 5: 异步同步引擎（使用平台基建）

**Priority**: MUST HAVE

#### Scenario: 导入产品使用队列
**WHEN** 用户触发从 1688 导入 200 个产品
**THEN** DSUni 调用 `ctx.queue.addJob('importProducts', { storeId, platform, ... })`
**AND** 前端通过 `ctx.queue.getJobStatus(jobId)` 轮询进度
**AND** 支持重试策略（exponential backoff）

#### Scenario: 定时同步使用 scheduledTasks
**WHEN** 用户配置"每小时同步 Shopify 新订单"
**THEN** DSUni 创建 `scheduledTask`，handler_type = `plugin-callback`
**AND** cron 表达式为 `0 * * * *`
**AND** payload 包含 `{ storeId, syncType: 'orders', direction: 'import' }`

### Requirement 6: Admin UI — 渠道管理 + 同步仪表盘

**Priority**: SHOULD HAVE

#### Scenario: 店铺管理页面
**WHEN** 用户访问 DSUni 管理页面
**THEN** 显示已连接的全部店铺
**AND** 支持添加/编辑/删除/测试连接
**AND** 展示每个店铺的同步概览（产品数、订单数、最后同步时间）

#### Scenario: 通过 PluginSlot 增强 Shop UI
**WHEN** DSUni 安装后
**THEN** Shop 产品详情页的 PluginSlot 中渲染同步状态面板
**AND** 显示：同步状态、最后同步时间、"立即同步" 按钮
**AND** DSUni 未安装时 PluginSlot 不显示任何内容

---

## DSUni 数据表设计

### plugin_com_wordrhyme_dsuni_stores

```sql
CREATE TABLE plugin_com_wordrhyme_dsuni_stores (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,           -- 'shopify' | '1688' | 'aliexpress' | 'woocommerce'
    name TEXT NOT NULL,               -- '美国站' / '欧洲站'
    credentials_ref TEXT NOT NULL,    -- settings key for encrypted credentials
    status TEXT NOT NULL DEFAULT 'disconnected',
    api_endpoint TEXT,
    last_tested_at TIMESTAMPTZ,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### plugin_com_wordrhyme_dsuni_sync_states

```sql
CREATE TABLE plugin_com_wordrhyme_dsuni_sync_states (
    id TEXT PRIMARY KEY,
    mapping_id TEXT NOT NULL,          -- soft FK to shop_external_mappings.id
    store_id TEXT NOT NULL,            -- FK to dsuni_stores.id
    sync_status TEXT NOT NULL DEFAULT 'pending',
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Success Criteria

1. ✅ DSUni 不直接写入 Shop 数据库表
2. ✅ 所有产品/订单/映射操作走 Shop tRPC API
3. ✅ 支持同平台多店铺
4. ✅ 同步任务使用平台 `ctx.queue`，不自建 job 表
5. ✅ 定时同步使用平台 `scheduledTasks`
6. ✅ 凭据加密存储（`ctx.settings` + encrypted）
7. ✅ DSUni 卸载后 Shop 数据不受影响
8. ✅ Admin UI 通过 PluginSlot 增强 Shop 页面

---

## Dependencies

### Required
- `com.wordrhyme.shop` plugin（Shop tRPC API）
- `@wordrhyme/plugin` SDK（queue, settings, hooks）
- Platform infrastructure（scheduledTasks, PluginQueueCapability）

### Optional
- `com.wordrhyme.shopify`（Shopify API 客户端）
- `com.wordrhyme.woocommerce`（WooCommerce API 客户端）
- `com.wordrhyme.alibaba`（1688 API 客户端）
- `com.wordrhyme.aliexpress`（AliExpress API 客户端）

---

## References

- [架构讨论文档](file:///Users/denvey/.gemini/antigravity/brain/bf414728-79ec-4439-b092-fcab3b116416/dsuni_architecture_discussion.md)
- [external_mappings 归属讨论](file:///Users/denvey/.gemini/antigravity/brain/bf414728-79ec-4439-b092-fcab3b116416/external_mappings_discussion.md)
- 三模型评审：Antigravity + ChatGPT + Claude (2026-03-17)
