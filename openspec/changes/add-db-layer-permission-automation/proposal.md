# Change: DB-Layer Permission Automation

## Why

现有权限系统虽然功能完整（RBAC + CASL + LBAC + 租户隔离），但**开发体验极差**：每个tRPC handler都需要手动编写 ~25行权限代码（查询资源 → ABAC检查 → 字段过滤 → 执行操作）。这导致：

1. **代码重复**：90%的权限逻辑在所有CRUD接口中重复
2. **容易出错**：开发者可能忘记ABAC检查或字段过滤
3. **维护成本高**：权限逻辑分散在业务代码中，难以统一升级
4. **性能隐患**：每次权限检查都查询数据库（17ms/次）

本变更通过**将权限逻辑下沉到DB层** + **tRPC Meta声明式配置** + **三层缓存**，实现开发者零感知的权限自动化，代码量减少68%，权限检查延迟降低85%。

## What Changes

### 核心机制

1. **tRPC Meta 声明式配置**
   - 在 `.meta({ permission: { action: 'update', subject: 'Article' }})` 声明权限需求
   - 中间件自动执行 RBAC 检查
   - 通过 AsyncLocalStorage 传递配置到 DB 层

2. **ScopedDb 自动化增强**（**BREAKING**）
   - SELECT: 自动字段过滤（基于 PermissionKernel.permittedFields）
   - UPDATE/DELETE: 自动 ABAC 检查（基于 CASL conditions）
   - 所有表自动启用权限检查（当 meta 存在时）

3. **三层权限缓存**（**NEW**）
   - L1: Per-request Map (0ms，单请求内复用)
   - L2: Redis Cache (2ms，5分钟 TTL)
   - L3: Database (17ms，fallback)
   - 权限修改时主动失效缓存

4. **SQL 条件下推优化**（**NEW**）
   - 将 CASL conditions 转换为 SQL WHERE 子句
   - 避免"查询 → 检查 → 更新"双查询问题
   - 性能提升 50%（20ms → 10ms）

5. **调试能力增强**
   - `DEBUG_PERMISSION=true` 输出完整权限决策链路
   - 显示字段过滤前后对比、ABAC结果、缓存命中情况

### Breaking Changes

- **ScopedDb 行为变更**：当 tRPC handler 使用 `.meta()` 配置时，所有 UPDATE/DELETE 操作会自动执行 ABAC 检查，可能导致之前能执行的操作被拒绝（如果资源不属于用户）
- **字段过滤始终启用**：SELECT 查询结果可能缺少未授权字段，旧代码需检查 undefined 处理
- **审计日志使用 rawDb**：绕过权限检查，避免递归（内部实现变更）

### 代码示例

**Before (25行)**:
```typescript
update: protectedProcedure
  .input(updateSchema)
  .mutation(async ({ input, ctx }) => {
    // ❌ 手动 RBAC
    await permissionKernel.require('update', 'Article', undefined, ctx);

    // ❌ 手动查询资源
    const [article] = await db.select().from(articles).where(eq(articles.id, id));

    // ❌ 手动 ABAC
    await permissionKernel.require('update', 'Article', article, ctx);

    // ❌ 手动字段过滤
    const allowed = await permissionKernel.permittedFields('update', 'Article', ctx);
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed?.includes(k))
    );

    return await db.update(articles).set(filtered).where(...);
  })
```

**After (8行)**:
```typescript
update: protectedProcedure
  .meta({ permission: { action: 'update', subject: 'Article' }})
  .input(updateSchema)
  .mutation(async ({ input }) => {
    // ✅ 全自动：RBAC + ABAC + 字段过滤 + 租户隔离 + LBAC
    return await db.update(articles).set(input).where(eq(articles.id, id));
  })
```

## Impact

### Affected Specs
- **permission-kernel** (MODIFIED)
  - 新增三层缓存机制
  - 新增 `permittedFields()` API
  - 新增 `skipAudit` 标志避免递归

### Affected Code

#### 新增文件
- `apps/server/src/permission/permission-cache.ts` - Redis 缓存层
- `apps/server/src/permission/casl-to-sql.ts` - SQL 条件下推优化

#### 修改文件
- `apps/server/src/trpc/trpc.ts` - Meta 类型 + 中间件
- `apps/server/src/context/async-local-storage.ts` - 扩展 RequestContext
- `apps/server/src/db/scoped-db.ts` - **核心**，增强所有 CRUD 操作
- `apps/server/src/permission/permission-kernel.ts` - 缓存集成 + skipAudit

#### 受影响的现有 Handlers
- **所有使用 `.meta()` 的 tRPC procedures** - 需迁移到新模式
- **直接使用 `db` 的代码** - 行为自动变更（启用权限时）

### Migration Strategy

**激进迁移**（用户选择）：
1. Week 1: 实施基础设施 + ScopedDb 增强
2. Week 2: 批量迁移所有 tRPC handlers 到 `.meta()` 模式
3. Week 3: 性能监控 + Bug 修复
4. Week 4: 移除旧的手动权限代码

### Performance Impact
- **缓存命中率**：预期 95%+
- **P50 延迟**：17ms → 2ms（85% improvement）
- **P99 延迟**：20ms → 10ms（50% improvement，SQL 优化生效）
- **代码行数**：-68%

### Security Impact
- ✅ **更安全**：自动化减少人为遗漏风险
- ✅ **可审计**：完整 DEBUG 日志链路
- ⚠️ **Breaking**：旧代码可能绕过了权限（需要修复）

### Backward Compatibility
- ❌ **Breaking Change**：启用 `.meta()` 后，行为强制变更
- ✅ **渐进式**：未使用 `.meta()` 的代码不受影响
- ✅ **回滚**：可通过移除 `.meta()` 配置恢复旧行为

## Dependencies
- Redis (已有) - 用于 L2 缓存
- Drizzle ORM Proxy API (已有) - 用于拦截查询
- AsyncLocalStorage (已有) - 用于上下文传递

## Open Questions
1. ~~字段过滤策略~~：✅ 决策：所有表启用（Option A）
2. ~~缓存 TTL~~：✅ 决策：300秒（5分钟）
3. ~~迁移策略~~：✅ 决策：激进迁移（一次性）
4. **测试覆盖**：需要针对 Proxy 层的集成测试策略？
5. **监控告警**：缓存失效、权限拒绝率阈值设置？
