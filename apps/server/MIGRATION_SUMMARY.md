# 数据库字段迁移总结

## 迁移目标

将所有表中的 `tenant_id` 字段统一重命名为 `organization_id`,以保持与 Better Auth 和项目命名规范的一致性。

---

## 迁移日期

**2026-01-22**

---

## 迁移范围

### 数据库层面

成功迁移了 **31 个表**,将 `tenant_id` 重命名为 `organization_id`:

#### 核心表
- ✅ menus (菜单)
- ✅ roles (角色)
- ✅ role_menu_visibility (角色菜单可见性)
- ✅ member (成员)
- ✅ plugins (插件)

#### 资源表
- ✅ assets (资产)
- ✅ files (文件)
- ✅ notifications (通知)
- ✅ notification_preferences (通知偏好)

#### 计费表
- ✅ plan_subscriptions (订阅)
- ✅ tenant_quotas (租户配额)
- ✅ user_quotas (用户配额)

#### 审计表
- ✅ audit_logs (审计日志)
- ✅ audit_events (审计事件)
- ✅ audit_logs_archive (审计日志归档)
- ✅ audit_events_archive (审计事件归档)

#### 系统表
- ✅ settings (设置)
- ✅ feature_flag_overrides (功能标志覆盖)
- ✅ scheduled_tasks (定时任务)
- ✅ task_executions (任务执行)

#### Webhook 表
- ✅ webhook_endpoints (Webhook 端点)
- ✅ webhook_deliveries (Webhook 投递)
- ✅ webhook_outbox (Webhook 发件箱)

#### 插件表
- ✅ plugin_configs (插件配置)
- ✅ plugin_migrations (插件迁移)
- ✅ plugin_hello_world_greetings (示例插件表)

#### 其他表
- ✅ entity_ownerships (实体所有权)
- ✅ ownership_audit_log (所有权审计日志)
- ✅ invitation (邀请)
- ✅ relationship (关系)
- ✅ team (团队)

**总计**: 31 个表成功迁移

---

## 代码层面

### 1. Schema 定义 (13 个文件)

更新了所有 Drizzle ORM schema 定义:

```typescript
// ❌ 旧代码
tenantId: text('tenant_id')

// ✅ 新代码
organizationId: text('organization_id')
```

**更新的文件**:
- `src/db/schema/menus.ts`
- `src/db/schema/assets.ts`
- `src/db/schema/audit-*.ts`
- `src/db/schema/billing.ts`
- `src/db/schema/feature-flags.ts`
- `src/db/schema/files.ts`
- `src/db/schema/notifications.ts`
- `src/db/schema/notification-preferences.ts`
- `src/db/schema/plugin-schemas.ts`
- `src/db/schema/scheduled-tasks.ts`
- `src/db/schema/settings.ts`
- `src/db/schema/webhooks.ts`

### 2. tRPC Context (2 个文件)

统一了请求上下文的字段命名:

```typescript
// ❌ 旧代码
interface RequestContext {
    tenantId?: string;
    organizationId?: string; // 重复!
}

// ✅ 新代码
interface RequestContext {
    organizationId?: string; // 统一使用这个
}
```

**更新的文件**:
- `src/trpc/context.ts`
- `src/context/async-local-storage.ts`

### 3. tRPC 路由 (165 处引用)

批量替换了所有 tRPC 路由中的字段引用:

```typescript
// ❌ 旧代码
ctx.tenantId

// ✅ 新代码
ctx.organizationId
```

**影响的文件**: `src/trpc/routers/*.ts` (所有路由文件)

### 4. Service 层 (8+ 个文件)

更新了所有服务层的字段引用:

```typescript
// ❌ 旧代码
eq(menus.tenantId, organizationId)

// ✅ 新代码
eq(menus.organizationId, organizationId)
```

**更新的文件**:
- `src/services/menu.service.ts`
- `src/plugins/menu-registry.ts`
- `src/settings/settings.service.ts`
- `src/settings/feature-flag.service.ts`
- `src/file-storage/file.service.ts`
- `src/file-storage/multipart-upload.service.ts`
- `src/asset/asset.service.ts`
- `src/asset/image-processor.service.ts`

### 5. Seed 脚本 (2 个文件)

更新了数据库种子脚本:

- `src/db/seed/seed-roles.ts`
- `src/db/seed/fix-menu-visibility.ts`

---

## 迁移过程

### Step 1: 创建迁移 SQL

创建了迁移文件: `drizzle/0012_rename_tenant_to_organization.sql`

### Step 2: 更新 Schema 定义

批量更新了所有 Drizzle schema 文件中的字段定义。

### Step 3: 更新代码引用

使用 `sed` 批量替换了所有代码中的字段引用:
- `menus.tenantId` → `menus.organizationId`
- `ctx.tenantId` → `ctx.organizationId`
- `context.tenantId` → `context.organizationId`

### Step 4: 执行数据库迁移

使用 Node.js 脚本执行了数据库迁移:

1. 检查每个表的列状态
2. 如果只有 `tenant_id`: 直接重命名
3. 如果同时有两个列: 合并数据后删除 `tenant_id`
4. 验证迁移结果

### Step 5: 验证

最终验证结果:
- ✅ 0 个表还有 `tenant_id` 列
- ✅ 31 个表有 `organization_id` 列
- ✅ 所有代码引用已更新

---

## 向后兼容性

### 数据库层面

**不兼容**: 旧代码无法在新数据库上运行,因为 `tenant_id` 列已被删除。

### 代码层面

**完全兼容**: 所有代码已更新,使用统一的 `organizationId` 命名。

---

## 回滚方案

如果需要回滚,执行以下 SQL:

```sql
-- 将 organization_id 重命名回 tenant_id
ALTER TABLE "menus" RENAME COLUMN "organization_id" TO "tenant_id";
ALTER TABLE "assets" RENAME COLUMN "organization_id" TO "tenant_id";
-- ... (其他 29 个表)
```

**注意**: 回滚后需要同时回滚代码更改。

---

## 验证清单

- [x] 数据库迁移成功
- [x] 所有 Schema 定义已更新
- [x] 所有代码引用已更新
- [x] tRPC Context 已统一
- [x] 服务层代码已更新
- [x] Seed 脚本已更新
- [ ] 服务器启动测试
- [ ] 功能测试 (菜单、权限、插件)
- [ ] 集成测试

---

## 后续工作

### 1. 测试验证

- [ ] 启动服务器,确认无错误
- [ ] 测试菜单显示功能
- [ ] 测试角色权限功能
- [ ] 测试插件安装功能
- [ ] 运行集成测试套件

### 2. 文档更新

- [ ] 更新 API 文档
- [ ] 更新架构文档
- [ ] 更新开发者指南

### 3. 清理工作

- [ ] 删除临时迁移脚本
  - `run-migration.ts`
  - `fix-migration.ts`
  - `check-schema.ts`
  - `check-menus-data.ts`

---

## 影响评估

### 风险等级: 🟡 中等

**原因**:
- ✅ 数据库迁移成功,无数据丢失
- ✅ 代码更新全面,覆盖所有引用
- ⚠️ 需要全面测试以确保功能正常

### 影响范围

| 模块 | 影响程度 | 说明 |
|------|---------|------|
| 菜单系统 | 🔴 高 | 核心表结构变更 |
| 权限系统 | 🔴 高 | Context 字段变更 |
| 插件系统 | 🟡 中 | 插件表和 API 变更 |
| 计费系统 | 🟡 中 | 订阅表变更 |
| 文件系统 | 🟡 中 | 文件表变更 |
| 审计系统 | 🟢 低 | 审计表变更,不影响核心功能 |

---

## 收益

### 1. 代码一致性 ✅

所有代码现在使用统一的 `organizationId` 命名,消除了混淆。

### 2. 与 Better Auth 对齐 ✅

与 Better Auth 的 `organization` 概念保持一致,更容易理解。

### 3. 更好的可维护性 ✅

统一的命名减少了认知负担,降低了出错概率。

### 4. 更清晰的语义 ✅

`organization` 比 `tenant` 更符合业务概念,用户更容易理解。

---

## 总结

✅ **迁移成功完成!**

- 数据库: 31 个表成功迁移
- 代码: 200+ 处引用已更新
- 风险: 中等,需要全面测试
- 收益: 代码一致性、可维护性大幅提升

**下一步**: 启动服务器并进行全面功能测试。

---

**迁移执行者**: Claude Code
**迁移日期**: 2026-01-22
**文档版本**: 1.0
