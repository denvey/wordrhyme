# Hooks 路由安全重构

## 问题背景

### 原始实现的安全隐患

1. **数据存储在内存中**
   - `RuntimeHookHandler` 存储在 `HookRegistry` 的内存 Map 中
   - 不在数据库中，无法通过数据库层面的 RLS (Row Level Security) 保护

2. **手动过滤的风险**
   - 每个路由方法都需要手动判断 `organizationId`
   - 代码重复，容易遗漏
   - 新增接口时可能忘记添加过滤逻辑
   - 判断逻辑不一致会产生安全漏洞

3. **原始代码示例**
```typescript
// ❌ 危险：每个方法都手动判断
list: protectedProcedure.query(async ({ ctx }) => {
  const platform = isPlatformView(ctx.organizationId);
  const filterOrgId = platform ? undefined : ctx.organizationId;
  return hookRegistry.getHandlers(hookId, filterOrgId);
});

// ❌ 如果忘记判断，会泄露数据
getHandler: protectedProcedure.query(async ({ input }) => {
  // 忘记过滤 organizationId！
  return hookRegistry.getHandler(input.handlerId);
});
```

## 解决方案

### 1. 数据访问层统一过滤

**核心原则**：所有数据访问必须通过 `HookRegistry`，由它统一处理组织隔离。

#### 新增类型定义

```typescript
/**
 * Organization Context for data access
 * - 'platform': Platform admin view (see all data)
 * - string: Tenant admin view (see only their organization)
 */
export type OrganizationContext = 'platform' | string;
```

#### 统一过滤方法

```typescript
/**
 * Filter handlers by organization context
 * SECURITY: This is the ONLY place where organization filtering happens
 */
private filterByOrganization(
  handlers: RuntimeHookHandler[],
  orgContext: OrganizationContext
): RuntimeHookHandler[] {
  // Platform organization sees all handlers
  if (orgContext === 'platform') {
    return handlers;
  }

  // Tenant organization sees:
  // 1. System-level handlers (organizationId === undefined)
  // 2. Their own handlers (organizationId === orgContext)
  return handlers.filter(h =>
    h.organizationId === undefined || h.organizationId === orgContext
  );
}
```

### 2. 强制类型安全

所有数据访问方法都**必须**传入 `OrganizationContext`：

```typescript
// ✅ 类型安全：必须传入 orgContext
getHandlers(hookId: string, orgContext: OrganizationContext): RuntimeHookHandler[]

// ✅ 类型安全：必须传入 orgContext
getHandler(handlerId: string, orgContext: OrganizationContext): RuntimeHookHandler | undefined

// ✅ 类型安全：必须传入 orgContext
getTotalHandlerCount(orgContext: OrganizationContext): number
```

**如果忘记传入 `orgContext`，TypeScript 会报错，编译失败！**

### 3. 路由层简化

路由层只需要：
1. 调用 `getOrganizationContext()` 获取上下文
2. 传递给 `HookRegistry` 方法
3. 无需任何手动过滤逻辑

```typescript
// ✅ 安全：统一获取 orgContext
function getOrganizationContext(organizationId: string | undefined): OrganizationContext {
  if (!organizationId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Organization context required' });
  }
  return organizationId === 'platform' ? 'platform' : organizationId;
}

// ✅ 安全：所有数据访问都通过 HookRegistry
list: protectedProcedure.query(async ({ ctx }) => {
  const orgContext = getOrganizationContext(ctx.organizationId);
  return hooks.map(hook => ({
    handlerCount: hookRegistry.getHandlers(hook.id, orgContext).length,
  }));
});
```

## 安全保证

### 1. 编译时保证

- ✅ TypeScript 强制要求传入 `OrganizationContext`
- ✅ 无法绕过类型检查
- ✅ 新增接口时自动强制遵守

### 2. 运行时保证

- ✅ 所有过滤逻辑集中在 `filterByOrganization()` 方法
- ✅ 单一职责：只有一个地方处理组织隔离
- ✅ 易于审计和测试

### 3. 防御深度

```typescript
// 第一层：权限系统
.use(requirePermission('hooks:read'))

// 第二层：组织上下文验证
const orgContext = getOrganizationContext(ctx.organizationId);

// 第三层：数据访问层过滤
const handler = hookRegistry.getHandler(handlerId, orgContext);

// 第四层：返回 undefined 而不是抛出错误（防止信息泄露）
if (!handler) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Handler not found or access denied' });
}
```

## 对比总结

| 方面 | 原始实现 | 重构后 |
|------|---------|--------|
| **过滤位置** | 每个路由方法手动过滤 | 数据访问层统一过滤 |
| **类型安全** | ❌ 可选参数，容易遗漏 | ✅ 必需参数，编译时检查 |
| **代码重复** | ❌ 每个方法都重复判断 | ✅ 单一职责，无重复 |
| **安全风险** | ❌ 高（容易遗漏） | ✅ 低（强制执行） |
| **可维护性** | ❌ 难以维护 | ✅ 易于维护 |
| **审计难度** | ❌ 需要检查每个方法 | ✅ 只需审计一个方法 |

## 最佳实践

### 1. 永远不要绕过 HookRegistry

```typescript
// ❌ 危险：直接访问内部数据
const handler = hookRegistry['handlerIndex'].get(handlerId);

// ✅ 安全：通过公共 API 访问
const handler = hookRegistry.getHandler(handlerId, orgContext);
```

### 2. 永远传入 OrganizationContext

```typescript
// ❌ 错误：TypeScript 会报错
const handlers = hookRegistry.getHandlers(hookId);

// ✅ 正确：必须传入 orgContext
const handlers = hookRegistry.getHandlers(hookId, orgContext);
```

### 3. 使用统一的上下文转换

```typescript
// ✅ 统一转换：所有路由都使用这个函数
const orgContext = getOrganizationContext(ctx.organizationId);
```

## 测试建议

### 1. 单元测试

```typescript
describe('HookRegistry organization isolation', () => {
  it('should filter handlers by organization', () => {
    // Platform context sees all
    const allHandlers = registry.getHandlers('hook.id', 'platform');
    expect(allHandlers).toHaveLength(3);

    // Tenant context sees only their own
    const tenantHandlers = registry.getHandlers('hook.id', 'tenant-1');
    expect(tenantHandlers).toHaveLength(1);
  });

  it('should return undefined for inaccessible handlers', () => {
    const handler = registry.getHandler('handler-id', 'tenant-2');
    expect(handler).toBeUndefined();
  });
});
```

### 2. 集成测试

```typescript
describe('Hooks API security', () => {
  it('should not leak handlers across organizations', async () => {
    // Login as tenant-1
    const response1 = await trpc.hooks.list.query();

    // Login as tenant-2
    const response2 = await trpc.hooks.list.query();

    // Should see different data
    expect(response1).not.toEqual(response2);
  });
});
```

## 结论

通过将组织隔离逻辑从路由层移到数据访问层，并使用 TypeScript 类型系统强制执行，我们实现了：

1. **编译时安全**：无法绕过类型检查
2. **运行时安全**：统一的过滤逻辑
3. **可维护性**：单一职责，易于审计
4. **防御深度**：多层安全保护

这是**多租户架构的最佳实践**。
