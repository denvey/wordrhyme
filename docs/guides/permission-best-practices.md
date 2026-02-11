# Permission System Best Practices

> **优雅的权限配置指南**
>
> 通过 TypeScript 类型系统实现类型安全，无需额外封装。

> **✅ 真实代码案例**：查看生产代码中的实际使用
> - [文章管理 Router](/apps/server/src/trpc/routers/articles.ts) - 基础 CRUD 示例
> - [用户管理 Router](/apps/server/src/trpc/routers/users-admin.ts) - 字段过滤示例
> - [批量操作 Router](/apps/server/src/trpc/routers/bulk-operations.ts) - 批量 ABAC 示例

---

## ✅ 推荐方式：直接使用类型约束

### 核心原则

1. ✅ **Subject/Action 在 constants.ts 中集中定义**
2. ✅ **PermissionMeta 类型自动限制可用值**
3. ✅ **Router 中直接写字符串，IDE 自动补全**
4. ✅ **编译时捕获拼写错误**

### 实际用法

```typescript
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';

// ✅ 无需额外导入，TypeScript 自动检查
export const articlesRouter = router({
  list: protectedProcedure
    .meta({ permission: { action: 'read', subject: 'Content' } })
    //                            ^^^^^^          ^^^^^^^^^
    //                            IDE 自动补全    IDE 自动补全
    .query(async ({ ctx }) => {
      const articles = await db.select().from(articlesTable);
      return articles;  // ← 字段自动过滤 ✅
    }),

  create: protectedProcedure
    .meta({ permission: { action: 'create', subject: 'Content' } })
    .mutation(async ({ input }) => {
      const [article] = await db.insert(articlesTable).values(input);
      return article;
    }),

  update: protectedProcedure
    .meta({ permission: { action: 'update', subject: 'Content' } })
    .mutation(async ({ input }) => {
      // ABAC 自动检查 ✅（只更新有权限的记录）
      const [updated] = await db
        .update(articlesTable)
        .set(input)
        .where(eq(articlesTable.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return updated;
    }),

  delete: protectedProcedure
    .meta({ permission: { action: 'delete', subject: 'Content' } })
    .mutation(async ({ input }) => {
      // ABAC 自动检查 ✅
      const result = await db
        .delete(articlesTable)
        .where(eq(articlesTable.id, input.id));

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return { success: true };
    }),
});
```

---

## 🎯 TypeScript 智能提示

### IDE 自动补全

当你输入 `.meta({ permission: { action: '` 时：

```
'manage' | 'create' | 'read' | 'update' | 'delete' | 'test'
```

当你输入 `subject: '` 时：

```
'All' | 'User' | 'Organization' | 'Team' | 'Content' |
'Menu' | 'Plugin' | 'Role' | 'Permission' | 'AuditLog' |
'Settings' | 'FeatureFlag' | 'Webhook'
```

### 编译时错误

```typescript
// ❌ TypeScript 错误：'updat' is not assignable to type AppAction
.meta({ permission: { action: 'updat', subject: 'Content' } })

// ❌ TypeScript 错误：'Article' is not assignable to type AppSubject
.meta({ permission: { action: 'update', subject: 'Article' } })

// ✅ 正确
.meta({ permission: { action: 'update', subject: 'Content' } })
```

---

## 📝 如何添加新 Subject

### Step 1: 更新 constants.ts

```typescript
// apps/server/src/permission/constants.ts

export const APP_SUBJECTS = [
    'All',
    'User',
    'Organization',
    // ... 现有 subjects
    'Article',  // ← 添加新 subject
] as const;

export const SUBJECT_DISPLAY_NAMES: Record<string, string> = {
    // ...
    Article: '文章',  // ← 添加显示名称
};

export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
    // ...
    Article: '文章内容管理',  // ← 添加描述（Tooltip）
};
```

### Step 2: 立即可用！

```typescript
// 无需修改任何其他代码，TypeScript 自动识别
.meta({ permission: { action: 'create', subject: 'Article' } })
//                                                ^^^^^^^^^
//                                                IDE 自动补全 ✅
```

---

## 🏗️ 三层权限架构

### Layer 1: 定义（constants.ts）

```typescript
// 集中管理所有可用的 subjects 和 actions
export const APP_SUBJECTS = ['All', 'User', 'Content', ...] as const;
export const APP_ACTIONS = ['manage', 'create', 'read', ...] as const;

// 导出类型供 TypeScript 使用
export type AppSubject = (typeof APP_SUBJECTS)[number];
export type AppAction = (typeof APP_ACTIONS)[number];
```

### Layer 2: 声明（Router）

```typescript
// Router 声明：这个 endpoint 需要什么权限
.meta({ permission: { action: 'update', subject: 'Content' } })
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                    TypeScript 类型限制 ✅
```

### Layer 3: 配置（Database）

```typescript
// 数据库配置：具体角色拥有哪些权限
await db.insert(rolePermissions).values([
  // Admin 可以管理所有资源
  { roleId: 'admin', action: 'manage', subject: 'All' },

  // Editor 可以创建和编辑内容
  { roleId: 'editor', action: 'create', subject: 'Content' },
  { roleId: 'editor', action: 'update', subject: 'Content',
    conditions: { ownerId: "${user.id}" } },  // ← 只能编辑自己的

  // Viewer 只能读取
  { roleId: 'viewer', action: 'read', subject: 'Content' },
]);
```

**关键区别**：
- ✅ Router 层：声明"需要什么权限"（开发时决定）
- ✅ Database 层：配置"谁有什么权限"（运行时配置）

---

## ❌ 常见误区

### 误区 1：在 Router 中配置具体用户的权限

```typescript
// ❌ 错误：这不是在 Router 层做的事
.meta({ permission: { action: 'manage', subject: 'All' } })
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                    这会要求所有调用者都必须是超级管理员

// ✅ 正确：Router 只声明最低权限
.meta({ permission: { action: 'update', subject: 'Content' } })
//     具体某个用户是否能更新，由数据库中的 ABAC 规则决定
```

### 误区 2：尝试组合多个权限

```typescript
// ❌ 错误：一个 endpoint 只需要一个权限声明
.meta({
  permission: [
    { action: 'manage', subject: 'All' },
    { action: 'create', subject: 'Content' }
  ]
})

// ✅ 正确：声明最低所需权限即可
.meta({ permission: { action: 'create', subject: 'Content' } })
//     如果用户有 manage:All 权限，自动满足此要求 ✅
```

### 误区 3：混淆 Subject 和表名

```typescript
// ❌ 错误：Subject 是业务概念，不是数据库表名
.meta({ permission: { action: 'read', subject: 'articles_table' } })

// ✅ 正确：使用语义化的 Subject 名称
.meta({ permission: { action: 'read', subject: 'Content' } })
//     'Content' 可能映射到多个表：articles, posts, pages, etc.
```

---

## 🔒 权限继承

### Action 继承

```
manage (完全管理)
  ├─ create
  ├─ read
  ├─ update
  └─ delete
```

**示例**：
- Router 声明：`{ action: 'update', subject: 'Content' }`
- 用户权限：`{ action: 'manage', subject: 'Content' }` ← 满足要求 ✅
- 用户权限：`{ action: 'read', subject: 'Content' }` ← 不满足 ❌

### Subject 通配符

```
All (所有资源)
  ├─ User
  ├─ Content
  ├─ Organization
  └─ ...
```

**示例**：
- Router 声明：`{ action: 'delete', subject: 'User' }`
- 用户权限：`{ action: 'manage', subject: 'All' }` ← 满足要求 ✅
- 用户权限：`{ action: 'delete', subject: 'Content' }` ← 不满足 ❌

---

## 🎨 命名规范

### Subject 命名

```typescript
// ✅ 推荐：PascalCase 单数形式
'User'          // 不是 'Users' 或 'user'
'Article'       // 不是 'Articles'
'Organization'  // 不是 'Org'

// ✅ 推荐：业务概念，不是技术细节
'Content'       // 不是 'ArticlesTable'
'Permission'    // 不是 'RolePermissions'

// ✅ 推荐：插件 Subject 使用前缀
'plugin:notification'  // 插件注册的资源
```

### Action 命名

```typescript
// ✅ 推荐：小写单词
'create'   // 不是 'Create' 或 'CREATE'
'read'
'update'
'delete'
'manage'

// ✅ 特殊 action 保持语义化
'test'      // Webhook 测试
```

---

## 📊 完整示例：用户管理

```typescript
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const usersRouter = router({
  // 查看用户列表（需要 read:User 权限）
  list: protectedProcedure
    .meta({ permission: { action: 'read', subject: 'User' } })
    .query(async ({ ctx }) => {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.organizationId, ctx.organizationId!));

      // 字段自动过滤 ✅
      // 例如：普通用户可能看不到 'email', 'password' 字段
      return result;
    }),

  // 创建用户（需要 create:User 权限）
  create: protectedProcedure
    .meta({ permission: { action: 'create', subject: 'User' } })
    .mutation(async ({ input }) => {
      const [user] = await db.insert(users).values(input).returning();
      return user;
    }),

  // 更新用户（需要 update:User 权限）
  update: protectedProcedure
    .meta({ permission: { action: 'update', subject: 'User' } })
    .mutation(async ({ input }) => {
      // ABAC 检查 ✅
      // 例如：普通用户只能更新自己（conditions: { id: "${user.id}" }）
      //       管理员可以更新所有用户
      const [updated] = await db
        .update(users)
        .set(input)
        .where(eq(users.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found or permission denied'
        });
      }

      return updated;
    }),

  // 删除用户（需要 delete:User 权限）
  delete: protectedProcedure
    .meta({ permission: { action: 'delete', subject: 'User' } })
    .mutation(async ({ input }) => {
      const result = await db
        .delete(users)
        .where(eq(users.id, input.id));

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return { success: true };
    }),
});
```

---

## 🚀 迁移清单

从手动权限检查迁移到声明式权限：

- [ ] 识别包含 `permissionKernel.require()` 的 procedures
- [ ] 添加 `.meta({ permission: { action, subject } })`
- [ ] 删除手动 RBAC 检查代码
- [ ] 删除双查询模式（SELECT + UPDATE/DELETE）
- [ ] 删除手动字段过滤代码
- [ ] 测试权限仍然正常工作
- [ ] 验证 TypeScript 类型检查正常

---

## 📖 相关文档

- **迁移指南**: `/docs/migration/db-permission-automation.md`
- **权限系统架构**: `/docs/PERMISSION_SYSTEM.md`
- **常量定义**: `/apps/server/src/permission/constants.ts`
- **类型定义**: `/apps/server/src/trpc/trpc.ts` (PermissionMeta)

---

**版本**: v2.0 (简化版)
**最后更新**: 2025-01-30
**原则**: Keep It Simple & Type-Safe
