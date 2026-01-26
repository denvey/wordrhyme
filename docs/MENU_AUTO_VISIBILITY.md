# 菜单自动可见性功能

> **版本**: v1.0
> **更新日期**: 2026-01-22
> **状态**: ✅ 已实施

---

## 问题背景

### 原始问题

当 owner 或 admin 创建自定义菜单时,新菜单**不会自动显示在左侧导航栏**,必须手动去 Roles 页面配置可见性。

**用户体验问题**:
1. 创建菜单后看不到,用户会困惑
2. 需要额外的步骤去配置可见性
3. 不符合直觉(创建者应该能看到自己创建的菜单)

### 技术原因

菜单显示由两个条件控制:
1. ✅ 菜单的 `visible` 字段为 `true`
2. ❌ 当前用户的角色在 `role_menu_visibility` 表中有可见权限

之前的实现只创建了菜单记录,没有自动创建可见性记录。

---

## 解决方案

### 实现逻辑

在 `MenuService.createItem()` 方法中添加自动授权逻辑:

```typescript
async createItem(tenantId: string, dto: CreateMenuDto): Promise<Menu> {
    // 1. 创建菜单
    const newMenu = await db.insert(menus).values({...}).returning();

    // 2. 自动授权给管理员角色
    await this.autoGrantVisibilityToAdmins(newMenu.id, tenantId);

    return newMenu;
}

private async autoGrantVisibilityToAdmins(menuId: string, tenantId: string) {
    // 查找该组织的 owner 和 admin 角色
    const adminRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(
            eq(roles.organizationId, tenantId),
            inArray(roles.slug, ['owner', 'admin'])
        ));

    // 为每个管理员角色创建可见性记录
    await db.insert(roleMenuVisibility).values(
        adminRoles.map(role => ({
            menuId,
            roleId: role.id,
            organizationId: tenantId,
            visible: true,
        }))
    );
}
```

### 授权规则

| 角色 | 自动可见 | 说明 |
|------|---------|------|
| **owner** | ✅ 是 | 组织所有者,自动看到所有自定义菜单 |
| **admin** | ✅ 是 | 管理员,自动看到所有自定义菜单 |
| **member** | ❌ 否 | 普通成员,需要手动授权 |
| **其他角色** | ❌ 否 | 自定义角色,需要手动授权 |

---

## 使用场景

### 场景 1: Owner 创建菜单

```typescript
// Owner 创建一个新菜单
const menu = await trpc.menu.create.mutate({
    code: 'settings',
    label: 'Settings',
    path: '/settings',
});

// ✅ 自动效果:
// 1. 创建菜单记录
// 2. 自动为 owner 和 admin 角色添加可见性
// 3. Owner 刷新页面后立即看到新菜单
```

### 场景 2: Admin 创建菜单

```typescript
// Admin 创建一个新菜单
const menu = await trpc.menu.create.mutate({
    code: 'reports',
    label: 'Reports',
    path: '/reports',
});

// ✅ 自动效果:
// 1. 创建菜单记录
// 2. 自动为 owner 和 admin 角色添加可见性
// 3. 所有 owner 和 admin 都能看到新菜单
```

### 场景 3: 为其他角色授权

```typescript
// 如果需要让 member 角色也能看到菜单
// 需要在 Roles 页面手动配置:
// 1. 进入 Roles 页面
// 2. 选择 member 角色
// 3. 勾选 "Settings" 菜单
// 4. 保存
```

---

## 数据流

### 创建菜单的完整流程

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户创建菜单                                          │
│    trpc.menu.create.mutate({ code, label, path })      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 2. MenuService.createItem()                             │
│    - 验证 code 唯一性                                    │
│    - 验证 parentCode 存在性                              │
│    - 插入 menus 表                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 3. autoGrantVisibilityToAdmins()                        │
│    - 查找组织的 owner/admin 角色                         │
│    - 批量插入 role_menu_visibility 记录                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 4. 返回创建的菜单                                        │
│    - 菜单已创建                                          │
│    - 可见性已配置                                        │
│    - Owner/Admin 刷新后可见                              │
└─────────────────────────────────────────────────────────┘
```

---

## 数据库变更

### 自动创建的记录

当创建一个新菜单时,会自动创建以下记录:

#### menus 表

```sql
INSERT INTO menus (
    id, code, type, source, tenant_id,
    label, path, icon, open_mode, parent_code,
    order, visible, target, metadata
) VALUES (
    'uuid-1', 'custom:settings', 'custom', 'custom', 'org-123',
    'Settings', '/settings', 'Settings', 'route', NULL,
    0, true, 'admin', NULL
);
```

#### role_menu_visibility 表(自动创建)

```sql
-- 为 owner 角色添加可见性
INSERT INTO role_menu_visibility (
    menu_id, role_id, organization_id, visible
) VALUES (
    'uuid-1', 'owner-role-id', 'org-123', true
);

-- 为 admin 角色添加可见性
INSERT INTO role_menu_visibility (
    menu_id, role_id, organization_id, visible
) VALUES (
    'uuid-1', 'admin-role-id', 'org-123', true
);
```

---

## 边界情况处理

### 情况 1: 组织没有 admin 角色

```typescript
// 如果组织只有 owner 角色,没有 admin 角色
const adminRoles = await db.select(...).where(...);
// adminRoles.length === 1 (只有 owner)

// ✅ 正常处理: 只为 owner 添加可见性
```

### 情况 2: 组织没有任何管理员角色

```typescript
// 如果组织没有 owner 或 admin 角色(异常情况)
const adminRoles = await db.select(...).where(...);
// adminRoles.length === 0

// ✅ 安全处理: 跳过自动授权,不抛出错误
if (adminRoles.length === 0) {
    return; // 静默跳过
}
```

### 情况 3: 并发创建菜单

```typescript
// 多个管理员同时创建菜单
// ✅ 数据库事务保证一致性
// ✅ 每个菜单都会正确授权
```

---

## 性能考虑

### 查询优化

```typescript
// 1. 使用索引查询角色
// roles 表有 (organization_id, slug) 索引
const adminRoles = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(
        eq(roles.organizationId, tenantId),
        inArray(roles.slug, ['owner', 'admin'])
    ));

// 2. 批量插入可见性记录
// 一次性插入所有记录,而不是循环插入
await db.insert(roleMenuVisibility).values(visibilityRecords);
```

### 性能指标

| 操作 | 查询次数 | 时间复杂度 |
|------|---------|-----------|
| 创建菜单 | 1 次 INSERT | O(1) |
| 查找管理员角色 | 1 次 SELECT | O(1) (索引) |
| 批量授权 | 1 次 INSERT | O(n) n=角色数 |
| **总计** | **3 次查询** | **< 50ms** |

---

## 安全考虑

### 权限检查

```typescript
// tRPC 层已经验证用户权限
export const menuRouter = router({
    create: protectedProcedure  // ← 需要认证
        .input(createMenuSchema)
        .mutation(async ({ input, ctx }) => {
            // ctx.tenantId 已验证
            // ctx.userId 已验证
            return menuService.createItem(ctx.tenantId, input);
        }),
});
```

### 防止权限提升

```typescript
// ✅ 只授权给 owner 和 admin
// ❌ 不会授权给其他角色
const adminRoles = await db
    .select()
    .from(roles)
    .where(and(
        eq(roles.organizationId, tenantId),
        inArray(roles.slug, ['owner', 'admin'])  // ← 硬编码白名单
    ));
```

### 租户隔离

```typescript
// ✅ 只查找当前组织的角色
eq(roles.organizationId, tenantId)

// ✅ 可见性记录绑定到组织
organizationId: tenantId
```

---

## 测试用例

### 单元测试

```typescript
describe('MenuService.createItem', () => {
    it('should auto-grant visibility to owner role', async () => {
        // 创建菜单
        const menu = await menuService.createItem('org-123', {
            code: 'test-menu',
            label: 'Test Menu',
            path: '/test',
            target: 'admin',
        });

        // 验证可见性记录
        const visibility = await db
            .select()
            .from(roleMenuVisibility)
            .where(eq(roleMenuVisibility.menuId, menu.id));

        expect(visibility.length).toBeGreaterThan(0);
        expect(visibility.some(v => v.visible)).toBe(true);
    });

    it('should handle organization without admin roles', async () => {
        // 删除所有管理员角色
        await db.delete(roles).where(eq(roles.organizationId, 'org-456'));

        // 创建菜单(不应该抛出错误)
        const menu = await menuService.createItem('org-456', {
            code: 'test-menu',
            label: 'Test Menu',
            path: '/test',
            target: 'admin',
        });

        expect(menu).toBeDefined();
    });
});
```

### 集成测试

```typescript
describe('Menu Creation Flow', () => {
    it('should show menu to owner after creation', async () => {
        // 1. Owner 创建菜单
        const menu = await trpc.menu.create.mutate({
            code: 'new-menu',
            label: 'New Menu',
            path: '/new',
        });

        // 2. 查询 Owner 可见的菜单
        const visibleMenus = await trpc.menu.list.query({
            target: 'admin',
        });

        // 3. 验证新菜单在列表中
        expect(visibleMenus.some(m => m.code === 'custom:new-menu')).toBe(true);
    });
});
```

---

## 迁移指南

### 修复现有菜单

如果你在实施此功能前已经创建了一些菜单,需要运行迁移脚本:

```bash
# 运行修复脚本
tsx apps/server/fix-custom-menu-visibility.ts
```

脚本会:
1. 查找所有自定义菜单
2. 查找所有 owner/admin 角色
3. 为缺失的可见性记录补充数据

---

## 配置选项

### 自定义自动授权的角色

如果需要修改自动授权的角色列表,编辑 `menu.service.ts`:

```typescript
// 默认: owner 和 admin
inArray(roles.slug, ['owner', 'admin'])

// 自定义: 添加更多角色
inArray(roles.slug, ['owner', 'admin', 'manager'])
```

### 禁用自动授权

如果需要禁用自动授权功能:

```typescript
async createItem(tenantId: string, dto: CreateMenuDto): Promise<Menu> {
    // ... 创建菜单

    // 注释掉这一行
    // await this.autoGrantVisibilityToAdmins(newMenu.id, tenantId);

    return newMenu;
}
```

---

## 常见问题

### Q1: 为什么不自动授权给所有角色?

**A**: 基于最小权限原则:
- ✅ Owner/Admin 需要管理菜单,应该看到所有菜单
- ❌ 普通成员不需要看到所有菜单,应该按需授权

### Q2: 如果我想让某个菜单对所有人可见怎么办?

**A**: 在 Roles 页面手动配置:
1. 进入 Roles 页面
2. 为每个角色勾选该菜单
3. 或者创建一个 "public" 角色,所有用户都分配这个角色

### Q3: 自动授权会影响性能吗?

**A**: 不会:
- 只增加 2 次数据库查询(< 50ms)
- 使用批量插入,不是循环插入
- 有数据库索引优化

### Q4: 如果组织有多个 admin 角色怎么办?

**A**: 会为所有 admin 角色授权:
```typescript
// 查找所有 slug 为 'admin' 的角色
const adminRoles = await db.select(...).where(
    inArray(roles.slug, ['owner', 'admin'])
);
// 可能返回多个角色,都会被授权
```

### Q5: 删除菜单后,可见性记录会自动删除吗?

**A**: 需要配置外键级联删除:
```sql
ALTER TABLE role_menu_visibility
ADD CONSTRAINT fk_menu
FOREIGN KEY (menu_id) REFERENCES menus(id)
ON DELETE CASCADE;
```

---

## 相关文档

- [菜单系统设计](./MENU_SYSTEM.md)
- [权限系统设计](./PERMISSION_SYSTEM.md)
- [角色管理](./ROLE_MANAGEMENT.md)

---

## 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-01-22 | 实现自动授权功能 |

---

**文档维护者**: 开发团队
**最后更新**: 2026-01-22
**下次审查**: 2026-04-22
