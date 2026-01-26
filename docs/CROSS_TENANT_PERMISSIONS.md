# 跨租户权限系统设计

## 概述

Platform 组织作为超级租户，可以跨租户查询和管理所有组织的数据。但这种能力必须通过**权限组合**来控制。

## 权限组合模式（推荐）

### 核心思想

跨租户访问 = `cross-tenant` 权限 + 资源权限

### 权限分离

1. **跨租户能力权限**：`manage:cross-tenant`
   - 独立的权限，表示用户具有跨租户访问的能力
   - 单独拥有此权限无法访问任何资源

2. **资源访问权限**：`action:Subject`
   - 例如：`read:Order`、`update:User`、`delete:Product`
   - 在当前组织内访问特定资源的权限

### 组合逻辑

| 权限组合 | 效果 |
|---------|------|
| `cross-tenant` + `read:Order` | ✅ 可以跨租户读取所有组织的订单 |
| 只有 `read:Order` | ✅ 只能读取当前组织的订单 |
| 只有 `cross-tenant` | ❌ 无法访问任何资源 |
| 无任何权限 | ❌ 无法访问 |

### 优点

✅ **扩展性强**：添加新资源（如 `Invoice`）时，只需配置 `read:Invoice` 权限，自动支持跨租户
✅ **灵活控制**：可以只给某些资源跨租户权限（如只允许跨租户查看订单，不允许跨租户查看用户）
✅ **清晰分离**：跨租户能力 vs 资源访问权限，职责明确
✅ **减少配置**：不需要为每个资源创建 `:cross-tenant` 变体

## 权限命名规范

### 跨租户能力权限

格式：`manage:cross-tenant`

- 固定格式，不需要变化
- 表示用户具有跨租户访问的能力

### 资源访问权限

格式：`action:Subject`

示例：
- `read:User` - 读取用户
- `update:Order` - 更新订单
- `delete:Product` - 删除商品
- `manage:Plugin` - 管理插件

## 权限检查逻辑

### 在 tRPC Router 中

```typescript
// 1. 检查是否允许跨租户查询
const canCrossTenant =
    ctx.tenantId === 'platform' &&
    ability.can('manage', 'cross-tenant') &&
    ability.can('read', 'Order');

// 2. 根据权限决定查询范围
const query = db.select().from(order);

if (!canCrossTenant) {
    // 普通查询：只查当前组织
    query.where(eq(order.organizationId, ctx.tenantId));
}
// 跨租户查询：不添加 organizationId 过滤条件

const orders = await query;
```

## 实现步骤

### 1. 扩展 CASL Subject 类型

在 `apps/server/src/permission/casl-ability.ts` 中添加 `cross-tenant` subject：

```typescript
export type AppSubjects =
    | 'all'
    | 'cross-tenant'  // Special permission for cross-tenant access
    | 'User'
    | 'Organization'
    | 'Order'
    | 'Product'
    | 'AuditLog'
    | SubjectType;
```

### 2. 创建权限检查辅助函数

```typescript
// apps/server/src/permission/cross-tenant.ts

export async function canCrossTenant(
    ctx: Context,
    subject: string,
    action: string = 'read'
): Promise<boolean> {
    // Requirement 1: Only Platform organization
    if (ctx.tenantId !== 'platform') {
        return false;
    }

    const ability = await createAppAbility(user, userRoles);

    // Requirement 2: Must have 'cross-tenant' permission
    if (!ability.can('manage', 'cross-tenant')) {
        return false;
    }

    // Requirement 3: Must have resource-specific permission
    if (!ability.can(action, subject)) {
        return false;
    }

    return true;
}
```

### 3. 在 Router 中使用

```typescript
// apps/server/src/trpc/routers/user.ts

export const userRouter = router({
    list: protectedProcedure
        .query(async ({ ctx }) => {
            let query = db.select().from(user);

            // 应用跨租户过滤
            query = applyCrossTenantFilter(
                query,
                ctx,
                'User',
                user.organizationId
            );

            const users = await query;

            // 记录跨租户操作
            if (canCrossTenant(ctx, 'User')) {
                await logCrossTenantAccess(ctx, 'read', 'User', users.length);
            }

            return { users };
        }),
});
```

## 配置跨租户权限

### 为 Platform 组织的 admin 角色配置权限

```typescript
// apps/server/setup-cross-tenant-permissions.ts

await db.insert(rolePermissions).values([
    // 用户管理
    {
        roleId: platformAdminRoleId,
        action: 'read',
        subject: 'User:cross-tenant',
        source: 'core',
    },
    {
        roleId: platformAdminRoleId,
        action: 'update',
        subject: 'User:cross-tenant',
        source: 'core',
    },

    // 订单管理
    {
        roleId: platformAdminRoleId,
        action: 'read',
        subject: 'Order:cross-tenant',
        source: 'core',
    },

    // 商品管理
    {
        roleId: platformAdminRoleId,
        action: 'read',
        subject: 'Product:cross-tenant',
        source: 'core',
    },

    // 审计日志
    {
        roleId: platformAdminRoleId,
        action: 'read',
        subject: 'AuditLog:cross-tenant',
        source: 'core',
    },
]);
```

## 审计日志

所有跨租户操作必须记录审计日志：

```typescript
interface CrossTenantAuditLog {
    userId: string;
    action: string;
    subject: string;
    recordCount: number;
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
}
```

## 安全注意事项

### ⚠️ 关键约束

1. **只有 Platform 组织可以跨租户**
   - 其他组织即使有跨租户权限也无效
   - 必须检查 `activeOrgId === 'platform'`

2. **显式权限检查**
   - 不能假设 `manage:all` 包含跨租户权限
   - 必须显式配置 `action:Subject:cross-tenant`

3. **审计所有跨租户操作**
   - 记录谁、何时、访问了什么
   - 便于安全审计和问题追踪

4. **最小权限原则**
   - 不要给所有 Platform 用户跨租户权限
   - 只给需要的角色配置特定的跨租户权限

5. **前端显示区分**
   - 跨租户查询结果应显示 organizationId
   - 让管理员清楚知道数据来自哪个组织

## 支持的跨租户资源

| 资源 | 跨租户权限 | 使用场景 |
|------|-----------|---------|
| User | `read:User:cross-tenant` | 查看所有用户 |
| Organization | `read:Organization:cross-tenant` | 查看所有组织 |
| Order | `read:Order:cross-tenant` | 查看所有订单 |
| Product | `read:Product:cross-tenant` | 查看所有商品 |
| AuditLog | `read:AuditLog:cross-tenant` | 查看所有审计日志 |
| Plugin | `manage:Plugin:cross-tenant` | 管理所有插件 |

## 实现清单

- [ ] 扩展 CASL Subject 类型
- [ ] 创建跨租户权限检查辅助函数
- [ ] 实现用户管理跨租户查询示例
- [ ] 创建跨租户权限配置脚本
- [ ] 实现跨租户操作审计日志
- [ ] 更新前端显示跨租户数据
- [ ] 编写测试用例

## 相关文件

- `apps/server/src/permission/casl-ability.ts` - CASL 类型定义
- `apps/server/src/permission/cross-tenant.ts` - 跨租户权限辅助函数
- `apps/server/src/trpc/routers/user.ts` - 用户管理示例
- `apps/server/setup-cross-tenant-permissions.ts` - 权限配置脚本
- `docs/PERMISSION_SYSTEM.md` - 权限系统文档

---

**设计状态**: Draft
**最后更新**: 2026-01-16
