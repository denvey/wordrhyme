# 开发环境初始化指南

## 概述

本指南帮助你在开发环境中从零开始初始化系统。

## 前提条件

- PostgreSQL 数据库已安装并运行
- `.env` 文件已配置 `DATABASE_URL`
- Node.js 和 pnpm 已安装

## 初始化步骤

### 1. 运行数据库迁移

首先确保数据库 schema 是最新的：

```bash
cd apps/server
pnpm drizzle-kit push
```

### 2. 重置数据库（可选）

如果你想清空所有现有数据：

```bash
pnpm --filter @wordrhyme/server script:reset-dev
```

⚠️ **警告**：此操作会删除所有数据！

### 3. 初始化系统数据

运行 seed 脚本创建初始数据：

```bash
pnpm --filter @wordrhyme/server script:seed-initial
```

这个脚本会：
- ✅ 创建 Platform 组织
- ✅ 使用 Better Auth API 创建系统管理员用户
- ✅ 自动设置管理员角色
- ✅ 配置 Platform 组织的角色（owner, admin, member）
- ✅ 配置跨租户权限

### 4. 自定义管理员账号（可选）

你可以通过环境变量自定义管理员账号：

```bash
# 在 .env 文件中添加
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_NAME=Your Name
```

然后重新运行 seed 脚本。

### 5. 启动应用

```bash
# 在项目根目录
pnpm dev
```

### 6. 登录系统

使用管理员账号登录：

- **邮箱**：`admin@example.com`（或你自定义的邮箱）
- **密码**：`Admin123456!`（或你自定义的密码）

### 7. 切换到 Platform 组织

登录后，点击左上角的组织切换器，选择 "Platform" 组织。

在 Platform 组织中，你将拥有跨租户权限，可以：
- 查看所有组织的数据
- 管理所有用户
- 配置全局设置

## 自动功能

### 用户注册时自动创建个人组织

当新用户注册时，系统会自动：
1. 创建一个以用户名命名的个人组织
2. 将用户设置为该组织的 owner
3. 自动切换到该组织

这个功能在 `apps/server/src/auth/auth.ts` 的 `databaseHooks.user.create.after` 中实现。

### 登录时自动选择组织

当用户登录时，系统会自动：
1. 查找用户的第一个组织
2. 将其设置为活动组织
3. 用户可以随时切换到其他组织

这个功能在 `apps/server/src/auth/auth.ts` 的 `databaseHooks.session.create.before` 中实现。

## 数据结构

### Platform 组织

```
Platform 组织 (id: 'platform')
├─ owner 角色
│  ├─ manage:cross-tenant (跨租户能力)
│  ├─ read/create/update/delete:User
│  ├─ read/create/update/delete:Organization
│  ├─ read/create/update/delete:Role
│  ├─ read/create/update/delete:Permission
│  ├─ read:AuditLog
│  ├─ manage:Plugin
│  └─ manage:Menu
├─ admin 角色（与 owner 相同权限）
└─ member 角色（只读权限）
```

### 用户角色

```
系统管理员
├─ user.role = 'admin' (全局角色)
└─ Platform 组织 member.role = 'owner' (组织角色)

普通用户
├─ user.role = null (无全局角色)
└─ 个人组织 member.role = 'owner' (组织角色)
```

## 权限工作原理

### 跨租户权限

当用户满足以下条件时，可以跨租户访问数据：

1. ✅ 在 Platform 组织中
2. ✅ 拥有 `manage:cross-tenant` 权限
3. ✅ 拥有资源权限（如 `read:User`）

**示例**：

```typescript
// 用户在 Platform 组织
ctx.tenantId === 'platform'

// 用户有跨租户能力
ability.can('manage', 'cross-tenant')

// 用户有资源权限
ability.can('read', 'User')

// 结果：可以跨租户查看所有用户
```

### 普通组织权限

当用户在普通组织中时：

1. ✅ 只能访问当前组织的数据
2. ❌ 无法跨租户访问
3. ✅ 权限由组织角色决定

## 常见问题

### Q1: 如何添加新的全局管理员？

```bash
# 方法 1：使用 seed 脚本
pnpm tsx apps/server/src/db/seed/set-platform-admin.ts new-admin@example.com

# 方法 2：直接更新数据库
UPDATE "user" SET role = 'admin' WHERE email = 'new-admin@example.com';

# 然后将用户添加到 Platform 组织
INSERT INTO member (id, "userId", "organizationId", role)
VALUES (gen_random_uuid(), 'user-id', 'platform', 'owner');
```

### Q2: 如何重置管理员密码？

```bash
# 使用 Better Auth admin API
# 或直接在数据库中更新 account 表的 password 字段
```

### Q3: 如何添加新的资源权限？

编辑 `apps/server/seed-initial-data.ts`，在 `adminPermissions` 数组中添加：

```typescript
{ action: 'read', subject: 'NewResource' },
{ action: 'create', subject: 'NewResource' },
```

然后重新运行 seed 脚本。

### Q4: 如何禁用自动创建个人组织？

编辑 `apps/server/src/auth/auth.ts`，注释掉 `databaseHooks.user.create.after` 部分。

## 相关文件

- `apps/server/reset-dev-database.ts` - 数据库重置脚本
- `apps/server/seed-initial-data.ts` - 初始化数据脚本
- `apps/server/src/auth/auth.ts` - Better Auth 配置
- `docs/PERMISSION_SYSTEM.md` - 权限系统文档
- `docs/CROSS_TENANT_PERMISSIONS.md` - 跨租户权限文档

## 下一步

- 📖 阅读 [权限系统文档](./PERMISSION_SYSTEM.md)
- 📖 阅读 [跨租户权限文档](./CROSS_TENANT_PERMISSIONS.md)
- 🔧 配置跨租户权限：`tsx apps/server/setup-cross-tenant-permissions.ts`
- 🧪 运行测试：`pnpm test`

---

**最后更新**: 2026-01-16
