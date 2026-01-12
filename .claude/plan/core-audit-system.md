# Core Audit System 实施计划

**OpenSpec ID**: `core-audit-system`
**方案**: 后端 A (同步追加+归档) + 前端 A (Table+侧边抽屉)
**预估工时**: 3 天

---

## 一、后端实施计划 (Codex)

### 1.1 文件清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 修改 | `apps/server/src/db/schema/audit-events.ts` | 添加 actor_ip, user_agent, trace_id; 扩展 actorType |
| 修改 | `apps/server/src/db/schema/audit-logs.ts` | 添加 actor_ip, user_agent, trace_id; 扩展 actorType |
| 新建 | `apps/server/src/db/schema/audit-events-archive.ts` | 归档表 schema |
| 修改 | `apps/server/src/context/async-local-storage.ts` | 扩展 RequestContext (ip, userAgent, traceId) |
| 修改 | `apps/server/src/context/context.middleware.ts` | 捕获 IP/UA/traceId 到 ALS |
| 修改 | `apps/server/src/audit/audit.service.ts` | 移除 cleanup; 新增 archive; 失败告警 |
| 新建 | `apps/server/src/audit/audit-plugin.service.ts` | 插件审计 API (Core-mediated) |
| 新建 | `apps/server/src/trpc/routers/audit.ts` | 审计查询 tRPC router |
| 新建 | `apps/server/drizzle/xxxx_audit_extension.sql` | 数据库迁移 |

### 1.2 Schema 变更

```typescript
// audit-events.ts 新增字段
actorIp: text('actor_ip'),
userAgent: text('user_agent'),
traceId: text('trace_id'),

// actorType 扩展
actorType: text('actor_type').notNull().$type<'user' | 'system' | 'plugin' | 'api-token'>().default('user'),
```

### 1.3 Service 改造

```typescript
// AuditService
class AuditService {
  // 移除 cleanup() 方法

  // 新增 archive 方法
  async archive(options: { retentionDays: number; batchSize?: number }): Promise<number>;

  // 失败告警机制
  async log(event: AuditEventInput): Promise<void> {
    try {
      await db.insert(auditEvents).values({...});
    } catch (error) {
      this.alertService.emit('audit_write_failed', { event, error });
      throw error; // 不再静默吞掉
    }
  }

  // 插件审计入口
  async logPluginAudit(pluginId: string, payload: PluginAuditPayload): Promise<void>;
}
```

### 1.4 tRPC Router

```typescript
// apps/server/src/trpc/routers/audit.ts
export const auditRouter = router({
  list: protectedProcedure
    .input(auditListInputSchema)
    .query(async ({ ctx, input }) => { /* 分页查询 */ }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => { /* 详情查询 */ }),

  export: protectedProcedure
    .input(auditExportInputSchema)
    .mutation(async ({ ctx, input }) => { /* CSV/JSON 导出 */ }),
});
```

### 1.5 迁移脚本要点

```sql
-- 1. 添加新列
ALTER TABLE audit_events ADD COLUMN actor_ip text;
ALTER TABLE audit_events ADD COLUMN user_agent text;
ALTER TABLE audit_events ADD COLUMN trace_id text;

-- 2. 创建归档表
CREATE TABLE audit_events_archive (LIKE audit_events INCLUDING ALL);

-- 3. 添加索引
CREATE INDEX audit_events_trace_idx ON audit_events(trace_id);
```

---

## 二、前端实施计划 (Gemini)

### 2.1 文件清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新建 | `apps/admin/src/pages/AuditLogs.tsx` | 审计日志页面 |
| 新建 | `apps/admin/src/components/audit-logs/AuditFilterBar.tsx` | 筛选栏组件 |
| 新建 | `apps/admin/src/components/audit-logs/AuditLogTable.tsx` | 表格组件 |
| 新建 | `apps/admin/src/components/audit-logs/AuditLogDetailSheet.tsx` | 详情抽屉 |
| 新建 | `apps/admin/src/components/audit-logs/JsonDiffViewer.tsx` | Diff 对比组件 |
| 新建 | `apps/admin/src/lib/audit-utils.ts` | 工具函数 |
| 修改 | `apps/admin/src/App.tsx` | 添加路由 |
| 修改 | `apps/admin/src/hooks/useMenus.ts` | 添加菜单项 |

### 2.2 新增依赖

```bash
pnpm add react-diff-viewer-continued
```

### 2.3 组件接口

```typescript
// AuditFilterBar
interface AuditFilterBarProps {
  filters: AuditLogFilterState;
  onFilterChange: (filters: AuditLogFilterState) => void;
  onExport: (format: 'csv' | 'json') => void;
}

// AuditLogTable
interface AuditLogTableProps {
  data: AuditLogEntry[];
  isLoading: boolean;
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onRowClick: (id: string) => void;
}

// AuditLogDetailSheet
interface AuditLogDetailSheetProps {
  logId: string | null;
  isOpen: boolean;
  onClose: () => void;
}
```

### 2.4 tRPC Hooks

```typescript
// 列表查询
const { data, isLoading } = trpc.audit.list.useQuery({
  page, limit, filters
}, { keepPreviousData: true });

// 详情查询 (按需)
const { data: detail } = trpc.audit.get.useQuery(
  { id: selectedId! },
  { enabled: !!selectedId }
);

// 导出
const exportMutation = trpc.audit.export.useMutation();
```

### 2.5 路由配置

```tsx
// App.tsx
<Route path="audit-logs" element={<OrgAdminRoute><AuditLogsPage /></OrgAdminRoute>} />
```

---

## 三、实施顺序

### Phase 1: 数据库 & Context (Day 1 上午)
1. [ ] 创建数据库迁移脚本
2. [ ] 运行迁移，创建归档表
3. [ ] 扩展 RequestContext 接口
4. [ ] 更新 context.middleware.ts 捕获 IP/UA/traceId

### Phase 2: 后端服务 (Day 1 下午)
5. [ ] 更新 audit-events.ts / audit-logs.ts schema
6. [ ] 重构 AuditService (移除 cleanup, 添加 archive, 失败告警)
7. [ ] 创建 audit-plugin.service.ts
8. [ ] 创建 audit.ts tRPC router

### Phase 3: 前端组件 (Day 2)
9. [ ] 安装 react-diff-viewer-continued
10. [ ] 创建 JsonDiffViewer 组件
11. [ ] 创建 AuditFilterBar 组件
12. [ ] 创建 AuditLogTable 组件
13. [ ] 创建 AuditLogDetailSheet 组件

### Phase 4: 页面集成 (Day 2-3)
14. [ ] 创建 AuditLogs.tsx 页面
15. [ ] 注册路由和菜单
16. [ ] 对接 tRPC hooks
17. [ ] 实现导出功能

### Phase 5: 测试 & 优化 (Day 3)
18. [ ] 单元测试 (Service 层)
19. [ ] 集成测试 (API 层)
20. [ ] E2E 测试 (UI 层)
21. [ ] 性能优化 (分页、Memoization)

---

## 四、测试要点

### 后端测试
- [ ] AuditService.log 正确填充 context 字段
- [ ] 写入失败时触发告警并抛出异常
- [ ] archive 正确迁移数据并删除原表记录
- [ ] 插件 API 验证 pluginId 和 tenant

### 前端测试
- [ ] 筛选器状态与 URL 同步
- [ ] 分页正常工作
- [ ] Diff 视图正确渲染 before/after
- [ ] 敏感字段脱敏显示
- [ ] 导出功能正常

---

## 五、验收标准

- [ ] 审计写入失败触发告警 (不再静默)
- [ ] cleanup 已移除，archive 可正常归档
- [ ] 插件只能通过 Core API 写入审计
- [ ] Admin 面板可查询/筛选/导出审计日志
- [ ] 单元测试覆盖率 ≥ 80%
