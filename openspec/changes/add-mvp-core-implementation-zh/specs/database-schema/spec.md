# 数据库模式规范 (Database Schema Specification)

## 新增要求

### 要求：核心表 (Core Tables)

数据库模式应包含核心表：`tenants`, `workspaces`, `users`, `plugins`, `permissions`, `role_permissions`, `user_roles`。所有表必须通过 Drizzle ORM 迁移创建。

#### 场景：迁移后表已存在
- **当** 数据库迁移运行时
- **那么** 创建所有核心表
- **并且** 应用索引 (例如 tenant_id, user_id)
- **并且** 执行外键约束

---

### 要求：插件元数据存储 (Plugin Metadata Storage)

`plugins` 表应存储插件元数据：`id`, `plugin_id`, `version`, `status`, `manifest` (JSONB), `installed_at` (安装时间), `updated_at` (更新时间)。

#### 场景：存储插件元数据
- **当** 安装插件时
- **那么** 向 `plugins` 表插入一行
- **并且** `manifest` 列将完整的 `manifest.json` 存储为 JSONB
- **并且** `status` 设置为 `enabled`

---

### 要求：多租户模式 (Multi-Tenant Schema)

所有租户限定的表应包含一个 `tenant_id` 列。到 `tenants` 表的外键应执行参照完整性。

#### 场景：执行租户隔离
- **当** 查询 `users` 表时
- **那么** 按 `tenant_id` 过滤行
- **并且** 跨租户数据不可访问

---

### 要求：权限模式 (Permission Schema)

`permissions` 表应存储能力定义：`id`, `capability` (例如 `content:read`), `description` (描述)。`role_permissions` 表应将角色映射到能力。`user_roles` 表应将用户映射到角色 (租户限定)。

#### 场景：权限层级
- **当** 用户 A 在租户 T1 中具有“editor”角色时
- **并且** “editor”角色具有 `content:create` 能力时
- **那么** 用户 A 可以在租户 T1 中执行 `content:create`
- **并且** 用户 A 无法执行 `content:delete` (不在角色中)
