# 权限系统设计文档

## 概述

本系统使用 **CASL** 作为权限管理框架,结合 **Better Auth** 的用户认证,实现了灵活的多层级权限系统。

## 架构设计

### 两个独立的角色系统

系统中存在两个独立但协同工作的角色系统:

#### 1. Better Auth 全局角色 (user.role)

- **存储位置**: `user` 表的 `role` 字段
- **作用范围**: 全局/平台级别
- **用途**:
  - 控制 Better Auth admin API 的访问(创建用户、封禁用户等)
  - 标识用户的全局权限级别
- **示例**: `admin`, `auditor`, `order-viewer`

#### 2. 组织角色 (member.role)

- **存储位置**: `member` 表的 `role` 字段
- **作用范围**: 组织级别
- **用途**: 控制用户在特定组织内的权限
- **示例**: `owner`, `admin`, `member`, `viewer`

### 权限规则存储

所有权限规则存储在 `role_permissions` 表中:

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY,
  role_id UUID REFERENCES roles(id),  -- 关联到 roles 表
  action VARCHAR,                      -- 操作: manage, create, read, update, delete
  subject VARCHAR,                     -- 资源: Organization, User, Order, etc.
  fields JSONB,                        -- 字段级权限(可选)
  conditions JSONB,                    -- 条件(可选,如 { "ownerId": "${user.id}" })
  inverted BOOLEAN,                    -- 是否为禁止规则
  source VARCHAR                       -- 来源: core, plugin-xxx
);
```

## 全局角色的实现

### Platform 组织 = 全局角色配置中心

为了让 Better Auth 的全局角色能够在权限系统中生效,我们使用 **Platform 组织**作为全局角色的配置中心:

```
Platform 组织 (organizationId: "platform")
├─ admin 角色 → manage all (超级管理员)
├─ order-viewer 角色 → read Order (只能查看订单)
├─ auditor 角色 → read AuditLog, read Organization (审计员)
└─ 其他自定义全局角色...
```

### 工作流程

```
1. 用户登录
   ↓
2. Context 获取用户信息
   - user.role (全局角色,如 "admin")
   - member.role (当前组织角色,如 "owner")
   ↓
3. Context 合并角色到 userRoles
   userRoles = [globalRole, orgRole]
   例如: ["admin", "owner"]
   ↓
4. loadRulesFromDB 查询权限规则
   - 只查询当前组织的角色权限
   - 严格多租户隔离
   ↓
5. 创建 CASL Ability 实例
   ↓
6. 前端通过 permissions.myRules 获取权限规则
   ↓
7. 前端使用 useCan('manage', 'Organization') 检查权限
```

**重要**：全局管理员必须切换到 Platform 组织才能使用全局权限。

## 关键代码实现

### 1. Context 合并全局角色和组织角色

**文件**: `apps/server/src/trpc/context.ts`

```typescript
// 获取用户的全局角色(Better Auth admin plugin)
const userRecord = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

const globalRole = userRecord[0]?.role;

// 查询用户在当前组织的角色
const memberships = await db
    .select({ role: member.role })
    .from(member)
    .where(and(
        eq(member.userId, userId),
        eq(member.organizationId, activeOrgId)
    ));

// 合并全局角色和组织角色
if (globalRole && !userRoles.includes(globalRole)) {
    userRoles.push(globalRole);
}
for (const m of memberships) {
    if (m.role && !userRoles.includes(m.role)) {
        userRoles.push(m.role);
    }
}
```

### 2. 严格多租户隔离的权限查询

**文件**: `apps/server/src/permission/casl-ability.ts`

```typescript
export async function loadRulesFromDB(
    roleNames: string[],
    orgId: string
): Promise<CaslRule[]> {
    // 只查询当前组织的角色（严格多租户隔离）
    const roleRecords = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(
            inArray(roles.slug, roleNames),
            eq(roles.organizationId, orgId)  // 只查当前组织
        ));

    // 加载这些角色的权限规则
    const permissions = await db
        .select(...)
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));

    return permissions;
}
```

**重要**：全局管理员必须切换到 Platform 组织才能使用全局权限。

### 3. 前端权限检查

**文件**: `apps/admin/src/components/OrgAdminRoute.tsx`

```typescript
export function OrgAdminRoute({ children, fallback }: OrgAdminRouteProps) {
    // 使用 CASL 权限系统检查权限
    const canManage = useCan('manage', 'Organization');

    if (!canManage) {
        return fallback || <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
```

## 配置全局角色

### 步骤1: 在 Platform 组织中创建角色

```typescript
// 创建全局角色
await db.insert(roles).values({
    slug: 'order-viewer',              // 角色标识
    name: 'Global Order Viewer',       // 显示名称
    organizationId: 'platform',        // 必须是 platform
    description: 'Can view orders across all organizations',
});
```

### 步骤2: 配置角色权限

```typescript
// 为角色配置权限规则
await db.insert(rolePermissions).values({
    roleId: roleId,
    action: 'read',        // 操作: manage, create, read, update, delete
    subject: 'Order',      // 资源类型
    source: 'core',
});
```

### 步骤3: 分配全局角色给用户

```sql
-- 通过 Better Auth API 或直接更新数据库
UPDATE user SET role = 'order-viewer' WHERE email = 'viewer@example.com';
```

## 支持的全局角色示例

| 全局角色 | 权限配置 | 使用场景 |
|---------|---------|---------|
| `admin` | `manage all` | 超级管理员,所有权限 |
| `order-viewer` | `read Order` | 只能查看所有组织的订单 |
| `auditor` | `read AuditLog`, `read Organization` | 审计员,查看日志和组织信息 |
| `support` | `read User`, `read Order`, `update Order` | 客服,查看和处理订单 |
| `content-moderator` | `read Content`, `update Content`, `delete Content` | 内容审核员 |

## 前端使用权限

### 1. 权限加载

前端通过 `AbilityProvider` 自动加载权限:

```typescript
// apps/admin/src/lib/ability.tsx
export function AbilityProvider({ children }: AbilityProviderProps) {
    // 一次性拉取所有权限规则
    const { data: rulesData } = trpc.permissions.myRules.useQuery(undefined, {
        refetchOnWindowFocus: true,
        staleTime: 5 * 60 * 1000, // 缓存5分钟
    });

    // 创建 CASL ability 实例
    const ability = createMongoAbility(rulesData.rules);

    return (
        <AbilityContext.Provider value={ability}>
            {children}
        </AbilityContext.Provider>
    );
}
```

### 2. 权限检查

```typescript
// 方式1: 使用 useCan hook
const canManageOrg = useCan('manage', 'Organization');

// 方式2: 使用 useAbility hook
const ability = useAbility();
if (ability.can('read', 'Order')) {
    // 显示订单列表
}

// 方式3: 使用 Can 组件
<Can I="update" a="Settings">
    <SettingsForm />
</Can>
```

## 常见问题

### Q1: 为什么不直接在 user.role 中存储权限?

**A**: Better Auth 的 `user.role` 只是一个字符串标识,不包含权限规则。我们需要在数据库中配置每个角色的具体权限,这样才能实现灵活的权限管理。

### Q2: 全局角色和组织角色会冲突吗?

**A**: 不会。在同一个组织内，用户可以同时拥有全局角色和组织角色，权限规则会**合并**:
- 如果用户在 Test Org 有 `user.role = "admin"` (全局角色)
- 同时在 Test Org 有 `member.role = "owner"` (组织角色)
- Test Org 的 "admin" 角色有 `read Order` 权限
- Test Org 的 "owner" 角色有 `update Order` 权限
- 最终用户在 Test Org 同时拥有 `read` 和 `update` 权限

**注意**：全局管理员必须切换到 Platform 组织才能使用 Platform 组织配置的全局权限。

### Q3: Platform 组织能管理所有组织的数据吗?

**A**: 这取决于你的设计选择：

**方案 A：Platform 组织只是权限配置中心（当前实现）**
- Platform 组织只用于配置全局角色的权限规则
- 遵循严格的多租户隔离原则
- Platform 组织只能看到 `organizationId = 'platform'` 的数据
- 无法直接查询其他组织的订单、商品、用户等数据

**方案 B：Platform 组织是超级租户（需要额外实现）**
- Platform 组织可以跨租户查询所有数据
- 需要在 tRPC 查询层添加特殊逻辑
- 检测到 `activeOrgId === 'platform'` 且用户有特定权限时，移除 organizationId 过滤条件
- 需要配置专门的跨租户权限，如 `read:all-organizations`

**推荐**：如果需要全局管理功能，建议实现方案 B，但必须：
1. 使用专门的权限控制跨租户查询
2. 在 API 层面显式标记哪些接口支持跨租户
3. 记录所有跨租户操作的审计日志

### Q4: 如何限制全局角色只在特定组织生效?

**A**: 使用 CASL 的 `conditions` 字段:

```typescript
await db.insert(rolePermissions).values({
    roleId: roleId,
    action: 'read',
    subject: 'Order',
    conditions: { organizationId: 'specific-org-id' }, // 限制条件
});
```

### Q4: 如何撤销全局角色的权限?

**A**: 两种方式:
1. 删除 Platform 组织中该角色的权限规则
2. 使用 `inverted: true` 创建禁止规则

### Q5: 前端权限检查失败怎么办?

**A**: 检查以下几点:
1. 用户是否已登录?
2. `permissions.myRules` API 是否返回了权限规则?
3. Platform 组织中是否配置了该角色的权限?
4. 浏览器控制台是否有错误?

## 注意事项

### ⚠️ 重要约束

1. **Platform 组织是特殊的**
   - 不要删除 Platform 组织
   - 不要修改 Platform 组织的 ID
   - 所有全局角色必须在 Platform 组织中配置

2. **角色名称必须匹配**
   - `user.role` 的值必须与 Platform 组织中的 `roles.slug` 匹配
   - 例如: `user.role = "admin"` 需要 Platform 组织中有 `slug = "admin"` 的角色

3. **权限规则不会自动继承**
   - 每个角色的权限必须显式配置
   - 没有配置的权限默认为拒绝(白名单模式)

4. **前端权限检查不是安全边界**
   - 前端权限检查只是 UI 优化
   - 后端 API 必须再次检查权限
   - 使用 `requirePermission` 中间件保护 tRPC endpoints

### ✅ 最佳实践

1. **使用语义化的角色名称**
   - ✅ `order-viewer`, `content-moderator`
   - ❌ `role1`, `temp-role`

2. **最小权限原则**
   - 只授予必要的权限
   - 优先使用 `read` 而不是 `manage`

3. **定期审计权限**
   - 检查 Platform 组织中的角色配置
   - 删除不再使用的角色和权限

4. **文档化自定义角色**
   - 在代码注释或文档中说明每个角色的用途
   - 记录权限变更历史

## 相关文件

- `apps/server/src/trpc/context.ts` - Context 创建,合并全局角色和组织角色
- `apps/server/src/permission/casl-ability.ts` - CASL ability 创建,跨组织查询权限
- `apps/server/src/trpc/routers/permissions.ts` - 权限 API,提供 myRules endpoint
- `apps/admin/src/lib/ability.tsx` - 前端权限管理,AbilityProvider 和 hooks
- `apps/admin/src/components/OrgAdminRoute.tsx` - 路由保护示例

## 配置脚本

- `apps/server/setup-global-admin.ts` - 配置全局超级管理员
- `apps/server/setup-global-roles-example.ts` - 配置多种全局角色的示例
- `apps/server/verify-global-admin.ts` - 验证全局角色配置

## 更新日志

- 2026-01-16: 初始版本,实现全局角色与组织角色的合并机制
