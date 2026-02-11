# Change: Refactor Audit Logs to Auto-CRUD

## Why

审计日志页面当前是 **全手写实现**（后端 276 行 + 前端 AuditLogs.tsx 333 行 + AuditFilterBar 172 行 + AuditLogTable 155 行 = **~936 行**），而项目已有 `@wordrhyme/auto-crud-server` + `@wordrhyme/auto-crud` 标准化 CRUD 框架。

迁移目的：
1. 后端 list/get 自动化，消除 80+ 行手写分页/过滤逻辑
2. 前端使用 `AutoCrudTable` 替代手写 Table + FilterBar + Pagination，获得内置排序/过滤/分页
3. 统一代码风格，与 i18n/currency 参考实现保持一致
4. 审计表是 **append-only**（不需要 create/update/delete），前端只需读取，但后端自动生成的写入操作不影响安全性（前端不调用）

## Context

### 现有代码结构

**后端** (`apps/server/src/trpc/routers/audit.ts`):
- `list` — 手写 8 个 if-else 条件 + count + select + 分页
- `get` — 手写单条查询
- `stats` — GROUP BY + COUNT 聚合（**无法自动化**）
- `entityTypes` — selectDistinct（**无法自动化**）
- `actions` — selectDistinct（**无法自动化**）
- `export` — 自定义导出逻辑

**前端** (`apps/admin/src/pages/AuditLogs.tsx`):
- 手写 FilterBar（6 个过滤条件 + 日期范围 + Trace ID 搜索）
- 手写 Table（7 列 + 自定义 Badge 渲染）
- 手写 Pagination（上一页/下一页）
- 统计卡片（stats API）
- 导出按钮（JSON/CSV）
- 详情面板 (`AuditLogDetailSheet`)

### 参考实现

已有两个成功迁移案例：
- `i18n.ts` — IIFE + `.procedures` spread + 自定义 `setDefault`/`batchUpdate`
- `currency.ts` — IIFE + `.procedures` spread + 自定义 `toggle`/`setBase`

### 框架能力确认

**auto-crud-server `ListInput`** 内置：
- `page` / `perPage` 分页
- `sort` 排序数组
- `filters` 过滤数组（`id`, `value`, `variant`, `operator`, `filterId`）
- `joinOperator` (`and` | `or`)

**AutoCrudTable** 前端能力：
- 自动从 schema 推导筛选器类型（string→text, enum→select, date→datePicker）
- 三种过滤模式：simple / advanced / command
- `slots.toolbarStart` / `slots.toolbarEnd` 工具栏插槽
- `slots.rowActions` 自定义行操作
- `fields` 统一字段配置（label, hidden, table.meta 筛选器配置）

## Constraints

### Hard Constraints

1. **HC-1**: 审计表是 append-only — `SYSTEM_INVARIANTS.md` 规定 `No UPDATE/DELETE on usage_records`（同理适用于 audit），auto-crud 自动生成的 create/update/delete 不暴露到前端
2. **HC-2**: stats/entityTypes/actions 必须手写 — 依赖 GROUP BY / selectDistinct，db.query v2 不支持
3. **HC-3**: export 必须手写 — 自定义导出逻辑（CSV 格式化 + 文件名生成）
4. **HC-4**: 权限模型不变 — `AuditLog:read` 用于查询，`AuditLog:manage` 用于导出
5. **HC-5**: 保留 `AuditLogDetailSheet` — 详情面板是自定义 UI，不属于 AutoCrudTable 管辖
6. **HC-6**: 保留 `JsonDiffViewer` — 独立 Diff 组件，被 DetailSheet 引用

### Soft Constraints

1. **SC-1**: 前端统计卡片保留 — 放在 AutoCrudTable 上方，独立组件
2. **SC-2**: 导出按钮放入 `slots.toolbarEnd` — 复用 AutoCrudTable 工具栏插槽
3. **SC-3**: 行点击打开 DetailSheet — 使用 `slots.rowActions` 或 `onRowClick`
4. **SC-4**: actorType 列使用自定义 Badge + 图标渲染 — 通过 `fields` 配置或 `columns` 自定义

### Dependencies

1. **DEP-1**: `@wordrhyme/auto-crud-server@0.9.0` 已安装（已确认）
2. **DEP-2**: `@wordrhyme/auto-crud` 前端包已安装（已确认，i18n 页面使用中）
3. **DEP-3**: `AuditLog` subject 已在 `resource-definitions.ts` 注册

## Requirements

### R1: 后端 — createCrudRouter + procedures spread

**场景**:
```
Given auditEvents 表定义
When createCrudRouter 自动生成 CRUD
Then list/get 由框架处理（含分页、排序、过滤）
And stats/entityTypes/actions/export 通过 .procedures spread 保留手写
And 所有 procedure 使用 protectedProcedure.meta({ permission }) 权限集成
```

**实现要点**:
- 使用 IIFE + `.procedures` spread 模式（与 i18n/currency 一致）
- `omitFields: ['organizationId']`（ScopedDb 自动注入）
- `procedure` 函数区分读/写权限
- 审计表无 `updatedAt` 字段，需确认 omitFields 默认排除不报错

### R2: 前端 — AutoCrudTable 替代手写组件

**场景**:
```
Given 后端已迁移到 auto-crud
When 前端使用 AutoCrudTable + useAutoCrudResource
Then 自动获得分页/排序/过滤能力
And 过滤器从 schema 自动推导（entityType→text, action→text, actorType→select）
And 统计卡片作为独立区域放在 Table 上方
And 导出按钮放在 toolbar 插槽
And 行点击打开 DetailSheet
```

### R3: 删除冗余组件

**场景**:
```
Given 前端迁移完成
When AutoCrudTable 接管 list/filter/pagination
Then 删除 AuditFilterBar.tsx（被内置过滤器替代）
And 删除 AuditLogTable.tsx（被 AutoCrudTable 替代）
And 保留 AuditLogDetailSheet.tsx（详情面板）
And 保留 JsonDiffViewer.tsx（Diff 组件）
And 更新 index.ts barrel export
```

## Success Criteria

1. **SC-1**: 后端 audit.ts 代码行数减少 ≥40%（主要消除 list/get 手写逻辑）
2. **SC-2**: 前端总代码行数减少 ≥50%（消除 FilterBar + Table + Pagination 手写）
3. **SC-3**: `trpc.audit.list` / `trpc.audit.get` 行为不变（前端调用透明无感）
4. **SC-4**: stats 卡片、导出功能、详情面板功能完全保留
5. **SC-5**: 权限控制（AuditLog:read / AuditLog:manage）行为不变
6. **SC-6**: TypeScript 编译通过，无新增类型错误

## Risks

1. **R-1**: 审计表无 `updatedAt` 列 — `omitFields` 默认排除 `updatedAt`，如果表中不存在该列，auto-crud-server 可能报错。**缓解**: 检查框架行为，如果只排除存在的列则无问题
2. **R-2**: auto-crud list 的 filters 格式与原有前端不同 — 原前端使用 query params 直传，AutoCrudTable 使用 `filters` 数组。**缓解**: 这是 AutoCrudTable 内部处理，迁移后自动适配
3. **R-3**: 自定义列渲染（actorType Badge + Icon）— AutoCrudTable 是否支持足够的列渲染自定义。**缓解**: 通过 `fields.[column].table` 配置或 `columns` 覆盖

## Affected Files

### Backend
- `apps/server/src/trpc/routers/audit.ts` — 重构

### Frontend
- `apps/admin/src/pages/AuditLogs.tsx` — 重构（使用 AutoCrudTable）
- `apps/admin/src/components/audit-logs/AuditFilterBar.tsx` — **删除**
- `apps/admin/src/components/audit-logs/AuditLogTable.tsx` — **删除**
- `apps/admin/src/components/audit-logs/AuditLogDetailSheet.tsx` — 保留（可能微调 props）
- `apps/admin/src/components/audit-logs/JsonDiffViewer.tsx` — 保留
- `apps/admin/src/components/audit-logs/index.ts` — 更新 exports
