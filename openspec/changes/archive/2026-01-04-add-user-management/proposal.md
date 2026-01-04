# Change: Add User Management Feature

## Why

当前系统已集成 better-auth 的 organization 插件用于多租户身份验证，但缺少完整的用户管理能力。管理员无法通过 Admin UI 创建用户、管理用户角色、禁用账户、管理会话或进行用户模拟（用于客户支持）。这是企业级 CMS 的核心功能需求。

## What Changes

### 两层架构设计

本功能采用两层架构，分别利用 better-auth 的两个插件：

| Layer | Plugin | 范围 | 用途 |
|-------|--------|------|------|
| **Layer 1** | `organization` | 租户内 | 成员管理（列表、邀请、移除、改角色） |
| **Layer 2** | `admin` | 全局（需校验） | 超级管理操作（ban、模拟、删除、会话管理） |

### Server (NestJS + better-auth)
- 集成 better-auth `admin` 插件
- 添加用户管理相关数据库字段（role, banned, banReason, banExpires）
- 添加 session 表的 impersonatedBy 字段支持用户模拟
- **创建 TenantGuard 中间件**，确保 `admin.*` API 只能操作当前租户内的用户

### Admin Client (React)
- 添加 `adminClient` 插件到 auth client
- 验证 `organizationClient` 插件已配置
- 导出新的 admin 和 organization API hooks

### Admin UI
- **Layer 1 功能**（组织管理员可用）：
  - 成员列表页面（使用 `organization.listMembers()`）
  - 邀请成员功能
  - 移除成员功能
  - 更改成员角色功能
- **Layer 2 功能**（仅超级管理员可用）：
  - 禁用/解禁用户
  - 用户模拟（客户支持场景）
  - 会话管理
  - 全局角色设置
  - 密码重置
  - 删除用户

### Permission Integration
- 区分「组织角色」（per tenant）和「全局角色」（admin plugin）
- Layer 2 操作需要全局 admin 角色
- 所有 `admin.*` 操作受 TenantGuard 保护，拒绝跨租户操作

## Impact

- **Affected specs**:
  - `permission-kernel` (MODIFIED - 添加 admin 角色)
  - `admin-ui-host` (MODIFIED - 添加成员管理页面)
- **New specs**:
  - `user-management` (ADDED - 两层用户管理能力)
- **Affected code**:
  - `apps/server/src/auth/auth.ts` - 添加 admin 插件
  - `apps/admin/src/lib/auth-client.ts` - 添加 adminClient
  - `apps/admin/src/pages/` - 新增成员管理页面
  - Database schema - 添加 admin 插件所需字段
  - NestJS guards - 新增 TenantGuard 中间件

## Breaking Changes

无破坏性变更。这是纯增量功能添加。

## Dependencies

- better-auth admin plugin: `admin()` from `better-auth/plugins`
- better-auth organization plugin: `organization()` from `better-auth/plugins`（已集成）
- 现有 better-auth 和 organization 插件配置

## Key Design Decisions

1. **两层插件架构**：Layer 1 使用 organization 插件（原生租户隔离），Layer 2 使用 admin 插件（需要 TenantGuard）
2. **角色分层**：全局角色（super-admin/admin/user）与组织角色（owner/admin/member）分离
3. **租户隔离**：所有 admin.* API 必须通过 TenantGuard 校验目标用户是否属于当前租户
4. **UI 统一入口**：Members 页面作为统一入口，按权限显示不同功能
