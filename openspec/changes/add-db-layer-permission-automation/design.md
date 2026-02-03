## Context

WordRhyme 现有权限系统已实现完整的 6 层权限模型（Authentication → RBAC → Tenant Isolation → LBAC → Field Filtering → ABAC），但所有权限逻辑都需要开发者在业务代码中**手动编写**，导致每个 CRUD handler 需要 ~25 行样板代码。

本变更旨在通过**声明式配置** + **DB 层自动化**，将权限逻辑从业务代码中抽离，实现零感知权限检查。

### Constraints
- 必须向后兼容：未使用 `.meta()` 的旧代码不受影响
- 必须保持现有权限模型语义（不能降低安全性）
- 必须支持调试：自动化不能成为"黑盒"
- 必须性能优化：不能引入显著延迟

### Stakeholders
- **开发者**：减少 68% 样板代码，降低出错风险
- **安全团队**：集中化权限逻辑，更易审计
- **运维团队**：需要配置 Redis、监控缓存指标

---

## Goals / Non-Goals

### Goals
1. **DX 优化**：从 25 行手动代码 → 1 行 `.meta()` 配置
2. **性能提升**：通过三层缓存降低 85% 权限检查延迟
3. **安全增强**：自动化减少人为遗漏，强制执行 ABAC + 字段过滤
4. **可调试性**：通过 `DEBUG_PERMISSION=true` 提供完整权限决策链路

### Non-Goals
- ❌ 改变现有权限模型（仍然是 CASL + RBAC + LBAC）
- ❌ 实现更细粒度的权限控制（如行级动态条件，超出 CASL 能力）
- ❌ 支持运行时动态修改权限规则（仍需 DB 修改 + 缓存失效）
- ❌ 前端权限自动化（仅后端 tRPC + DB 层）

---

## Decisions

### Decision 1: 使用 AsyncLocalStorage 传递 Meta 配置

**选项**:
- A. AsyncLocalStorage（选中）
- B. 在 db 实例上挂载 `db.withPermission(meta)`
- C. 全局变量（thread-unsafe）

**理由**:
- AsyncLocalStorage 是 Node.js 原生支持，线程安全
- 无需修改 DB API，兼容性最好
- 已在 `getContext()` 中使用，复用现有机制

**Trade-off**: 依赖运行时上下文，单元测试需要 mock

---

### Decision 2: 字段过滤所有表启用（Option A）

**选项**:
- A. 所有表自动启用（选中）
- B. 白名单模式（仅敏感表）

**理由**:
- 安全默认（Secure by default）
- 避免开发者决策负担
- `permittedFields()` 返回 `undefined` 时自动透传，不影响无限制场景

**Migration Risk**: 旧代码可能依赖未授权字段 → 需要渐进式测试

---

### Decision 3: 缓存 TTL = 300 秒（5 分钟）

**选项**:
- A. 60 秒（高安全）
- B. 300 秒（选中）
- C. 3600 秒（高性能）

**理由**:
- 权限变化频率低（一般按小时计）
- 5 分钟兼顾性能和一致性
- 主动失效 + TTL 兜底，双重保障

**Configuration**: 通过 `PERMISSION_CACHE_TTL` 环境变量可调整

---

### Decision 4: SQL 条件下推作为优化路径（非强制）

**选项**:
- A. 所有 ABAC 都转 SQL（强制）
- B. Smart Fallback：能转则转，不能则双查询（选中）

**理由**:
- CASL 条件可能包含复杂逻辑（`$or`, `$and` 嵌套）
- SQL 转换不是所有场景都能做到
- Fallback 保证正确性，优化提升性能

**Performance Impact**: 简单条件（~70%场景）提升 50%，复杂条件保持原样

---

### Decision 5: 使用 rawDb 避免审计递归

**选项**:
- A. 在 ScopedDb 中检测审计表跳过权限（复杂）
- B. 使用 `rawDb` + `skipAudit` 标志（选中）

**理由**:
- 简单清晰：系统内部操作显式使用 `rawDb`
- 避免魔法判断（如检测表名 === 'audit_logs'）
- 可扩展：未来其他系统表也可使用

**Trade-off**: 需要导出 `rawDb`，增加 API 表面

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client Request                                           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. tRPC Procedure                                           │
│    .meta({ permission: { action: 'update', subject: 'A' }}) │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. globalPermissionMiddleware                               │
│    ├─ RBAC Check (can user update Article?)                │
│    └─ Store meta in AsyncLocalStorage                       │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Handler Code                                             │
│    await db.update(articles).set(data).where(...)           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. ScopedDb Proxy (UPDATE branch)                           │
│    ├─ rawDb.select() → Query instances                     │
│    ├─ For each: permissionKernel.require(action, subject,  │
│    │              instance, {skipAudit: true})              │
│    ├─ permissionKernel.permittedFields() → Filter fields   │
│    └─ rawDb.update() → Execute                             │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. PermissionKernel.require()                               │
│    ├─ Check L1 cache (abilityCache) → HIT: 0ms             │
│    ├─ Check L2 cache (Redis)        → HIT: 2ms             │
│    └─ Check L3 (Database)           → MISS: 17ms           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. CASL Ability Evaluation                                  │
│    ability.can('update', { ...article, authorId })          │
│    → Matches rule: { authorId: '${user.id}' }              │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SQL Optimization (Optional)                              │
│    conditionsToSQL({ authorId: '${user.id}' })             │
│    → WHERE authorId = 'user-123'                            │
│    → Single UPDATE query (Skip step 5.1-5.2)               │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction

```
┌────────────────┐       ┌────────────────┐
│  tRPC Meta     │───────│ AsyncLocal     │
│  Middleware    │ store │ Storage        │
└────────────────┘       └────────┬───────┘
                                  │ read
                         ┌────────▼───────┐
                         │   ScopedDb     │
                         │   Proxy        │
                         └────────┬───────┘
                                  │ call
                         ┌────────▼───────────┐
                         │ PermissionKernel   │
                         │  ┌──────────────┐  │
                         │  │ L1: Map      │  │
                         │  │ L2: Redis ◄──┼──┼─── PermissionCache
                         │  │ L3: DB       │  │
                         │  └──────────────┘  │
                         └────────────────────┘
                                  │
                         ┌────────▼───────┐
                         │  CASL Ability  │
                         └────────────────┘
```

---

## Key Modules

### 1. PermissionCache (`permission-cache.ts`)

**Responsibility**: Redis-based L2 cache for permission rules

**API**:
```typescript
class PermissionCache {
  async get(orgId: string, roles: string[]): Promise<CaslRule[] | null>
  async set(orgId: string, roles: string[], rules: CaslRule[]): Promise<void>
  async invalidateOrganization(orgId: string): Promise<void>
}
```

**Cache Key Format**: `perm:rules:{orgId}:{role1,role2}` (sorted)

**Error Handling**: Redis 故障时返回 `null`，自动降级到 DB

---

### 2. Enhanced ScopedDb (`scoped-db.ts`)

**Responsibility**: Drizzle Proxy，拦截所有查询并注入权限检查

**Key Functions**:
```typescript
// SELECT 自动字段过滤
function wrapQueryWithPermission(query, table): Query {
  query.execute = async () => {
    const result = await originalExecute();
    return autoFilterFields(result, action, subject);
  };
}

// UPDATE 自动 ABAC + 字段过滤
function wrapUpdateWithPermission(updateBuilder, table): UpdateBuilder {
  whereBuilder.execute = async () => {
    // 1. Query instances via rawDb
    const instances = await rawDb.select().from(table).where(condition);

    // 2. ABAC check
    for (const instance of instances) {
      await permissionKernel.require(action, subject, instance, {skipAudit: true});
    }

    // 3. Field filtering
    const filteredValues = filterFields(values, allowedFields);

    // 4. Execute via rawDb
    return rawDb.update(table).set(filteredValues).where(condition);
  };
}
```

**Debug Output**:
```
[PermissionDB] SELECT with permission { action: 'read', subject: 'Article' }
[PermissionDB] Field filtering read Article { allowedFields: [...], removed: [...] }
[PermissionDB] UPDATE with permission { action: 'update', subject: 'Article' }
[PermissionDB] UPDATE query found 1 instances
[PermissionDB] ABAC check: update Article instance-123 → ✅ PASS
```

---

### 3. SQL Optimization (`casl-to-sql.ts`)

**Responsibility**: 将 CASL conditions 转换为 SQL WHERE 子句

**Example**:
```typescript
// Input (CASL condition)
{ authorId: '${user.id}', status: { $ne: 'archived' } }

// Output (SQL)
and(
  eq(articles.authorId, 'user-123'),
  not(eq(articles.status, 'archived'))
)
```

**Supported Operators**: `$eq`, `$ne`, `$in`, `$gte`, `$lte`, `$gt`, `$lt`

**Unsupported** (Fallback): `$or`, `$and`, nested conditions, custom functions

---

## Risks / Trade-offs

### Risk 1: 向后兼容性破坏

**Risk**: 启用 `.meta()` 后，旧代码可能因权限拒绝而失败

**Mitigation**:
- 渐进式迁移：先在新接口试点
- 完整测试覆盖：集成测试验证所有场景
- Debug 日志：快速定位问题（`DEBUG_PERMISSION=true`）

**Rollback**: 移除 `.meta()` 配置即可恢复旧行为

---

### Risk 2: 性能退化（边缘情况）

**Risk**: 复杂 ABAC 条件无法转 SQL，仍需双查询

**Mitigation**:
- Smart Fallback：大部分场景（~70%）能优化
- 监控指标：跟踪 SQL 优化命中率
- 优先优化热路径：常用操作保证单查询

**Acceptance**: P99 延迟 10-15ms（优于手动 20ms）

---

### Risk 3: Redis 缓存失效延迟

**Risk**: 修改权限后，5 分钟内可能使用旧缓存

**Mitigation**:
- 主动失效：修改权限时立即调用 `invalidateOrganization()`
- TTL 兜底：即使失效失败，5 分钟后自动过期
- 关键操作强制刷新：高敏感操作可跳过缓存

**Monitoring**: 告警权限拒绝率异常波动

---

### Risk 4: 调试复杂度增加

**Risk**: 自动化逻辑在 Proxy 层，开发者不清楚发生了什么

**Mitigation**:
- 详细 DEBUG 日志：显示每步决策（RBAC → ABAC → 字段过滤）
- 文档化：提供完整流程图和示例
- 测试工具：提供 `permissionKernel.explain(action, subject)` 方法（未来）

---

## Migration Plan

### Phase 1: Infrastructure (Week 1)
1. 实现 `PermissionCache` + Redis 集成
2. 增强 `PermissionKernel`（三层缓存 + `permittedFields`）
3. 扩展 `AsyncLocalStorage`

**验收标准**: 单元测试通过，缓存命中率 > 95%

---

### Phase 2: ScopedDb Integration (Week 2)
1. 实现 `autoFilterFields` + Proxy 拦截
2. 集成 tRPC 中间件
3. 迁移 3-5 个试点接口

**验收标准**: 试点接口集成测试通过，性能达标（P50 < 3ms）

---

### Phase 3: Batch Migration (Week 3)
1. 扫描所有 tRPC handlers（~50-100 个）
2. 批量添加 `.meta()` + 移除手动代码
3. 回归测试

**验收标准**: 所有接口迁移完成，E2E 测试全绿

---

### Phase 4: Production Rollout (Week 4)
1. 灰度发布（10% 流量）
2. 监控 24 小时（错误率、延迟、缓存命中率）
3. 全量发布
4. 持续监控 1 周

**回滚方案**: Revert commit，移除 `.meta()` 配置

---

## Open Questions

1. **测试策略**: 如何模拟 Proxy 层的权限拦截？需要专门的集成测试框架吗？
   - **建议**: 使用 `AsyncLocalStorage.run()` 手动注入 context

2. **监控指标**: 需要哪些 Prometheus metrics？
   - `permission_check_duration_ms` (histogram)
   - `permission_cache_hit_rate` (gauge)
   - `permission_denied_total` (counter)

3. **字段过滤边缘情况**: 如果 UPDATE 的字段中包含未授权字段，应该：
   - A. 静默忽略（当前方案）
   - B. 抛出错误
   - **建议**: 静默忽略 + DEBUG 日志（用户友好）

4. **跨租户访问**: 现有 `cross-tenant` 权限如何与 ScopedDb 集成？
   - **建议**: ScopedDb 检查是否有 `cross-tenant` 权限，有则跳过租户过滤

5. **前端缓存**: 前端是否也需要类似的权限缓存机制？
   - **决策**: 不在本次范围，前端已有 `packRules()` 序列化机制
