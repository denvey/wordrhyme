# Scripts Directory

本目录包含所有数据库和系统管理脚本，按功能分类组织。

## 目录结构

```
scripts/
├── dev/          # 开发环境工具
├── seed/         # 数据初始化脚本
├── setup/        # 系统配置脚本
└── migrate/      # 数据迁移脚本
```

## 📁 dev/ - 开发环境工具

开发环境专用的工具脚本。

### reset-dev-database.ts
重置开发环境数据库（删除所有数据）。

```bash
# 方式 1: 使用 npm script（推荐）
pnpm --filter @wordrhyme/server script:reset-dev

# 方式 2: 直接运行
pnpm tsx apps/server/scripts/dev/reset-dev-database.ts
```

⚠️ **警告**：此脚本会删除所有数据！仅用于开发环境！

**功能**：
- 清空所有表数据
- 保留表结构
- 安全检查（防止在生产环境运行）

---

## 📁 seed/ - 数据初始化脚本

用于初始化系统数据的脚本。

### seed-initial-data.ts
初始化系统基础数据。

```bash
# 方式 1: 使用 npm script（推荐）
pnpm --filter @wordrhyme/server script:seed-initial

# 方式 2: 直接运行
pnpm tsx apps/server/scripts/seed/seed-initial-data.ts
```

**功能**：
- 创建 Platform 组织
- 使用 Better Auth API 创建系统管理员用户（确保密码哈希正确）
- 自动设置管理员角色为 admin
- 将管理员添加到 Platform 组织
- 配置 Platform 组织的角色（owner, admin, member）
- 配置完整的权限规则

**环境变量**（可选）：
```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin123456!
ADMIN_NAME=System Administrator
```

---

## 📁 setup/ - 系统配置脚本

用于配置系统功能的脚本。

### setup-global-admin.ts
配置全局管理员权限。

```bash
pnpm tsx apps/server/scripts/setup/setup-global-admin.ts
```

**功能**：
- 在 Platform 组织中创建 admin 角色
- 配置 `manage all` 超级权限

### setup-cross-tenant-permissions.ts
配置跨租户权限。

```bash
# 方式 1: 使用 npm script（推荐）
pnpm --filter @wordrhyme/server script:setup-cross-tenant

# 方式 2: 直接运行
pnpm tsx apps/server/scripts/setup/setup-cross-tenant-permissions.ts
```

**功能**：
- 配置 `cross-tenant` 跨租户能力权限
- 配置资源访问权限（User, Organization, Order, Product, etc.）
- 使用权限组合模式

### setup-global-roles-example.ts
配置多种全局角色的示例。

```bash
pnpm tsx apps/server/scripts/setup/setup-global-roles-example.ts
```

**功能**：
- 创建 `order-viewer` 角色（只能查看订单）
- 创建 `auditor` 角色（只能查看审计日志）

### verify-global-admin.ts
验证全局管理员配置。

```bash
pnpm tsx apps/server/scripts/setup/verify-global-admin.ts
```

**功能**：
- 检查 Platform 组织的 admin 角色是否存在
- 检查权限规则是否正确配置

---

## 📁 migrate/ - 数据迁移脚本

用于数据迁移和升级的脚本。

### migrate-platform-admin-to-admin.ts
将 `platform-admin` 角色迁移为 `admin`。

```bash
pnpm tsx apps/server/scripts/migrate/migrate-platform-admin-to-admin.ts
```

**功能**：
- 查找所有 `user.role = 'platform-admin'` 的用户
- 将其更新为 `user.role = 'admin'`
- 显示受影响的用户列表

---

## 使用场景

### 场景 1：首次初始化开发环境

```bash
# 1. 运行数据库迁移
cd apps/server && pnpm drizzle-kit push && cd ../..

# 2. 初始化系统数据
pnpm --filter @wordrhyme/server script:seed-initial

# 3. 启动应用
pnpm dev
```

### 场景 2：重置开发环境

```bash
# 1. 重置数据库
pnpm --filter @wordrhyme/server script:reset-dev

# 2. 重新初始化
pnpm --filter @wordrhyme/server script:seed-initial
```

### 场景 3：配置额外的全局角色

```bash
# 配置示例角色（order-viewer, auditor）
pnpm tsx apps/server/scripts/setup/setup-global-roles-example.ts
```

### 场景 4：从旧版本迁移

```bash
# 迁移 platform-admin 角色
pnpm tsx apps/server/scripts/migrate/migrate-platform-admin-to-admin.ts
```

---

## 注意事项

### ⚠️ 开发环境 vs 生产环境

- `dev/` 目录下的脚本**仅用于开发环境**
- 生产环境请使用 `seed/` 和 `setup/` 目录下的脚本
- 所有脚本都有安全检查，防止误操作

### 📝 脚本执行顺序

1. **首次安装**：`seed/seed-initial-data.ts`
2. **配置权限**：`setup/setup-cross-tenant-permissions.ts`
3. **验证配置**：`setup/verify-global-admin.ts`

### 🔒 安全建议

- 生产环境使用强密码（通过环境变量配置）
- 定期备份数据库
- 迁移脚本运行前先备份

---

## 相关文档

- [开发环境初始化指南](../../../DEV_SETUP_GUIDE.md)
- [权限系统文档](../../../docs/PERMISSION_SYSTEM.md)
- [跨租户权限文档](../../../docs/CROSS_TENANT_PERMISSIONS.md)

---

**最后更新**: 2026-01-16
