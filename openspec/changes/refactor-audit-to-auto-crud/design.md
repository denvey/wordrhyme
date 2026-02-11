# Design: Refactor Audit Logs to Auto-CRUD

## Decisions

### D1: 写入端点处理
**选择**: 只展开 `list` + `get`，不暴露写入端点
**理由**: 审计表 append-only，暴露 create/update/delete 违反数据完整性
**实现**: `const { list, get } = auditCrud.procedures;`

### D2: List API 格式
**选择**: 前后端一起迁移到 auto-crud 格式
**理由**: AutoCrudTable 内部使用 `filters[]` 数组与 auto-crud list 对接，无需适配层
**影响**: 前端 AuditFilterBar 删除，由 AutoCrudTable 内置过滤接管

### D3: 权限模型
**选择**: 迁移到 `protectedProcedure.meta({ permission: { action, subject } })`
**理由**: 统一权限模型，与 i18n/currency 一致
**映射**:
- `list/get` → `{ action: 'read', subject: 'AuditLog' }`
- `stats/entityTypes/actions` → `{ action: 'read', subject: 'AuditLog' }`
- `export` → `{ action: 'manage', subject: 'AuditLog' }`

## Architecture

### Backend Structure

```
audit.ts (refactored)
├── createCrudRouter({ table: auditEvents, ... })
│   ├── list  ← auto-generated (分页+排序+过滤)
│   └── get   ← auto-generated (按 ID 查询)
├── stats         ← 手写 (GROUP BY + COUNT)
├── entityTypes   ← 手写 (selectDistinct)
├── actions       ← 手写 (selectDistinct)
└── export        ← 手写 (自定义导出)
```

### Frontend Structure

```
AuditLogs.tsx (refactored)
├── Stats Cards (trpc.audit.stats) ← 保留手写
├── AutoCrudTable
│   ├── list/filter/sort/pagination ← 自动化
│   ├── slots.toolbarEnd: Export buttons ← 插槽
│   └── fields: 自定义列配置
├── AuditLogDetailSheet ← 保留
└── JsonDiffViewer ← 保留
```

### File Changes

| File | Action | Details |
|------|--------|---------|
| `apps/server/src/trpc/routers/audit.ts` | **Refactor** | createCrudRouter + procedures spread |
| `apps/admin/src/pages/AuditLogs.tsx` | **Refactor** | AutoCrudTable + useAutoCrudResource |
| `apps/admin/src/components/audit-logs/AuditFilterBar.tsx` | **Delete** | 被 AutoCrudTable 内置过滤替代 |
| `apps/admin/src/components/audit-logs/AuditLogTable.tsx` | **Delete** | 被 AutoCrudTable 替代 |
| `apps/admin/src/components/audit-logs/AuditLogDetailSheet.tsx` | **Keep** | 微调 props 适配 |
| `apps/admin/src/components/audit-logs/JsonDiffViewer.tsx` | **Keep** | 无变更 |
| `apps/admin/src/components/audit-logs/index.ts` | **Update** | 移除已删除组件的导出 |

## Technical Details

### Backend: createCrudRouter Config

```typescript
const auditCrud = createCrudRouter({
  table: auditEvents,
  omitFields: ['organizationId'],
  // 注意: 表无 updatedAt 列，默认 omitFields 包含 updatedAt
  // 但 Zod .omit() 忽略不存在的 key，不会报错

  procedure: (op) => {
    // 所有操作都需要认证 + 权限
    return protectedProcedure.meta({
      permission: { action: 'read', subject: 'AuditLog' },
    });
  },

  // 可过滤列白名单
  filterableColumns: [
    'entityType', 'entityId', 'action',
    'actorId', 'actorType', 'traceId', 'createdAt',
  ],
  sortableColumns: ['createdAt', 'entityType', 'action', 'actorType'],
});
```

### Backend: Router Assembly

```typescript
export const auditRouter = (() => {
  const auditCrud = createCrudRouter({ /* ... */ });
  const { list, get } = auditCrud.procedures;  // 只取读操作

  return router({
    list,
    get,
    // 以下手写保留
    stats: protectedProcedure.meta({ /* read */ }).query(/* ... */),
    entityTypes: protectedProcedure.meta({ /* read */ }).query(/* ... */),
    actions: protectedProcedure.meta({ /* read */ }).query(/* ... */),
    export: protectedProcedure.meta({ /* manage */ }).mutation(/* ... */),
  });
})();
```

### Frontend: AutoCrudTable Config

```tsx
const auditSchema = createSelectSchema(auditEvents);

const resource = useAutoCrudResource({
  router: trpc.audit,
  schema: auditSchema,
});

<AutoCrudTable
  title="Audit Logs"
  schema={auditSchema}
  resource={resource}
  permissions={{
    can: { create: false, update: false, delete: false, export: true },
  }}
  fields={{
    id: { hidden: true },
    organizationId: { hidden: true },
    changes: { hidden: true },
    metadata: { hidden: true },
    userAgent: { hidden: true },
    requestId: { hidden: true },
    sessionId: { hidden: true },
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
  }}
  table={{
    filterModes: ['simple', 'advanced'],
  }}
  slots={{
    toolbarEnd: <ExportButtons />,
  }}
/>
```
