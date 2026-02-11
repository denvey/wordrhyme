# Tasks: Refactor Audit Logs to Auto-CRUD

## Task 1: 后端 — 重构 audit.ts 使用 createCrudRouter ✅

**File**: `apps/server/src/trpc/routers/audit.ts`

### 1.1 替换 imports
```
删除: eq, and, desc, gte, lte, count (保留 sql 用于 stats)
添加: createCrudRouter from '@wordrhyme/auto-crud-server'
删除: auditListInputSchema 定义 (auto-crud 内置)
保留: auditExportInputSchema (export 仍手写)
替换: requirePermission → protectedProcedure.meta
```

### 1.2 创建 IIFE + createCrudRouter
```typescript
export const auditRouter = (() => {
  const auditCrud = createCrudRouter({
    table: auditEvents,
    omitFields: ['organizationId'],
    procedure: () => protectedProcedure.meta({
      permission: { action: 'read', subject: 'AuditLog' },
    }),
    filterableColumns: [
      'entityType', 'entityId', 'action',
      'actorId', 'actorType', 'traceId', 'createdAt',
    ],
    sortableColumns: ['createdAt', 'entityType', 'action', 'actorType'],
  });

  const { list, get } = auditCrud.procedures;

  return router({
    list,
    get,
    // stats, entityTypes, actions, export 保持手写...
  });
})();
```

### 1.3 迁移手写 procedures 的权限
```
stats:       .use(requirePermission('AuditLog:read'))
             → protectedProcedure.meta({ permission: { action: 'read', subject: 'AuditLog' } })
entityTypes: 同上
actions:     同上
export:      .use(requirePermission('AuditLog:manage'))
             → protectedProcedure.meta({ permission: { action: 'manage', subject: 'AuditLog' } })
```

### 1.4 删除的代码
- `auditListInputSchema` 定义 (行 9-20)
- `list` procedure 手写实现 (行 51-114)
- `get` procedure 手写实现 (行 119-130)
- 未使用的 imports: `eq, and, desc, gte, lte, count`

### 1.5 保留的代码
- `auditExportInputSchema` (export 输入)
- `stats` procedure (GROUP BY 聚合)
- `entityTypes` procedure (selectDistinct)
- `actions` procedure (selectDistinct)
- `export` procedure (自定义导出)

### 验证
- [ ] TypeScript 编译通过
- [ ] auditRouter 只暴露 list/get/stats/entityTypes/actions/export
- [ ] 无 create/update/delete 端点

---

## Task 2: 前端 — 重构 AuditLogs.tsx 使用 AutoCrudTable ✅

**File**: `apps/admin/src/pages/AuditLogs.tsx`

### 2.1 替换 imports
```
添加: AutoCrudTable, useAutoCrudResource from '@wordrhyme/auto-crud'
添加: createSelectSchema from 'drizzle-zod' 或从 @wordrhyme/db 导入审计 schema
删除: AuditFilterBar import
删除: AuditLogTable import
删除: useState for page/filters (AutoCrudTable 内部管理)
删除: ChevronLeft/ChevronRight icons (分页内置)
保留: AuditLogDetailSheet import
保留: trpc.audit.stats/export 调用
```

### 2.2 Schema 定义
```typescript
import { auditEvents } from '@wordrhyme/db';
import { createSelectSchema } from 'drizzle-zod';

const auditSchema = createSelectSchema(auditEvents);
```

### 2.3 Resource Hook
```typescript
const resource = useAutoCrudResource({
  router: trpc.audit as any,
  schema: auditSchema,
});
```

### 2.4 AutoCrudTable 配置
```tsx
<AutoCrudTable
  title="Audit Logs"
  schema={auditSchema}
  resource={resource}
  permissions={{
    can: { create: false, update: false, delete: false, export: false },
  }}
  fields={{
    id: { hidden: true },
    organizationId: { hidden: true },
    changes: { hidden: true },
    metadata: { hidden: true },
    userAgent: { hidden: true },
    requestId: { hidden: true },
    sessionId: { hidden: true },
    createdAt: { label: 'Time' },
    entityType: { label: 'Entity' },
    entityId: { label: 'Entity ID' },
    action: { label: 'Action' },
    actorId: { label: 'Actor' },
    actorType: {
      label: 'Actor Type',
      table: {
        meta: {
          variant: 'select',
          options: [
            { label: 'User', value: 'user' },
            { label: 'System', value: 'system' },
            { label: 'Plugin', value: 'plugin' },
            { label: 'API Token', value: 'api-token' },
          ],
        },
      },
    },
    traceId: { label: 'Trace ID' },
    actorIp: { label: 'IP Address' },
  }}
  table={{
    filterModes: ['simple', 'advanced'],
  }}
  slots={{
    toolbarEnd: (
      <>
        <Button variant="outline" size="sm" onClick={() => handleExport('json')} disabled={exportMutation.isPending}>
          <Download className="h-4 w-4 mr-2" />Export JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>
          <Download className="h-4 w-4 mr-2" />Export CSV
        </Button>
      </>
    ),
  }}
/>
```

### 2.5 保留的功能
- Stats Cards 区域（独立于 AutoCrudTable，放在上方）
- Export mutation + 文件下载逻辑
- AuditLogDetailSheet（行点击打开）
- convertToCSV 工具函数

### 2.6 删除的代码
- `AuditEvent` 手写 interface (用 schema 推导)
- `Filters` interface
- `useState<Filters>` + `useState<number>(page)`
- `handleFiltersChange` / `handleReset` callbacks
- 手写 Pagination 组件
- `trpc.audit.entityTypes.useQuery()` (AutoCrudTable 自动处理过滤选项)
- `trpc.audit.actions.useQuery()` (同上)

### 验证
- [ ] 页面正常渲染
- [ ] 过滤功能可用
- [ ] 排序功能可用
- [ ] 分页功能可用
- [ ] Stats 卡片显示正确
- [ ] Export 功能正常

---

## Task 3: 删除冗余组件 ✅

### 3.1 删除文件
```
apps/admin/src/components/audit-logs/AuditFilterBar.tsx    ← 删除
apps/admin/src/components/audit-logs/AuditLogTable.tsx     ← 删除
```

### 3.2 更新 barrel export
**File**: `apps/admin/src/components/audit-logs/index.ts`
```typescript
// 删除:
export { AuditFilterBar } from './AuditFilterBar';
export { AuditLogTable } from './AuditLogTable';

// 保留:
export { AuditLogDetailSheet } from './AuditLogDetailSheet';
export { JsonDiffViewer } from './JsonDiffViewer';
```

### 3.3 删除相关测试
```
apps/admin/src/__tests__/components/AuditFilterBar.test.tsx  ← 检查是否存在，如存在则删除
```

### 验证
- [ ] `grep -r "AuditFilterBar" apps/admin/src/` 无结果
- [ ] `grep -r "AuditLogTable" apps/admin/src/` 无结果（除测试快照外）
- [ ] TypeScript 编译通过

---

## Task 4: 验收检查 ✅

### 4.1 编译检查
```bash
pnpm --filter @wordrhyme/server typecheck
pnpm --filter @wordrhyme/admin typecheck
```

### 4.2 功能验证
- [ ] 审计日志列表正常加载
- [ ] 过滤器可用（entityType, action, actorType, createdAt dateRange, traceId）
- [ ] 排序可用（点击列头）
- [ ] 分页可用
- [ ] Stats 卡片显示（总数、24h、Top Entity、Top Action）
- [ ] Export JSON 下载
- [ ] Export CSV 下载
- [ ] 行点击打开 DetailSheet
- [ ] DetailSheet 显示完整信息（包括 JsonDiffViewer）

### 4.3 代码量对比
预期:
- 后端: 276 行 → ~160 行 (≥40% 减少)
- 前端: ~660 行 → ~200 行 (≥50% 减少)
- 总计: ~936 行 → ~360 行 (≥60% 减少)

---

## Execution Order

```
Task 1 (后端) → Task 2 (前端) → Task 3 (清理) → Task 4 (验收)
```

Task 1 和 Task 2 可以并行开发但需要 Task 1 先完成（前端依赖新的 list API 格式）。
