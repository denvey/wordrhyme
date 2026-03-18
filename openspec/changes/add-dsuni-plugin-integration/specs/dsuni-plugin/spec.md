# DSUni Channel Connector — Specification Delta (v2)

**Change ID**: `add-dsuni-plugin-integration`
**Capability**: `dsuni-plugin`
**Type**: REFACTORED (v1 → v2 Architecture)
**Updated**: 2026-03-17

---

## Architecture: Pure Orchestration Layer

DSUni 是纯编排层，不持有产品/订单数据。

```
Shop    → Source of Truth (products, orders, external_mappings)
DSUni   → Orchestration (stores, sync_states, scheduling)
Platform → Infrastructure (queue, settings, scheduledTasks)
```

---

## Requirement: DSUni 自有表

### Scenario: stores 表创建
**WHEN** 检查数据库
**THEN** 存在 `plugin_com_wordrhyme_dsuni_stores` 表
**AND** 字段包含：`id`, `platform`, `name`, `credentials_ref`, `status`, `api_endpoint`, `last_tested_at`, `organization_id`
**AND** 同一 `organization_id` + `platform` 可以有多行（多店铺）

### Scenario: sync_states 表创建
**WHEN** 检查数据库
**THEN** 存在 `plugin_com_wordrhyme_dsuni_sync_states` 表
**AND** 字段包含：`id`, `mapping_id` (soft FK), `store_id`, `sync_status`, `last_synced_at`, `sync_error`, `retry_count`, `next_retry_at`, `organization_id`

---

## Requirement: DSUni 不直接操作 Shop 数据

### Scenario: 导入产品走 Shop API
**WHEN** DSUni 从外部平台导入产品
**THEN** 调用 `pluginApis.shop.products.create()` 创建产品
**AND** 调用 `pluginApis.shop.externalMappings.batchLink()` 创建映射
**AND** 在 `dsuni_sync_states` 记录同步状态
**AND** 不直接 `ctx.db.insert({ table: 'products' })`

### Scenario: 推送产品走 Shop API
**WHEN** DSUni 将 Shop 产品推送到外部平台
**THEN** 调用 `pluginApis.shop.products.get()` 读取产品
**AND** 通过平台客户端插件 API 创建外部产品
**AND** 调用 `pluginApis.shop.externalMappings.link()` 记录映射
**AND** 在 `dsuni_sync_states` 记录状态为 `synced`

---

## Requirement: 店铺管理（多店铺支持）

### Scenario: 连接多个 Shopify 店铺
**WHEN** 用户添加两个 Shopify 店铺
**THEN** `dsuni_stores` 表有两行，platform = 'shopify'
**AND** 每个店铺有独立的 `credentials_ref` 指向 `ctx.settings` 加密存储
**AND** 连接状态独立管理

### Scenario: 凭据加密存储
**WHEN** 用户配置店铺凭据（API key、OAuth token）
**THEN** 凭据通过 `ctx.settings.set(key, value, { encrypted: true })` 存储
**AND** `stores.credentials_ref` 只存 settings key（如 `store.{storeId}.credentials`）
**AND** 数据库中不存明文凭据

### Scenario: 断开连接
**WHEN** 用户断开某个店铺
**THEN** `stores.status` 更新为 `disconnected`
**AND** 加密凭据通过 `ctx.settings.delete()` 删除
**AND** 关联的 `sync_states` 保留（可重连后恢复）
**AND** Shop 的 `external_mappings` 不受影响

---

## Requirement: 同步引擎（使用平台基建）

### Scenario: 异步导入使用 ctx.queue
**WHEN** DSUni 发起大批量产品导入
**THEN** 调用 `ctx.queue.addJob('importProducts', payload, options)`
**AND** options 包含 `{ priority: 'normal', attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`
**AND** 前端通过 `getJobStatus(jobId)` 轮询进度

### Scenario: 定时同步使用 scheduledTasks
**WHEN** 用户配置定期同步
**THEN** 创建 `scheduledTask` 记录
**AND** `handler_type` = `plugin-callback`
**AND** `handler_config` = `{ pluginId: 'com.wordrhyme.dsuni', methodName: 'syncScheduled' }`
**AND** `payload` = `{ storeId, syncType, direction }`

---

## Requirement: Shop 侧变更

### Scenario: external_mappings 表移除同步字段
**WHEN** 采用 A+C 架构
**THEN** Shop 的 `external_mappings` 表移除 `sync_status`, `last_synced_at`, `sync_error`
**AND** 迁移 SQL：`ALTER TABLE ... DROP COLUMN ...`

### Scenario: Shop 补充 4 个批量 API
**WHEN** DSUni 需要高效查询映射
**THEN** Shop `externalMappingsRouter` 新增：
- `batchGetByEntityIds({ entityType, entityIds[], platform? })`
- `getByExternalIds({ platform, externalIds[] })`
- `exists({ entityType, entityId, platform })`
- `listByPlatform({ platform, entityType?, limit?, offset? })`

---

## Requirement: Admin UI

### Scenario: PluginSlot 增强 Shop 产品详情页
**WHEN** DSUni 已安装
**THEN** Shop 产品详情页的 `product.detail.sidebar` PluginSlot 中
**AND** DSUni 渲染同步状态面板（状态、时间、"立即同步"按钮）
**AND** DSUni 未安装时 PluginSlot 不显示

### Scenario: 店铺管理 Dashboard
**WHEN** 用户访问 `/p/com.wordrhyme.dsuni`
**THEN** 显示已连接的全部店铺列表
**AND** 每个店铺显示：平台图标、名称、连接状态、产品数、订单数
**AND** 支持：添加店铺、编辑、断开、测试连接

---

## Success Criteria

- ✅ DSUni 零直接 DB 写入 Shop 表
- ✅ 同平台多店铺可用
- ✅ 凭据加密存储
- ✅ 异步任务走 `ctx.queue`
- ✅ 定时同步走 `scheduledTasks`
- ✅ DSUni 卸载后 Shop 数据完整
- ✅ PluginSlot 增强可用
