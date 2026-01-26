# 菜单配置管理 - 实施计划

> 状态：待批准
> 创建时间：2026-01-14
> 方案：A（单表映射 + RoleDetail Tabs 布局）

## 1. 需求概述

### 1.1 功能目标
- 平台管理员/租户管理员可以配置角色可以看到哪些菜单
- 完全替代现有 `requiredPermission` 机制
- 分层管理：平台管理员配置全局默认，租户管理员可在租户内覆盖
- 仅支持菜单的显示/隐藏配置

### 1.2 核心设计决策
- **数据模型**：单表 `role_menu_visibility`，通过 `organizationId` 区分全局/租户
- **解析优先级**：租户覆盖 > 全局默认 > 默认隐藏
- **多角色用户**：任一角色可见则菜单可见
- **菜单层级**：父菜单隐藏则子菜单也隐藏

---

## 2. 后端架构设计

### 2.1 数据模型

**新建表：`role_menu_visibility`**

```typescript
// apps/server/src/db/schema/role-menu-visibility.ts
import { pgTable, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { roles } from './roles';
import { menus } from './menus';
import { organization } from './auth-schema';

export const roleMenuVisibility = pgTable(
  'role_menu_visibility',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    menuId: text('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
    // NULL = 全局默认，有值 = 租户覆盖
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    visible: boolean('visible').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    // 唯一约束：同一角色+菜单+组织只能有一条记录
    uqRoleMenuOrg: uniqueIndex('uq_role_menu_visibility').on(table.roleId, table.menuId, table.organizationId),
    // 查询优化索引
    idxOrgRole: index('idx_rmv_org_role').on(table.organizationId, table.roleId),
    idxMenuOrg: index('idx_rmv_menu_org').on(table.menuId, table.organizationId),
  })
);

export const roleMenuVisibilityRelations = relations(roleMenuVisibility, ({ one }) => ({
  role: one(roles, { fields: [roleMenuVisibility.roleId], references: [roles.id] }),
  menu: one(menus, { fields: [roleMenuVisibility.menuId], references: [menus.id] }),
  organization: one(organization, { fields: [roleMenuVisibility.organizationId], references: [organization.id] }),
}));

export type RoleMenuVisibility = typeof roleMenuVisibility.$inferSelect;
export type InsertRoleMenuVisibility = typeof roleMenuVisibility.$inferInsert;
```

### 2.2 tRPC Router 设计

**新建 Router：`roleMenuVisibility`**

```typescript
// apps/server/src/trpc/routers/role-menu-visibility.ts

export const roleMenuVisibilityRouter = router({
  /**
   * 获取角色的菜单可见性配置
   * - 返回所有菜单及其可见性状态（租户覆盖 + 全局默认）
   */
  list: protectedProcedure
    .input(z.object({
      roleId: z.string().uuid(),
      organizationId: z.string().uuid().optional(), // 不传则查全局
    }))
    .query(async ({ input, ctx }) => {
      // 权限检查：平台管理员可查全局，租户管理员只能查本租户
      // 返回：{ menuId, label, path, icon, parentId, tenantVisible, globalVisible, effectiveVisible }
    }),

  /**
   * 批量更新角色的菜单可见性
   */
  update: protectedProcedure
    .input(z.object({
      roleId: z.string().uuid(),
      organizationId: z.string().uuid().nullable(), // null = 全局
      visibleMenuIds: z.array(z.string().uuid()), // 可见的菜单 ID 列表
    }))
    .mutation(async ({ input, ctx }) => {
      // 权限检查
      // 事务：删除旧配置 + 插入新配置
      // 缓存失效
    }),

  /**
   * 获取当前用户有效的可见菜单列表
   * - 用于替代原 menu.list 中的 requiredPermission 过滤
   */
  getEffective: protectedProcedure
    .input(z.object({
      target: z.enum(['admin', 'web']),
    }))
    .query(async ({ input, ctx }) => {
      // 获取用户所有角色
      // 解析可见性：租户覆盖 > 全局默认 > 默认隐藏
      // 多角色：任一角色可见则可见
      // 层级：父隐藏则子也隐藏
      // 返回过滤后的菜单树
    }),
});
```

### 2.3 menu.list 改造

```typescript
// apps/server/src/trpc/routers/menu.ts

// 修改 filterMenusByPermission 函数
// 原逻辑：检查 requiredPermission + PermissionKernel.can()
// 新逻辑：调用 roleMenuVisibility.getEffective 获取可见菜单 ID 列表

async function filterMenusByVisibility(menuList: Menu[], ctx: Context): Promise<Menu[]> {
  // 1. 获取用户角色列表
  const userRoles = await getUserRoles(ctx.userId, ctx.tenantId);

  // 2. 查询可见性配置
  // SELECT menu_id, bool_or(COALESCE(tenant.visible, global.visible, false)) as visible
  // FROM menus
  // LEFT JOIN role_menu_visibility tenant ON ...
  // LEFT JOIN role_menu_visibility global ON ...
  // WHERE role_id IN (userRoles)
  // GROUP BY menu_id

  // 3. 过滤菜单
  // 4. 处理层级（父隐藏则子也隐藏）
}
```

### 2.4 迁移脚本

```typescript
// apps/server/src/db/seed/migrate-menu-visibility.ts

/**
 * 从 requiredPermission 迁移到 role_menu_visibility
 *
 * 逻辑：
 * 1. 遍历所有菜单
 * 2. 对于有 requiredPermission 的菜单：
 *    - 查找拥有该权限的角色
 *    - 为这些角色创建 visible=true 的记录
 * 3. 对于无 requiredPermission 的菜单：
 *    - 为所有角色创建 visible=true 的记录（默认可见）
 */
async function migrateMenuVisibility() {
  await db.transaction(async (tx) => {
    const allMenus = await tx.select().from(menus);
    const allRoles = await tx.select().from(roles);

    for (const menu of allMenus) {
      if (menu.requiredPermission) {
        // 查找拥有该权限的角色
        const rolesWithPerm = await findRolesByPermission(tx, menu.requiredPermission, menu.organizationId);
        for (const roleId of rolesWithPerm) {
          await tx.insert(roleMenuVisibility)
            .values({
              roleId,
              menuId: menu.id,
              organizationId: menu.source === 'core' ? null : menu.organizationId,
              visible: true,
            })
            .onConflictDoNothing();
        }
      } else {
        // 无权限要求，所有角色可见
        for (const role of allRoles.filter(r => r.organizationId === menu.organizationId || menu.source === 'core')) {
          await tx.insert(roleMenuVisibility)
            .values({
              roleId: role.id,
              menuId: menu.id,
              organizationId: menu.source === 'core' ? null : menu.organizationId,
              visible: true,
            })
            .onConflictDoNothing();
        }
      }
    }
  });
}
```

### 2.5 权限控制

| 操作 | 平台管理员 | 租户管理员 | 普通用户 |
|------|-----------|-----------|---------|
| list (全局) | ✅ | ❌ | ❌ |
| list (租户) | ✅ | ✅ (本租户) | ❌ |
| update (全局) | ✅ | ❌ | ❌ |
| update (租户) | ✅ | ✅ (本租户) | ❌ |
| getEffective | ✅ | ✅ | ✅ (仅自己) |

---

## 3. 前端架构设计

### 3.1 组件结构

```
apps/admin/src/components/roles/menu-config/
├── MenuVisibilityEditor.tsx   # 主容器：数据获取、状态管理、保存
├── MenuTree.tsx               # 递归树渲染
├── MenuNode.tsx               # 单行项目（memoized）
├── MenuToolbar.tsx            # 搜索和批量操作
└── useMenuTreeSelection.ts    # 级联选择逻辑 hook
```

### 3.2 组件职责

**MenuVisibilityEditor.tsx（主容器）**
```typescript
interface MenuVisibilityEditorProps {
  roleId: string;
  isSystem: boolean; // 系统角色禁止编辑
}

// 职责：
// - 获取所有菜单列表：trpc.menu.list.useQuery({ target: 'admin' })
// - 获取角色配置：trpc.roleMenuVisibility.list.useQuery({ roleId })
// - 管理 checkedIds、expandedIds、searchTerm 状态
// - 保存：trpc.roleMenuVisibility.update.useMutation()
```

**MenuTree.tsx（递归树）**
```typescript
interface MenuTreeProps {
  menuTree: MenuTreeNode[];
  checkedIds: Set<string>;
  expandedIds: Set<string>;
  searchTerm: string;
  onToggleCheck: (menuId: string) => void;
  onToggleExpand: (menuId: string) => void;
}
```

**MenuNode.tsx（单行）**
```typescript
interface MenuNodeProps {
  node: MenuTreeNode;
  level: number;
  checkedState: 'checked' | 'unchecked' | 'indeterminate';
  isExpanded: boolean;
  isVisible: boolean; // 搜索过滤
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}
```

**MenuToolbar.tsx（工具栏）**
```typescript
interface MenuToolbarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}
```

### 3.3 RoleDetail 页面改造

```tsx
// apps/admin/src/pages/RoleDetail.tsx

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wordrhyme/ui';
import { MenuVisibilityEditor } from '../components/roles/menu-config/MenuVisibilityEditor';

export function RoleDetailPage() {
  const { roleId } = useParams();
  const { data: role } = trpc.roles.get.useQuery({ roleId });

  return (
    <div className="container mx-auto py-6">
      <Header title={role?.name} />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
          <TabsTrigger value="general">基本信息</TabsTrigger>
          <TabsTrigger value="menus">菜单可见性</TabsTrigger>
          <TabsTrigger value="permissions">数据权限</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <RoleGeneralForm role={role} />
        </TabsContent>

        <TabsContent value="menus">
          <MenuVisibilityEditor
            roleId={roleId}
            isSystem={role?.isSystem ?? false}
          />
        </TabsContent>

        <TabsContent value="permissions">
          <CaslPermissionEditor roleId={roleId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 3.4 级联选择逻辑

```typescript
// useMenuTreeSelection.ts

export function useMenuTreeSelection(
  menuTree: MenuTreeNode[],
  initialCheckedIds: string[]
) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(initialCheckedIds));

  const handleToggle = useCallback((menuId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      const node = findNode(menuTree, menuId);

      if (next.has(menuId)) {
        // 取消选中：同时取消所有子节点
        next.delete(menuId);
        getAllDescendantIds(node).forEach(id => next.delete(id));
      } else {
        // 选中：同时选中所有子节点
        next.add(menuId);
        getAllDescendantIds(node).forEach(id => next.add(id));
      }

      return next;
    });
  }, [menuTree]);

  // 计算节点状态：checked / unchecked / indeterminate
  const getNodeState = useCallback((menuId: string): CheckedState => {
    const node = findNode(menuTree, menuId);
    if (!node.children?.length) {
      return checkedIds.has(menuId) ? 'checked' : 'unchecked';
    }

    const childIds = getAllDescendantIds(node);
    const checkedCount = childIds.filter(id => checkedIds.has(id)).length;

    if (checkedCount === 0) return 'unchecked';
    if (checkedCount === childIds.length) return 'checked';
    return 'indeterminate';
  }, [menuTree, checkedIds]);

  return { checkedIds, handleToggle, getNodeState };
}
```

### 3.5 可访问性实现

```tsx
// MenuTree.tsx - ARIA 属性

<div role="tree" aria-label="菜单可见性配置">
  {nodes.map(node => (
    <div
      key={node.id}
      role="treeitem"
      aria-expanded={isExpanded}
      aria-selected={checkedState === 'checked'}
      aria-checked={checkedState === 'indeterminate' ? 'mixed' : checkedState === 'checked'}
      aria-level={level}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* ... */}
    </div>
  ))}
</div>

// 键盘导航
const handleKeyDown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'Enter':
    case ' ':
      onToggleCheck();
      break;
    case 'ArrowRight':
      if (!isExpanded) onToggleExpand();
      break;
    case 'ArrowLeft':
      if (isExpanded) onToggleExpand();
      break;
    // ArrowUp/Down: 遍历列表
  }
};
```

---

## 4. 实施步骤

### Phase 1: 后端基础（预计 2-3 小时）
1. [ ] 创建 `role-menu-visibility.ts` schema
2. [ ] 生成数据库迁移文件
3. [ ] 创建 `roleMenuVisibility` tRPC router
4. [ ] 实现 `list` 和 `update` 接口
5. [ ] 添加权限检查中间件

### Phase 2: 迁移脚本（预计 1-2 小时）
1. [ ] 编写迁移脚本 `migrate-menu-visibility.ts`
2. [ ] 测试迁移逻辑
3. [ ] 执行迁移

### Phase 3: menu.list 改造（预计 1-2 小时）
1. [ ] 实现 `getEffective` 接口
2. [ ] 修改 `menu.list` 使用新的可见性过滤
3. [ ] 保留 `requiredPermission` 字段但不再使用
4. [ ] 验证现有功能不受影响

### Phase 4: 前端组件（预计 3-4 小时）
1. [ ] 创建 `menu-config/` 目录结构
2. [ ] 实现 `MenuNode.tsx`
3. [ ] 实现 `MenuTree.tsx`
4. [ ] 实现 `useMenuTreeSelection.ts` hook
5. [ ] 实现 `MenuToolbar.tsx`
6. [ ] 实现 `MenuVisibilityEditor.tsx`

### Phase 5: 页面集成（预计 1-2 小时）
1. [ ] 改造 `RoleDetail.tsx` 为 Tabs 布局
2. [ ] 集成 `MenuVisibilityEditor`
3. [ ] 测试完整流程

### Phase 6: 测试与优化（预计 1-2 小时）
1. [ ] 编写单元测试（级联选择逻辑）
2. [ ] 编写集成测试（API）
3. [ ] 性能优化（大量菜单场景）
4. [ ] 可访问性测试

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 迁移数据丢失 | 高 | 迁移前备份，双读验证 |
| 多角色解析性能 | 中 | 使用 bool_or 聚合，添加缓存 |
| 父子层级不一致 | 中 | 后端强制执行层级规则 |
| 前端状态复杂 | 低 | 抽取 hook，单元测试覆盖 |

---

## 6. 验收标准

- [ ] 平台管理员可以配置全局默认菜单可见性
- [ ] 租户管理员可以在租户内覆盖菜单可见性
- [ ] 用户登录后只能看到其角色允许的菜单
- [ ] 多角色用户可以看到任一角色允许的菜单
- [ ] 父菜单隐藏时子菜单也隐藏
- [ ] 现有用户的菜单可见性与迁移前一致
- [ ] 键盘可完全操作菜单配置界面
