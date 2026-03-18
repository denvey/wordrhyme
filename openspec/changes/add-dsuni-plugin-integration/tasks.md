# DSUni Channel Connector — 实施任务清单 (v2)

**Change ID**: `add-dsuni-plugin-integration`
**Updated**: 2026-03-17
**架构**: 纯编排层（A+C 混合方案）

---

## Phase 1: Shop 侧变更 (P0)

### Task 1.1: external_mappings 表移除同步字段

**依赖**: 无
**预计**: 0.5 天

- [ ] 创建迁移 SQL：`DROP COLUMN sync_status, last_synced_at, sync_error`
- [ ] 更新 `shopExternalMappings` Drizzle schema
- [ ] 更新 `ExternalMappingPanel` UI（移除 syncStatus 展示）
- [ ] 更新 `updateSyncStatus` procedure（移除或标记废弃）

### Task 1.2: Shop 补充 4 个批量映射 API

**依赖**: 无
**预计**: 1 天

- [ ] `batchGetByEntityIds({ entityType, entityIds[], platform? })`
- [ ] `getByExternalIds({ platform, externalIds[] })`
- [ ] `exists({ entityType, entityId, platform })`
- [ ] `listByPlatform({ platform, entityType?, limit?, offset? })`

---

## Phase 2: DSUni 自有表 (P0)

### Task 2.1: 创建 stores 表 + CRUD

**依赖**: 无
**预计**: 1 天

- [ ] 创建迁移 SQL：`plugin_com_wordrhyme_dsuni_stores`
- [ ] 创建 Drizzle schema
- [ ] 创建 `storesRouter`（list/create/update/delete/testConnection）
- [ ] 凭据存储走 `ctx.settings.set(key, value, { encrypted: true })`

### Task 2.2: 创建 sync_states 表 + CRUD

**依赖**: 无
**预计**: 1 天

- [ ] 创建迁移 SQL：`plugin_com_wordrhyme_dsuni_sync_states`
- [ ] 创建 Drizzle schema
- [ ] 创建 `syncStatesRouter`（listByMapping/listByStore/updateStatus/summary）

---

## Phase 3: 重写同步逻辑 (P1)

### Task 3.1: 重写 sync.ts — 走 Shop API

**依赖**: Task 1.2, Task 2.1, Task 2.2
**预计**: 2 天

- [ ] `importProducts` → 调 `shop.products.create()` + `shop.externalMappings.batchLink()`
- [ ] `importOrders` → 调 `shop.orders.create()` + `shop.externalMappings.batchLink()`
- [ ] `pushProducts` → 调 `shop.products.get()` + 平台客户端 API + `shop.externalMappings.link()`
- [ ] 所有同步操作写入 `dsuni_sync_states`
- [ ] 删除所有 `ctx.db.insert({ table: '...' })` 裸 DB 调用

### Task 3.2: 接入 ctx.queue 异步执行

**依赖**: Task 3.1
**预计**: 1 天

- [ ] `importProducts` 改为 `ctx.queue.addJob('importProducts', payload)`
- [ ] 实现 job handler（worker 函数）
- [ ] 返回 jobId，前端轮询 `getJobStatus()`

### Task 3.3: 接入 scheduledTasks 定时同步

**依赖**: Task 3.2
**预计**: 0.5 天

- [ ] 用户配置定时同步时创建 `scheduledTask` 记录
- [ ] handler_type = `plugin-callback`
- [ ] callback 触发对应 store 的同步 job

---

## Phase 4: 重写 channels.ts → stores.ts (P1)

### Task 4.1: 替换 channels 为 stores

**依赖**: Task 2.1
**预计**: 0.5 天

- [ ] 删除旧的 `channels.ts`（基于 settings JSON blob）
- [ ] 替换为新的 `storesRouter`（基于 stores 表）
- [ ] 更新权限定义（`channels.*` → `stores.*`）
- [ ] 更新 manifest.json

---

## Phase 5: Admin UI 重建 (P2)

### Task 5.1: 店铺管理页面

**依赖**: Task 4.1
**预计**: 2 天

- [ ] 店铺列表（平台图标、名称、状态）
- [ ] 添加店铺 Dialog（选择平台 → 配置凭据 → 测试连接）
- [ ] 编辑/断开/删除操作
- [ ] 同步概览（按店铺统计产品/订单数量）

### Task 5.2: 同步仪表盘

**依赖**: Task 3.1
**预计**: 1.5 天

- [ ] 同步状态总览（synced/pending/error 计数）
- [ ] 同步历史（最近 N 次任务结果）
- [ ] 错误详情和重试按钮

### Task 5.3: PluginSlot 增强 Shop 页面

**依赖**: Task 5.2
**预计**: 1 天

- [ ] Shop 产品详情页 `product.detail.sidebar` slot → 渲染同步状态面板
- [ ] Shop 订单详情页 `order.detail.sidebar` slot → 渲染同步状态面板
- [ ] 面板包含：状态、时间、"立即同步"按钮

---

## 总览

| Phase | 任务数 | 预计工时 | 优先级 |
|-------|--------|---------|--------|
| Phase 1 (Shop 变更) | 2 | 1.5 天 | P0 |
| Phase 2 (DSUni 表) | 2 | 2 天 | P0 |
| Phase 3 (同步逻辑) | 3 | 3.5 天 | P1 |
| Phase 4 (channels→stores) | 1 | 0.5 天 | P1 |
| Phase 5 (Admin UI) | 3 | 4.5 天 | P2 |
| **合计** | **11** | **~12 天** | |
