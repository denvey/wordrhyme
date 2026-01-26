# 菜单权限矩阵

本文档定义了不同角色对管理后台菜单的可见性配置。

## 角色定义

| 角色 | Slug | 说明 |
|------|------|------|
| 平台管理员 | `admin` | 系统级管理员，可管理所有租户和平台配置 |
| 组织所有者 | `owner` | 组织创建者，拥有组织内最高权限 |
| 组织管理员 | `admin` | 组织管理员，可管理组织内大部分功能 |
| 普通成员 | `member` | 普通用户，只能访问基本功能 |

## 菜单可见性矩阵

### 平台级菜单（仅平台管理员可见）

| 菜单 | 路径 | admin | owner | admin | member |
|------|------|:--------------:|:-----:|:-----:|:------:|
| Platform Users | /platform/users | ✅ | ❌ | ❌ | ❌ |
| System Settings | /platform/settings | ✅ | ❌ | ❌ | ❌ |
| Feature Flags | /platform/feature-flags | ✅ | ❌ | ❌ | ❌ |
| Cache Management | /platform/cache | ✅ | ❌ | ❌ | ❌ |
| Plugin Health | /platform/plugin-health | ✅ | ❌ | ❌ | ❌ |

### 组织级菜单（owner/admin 可见）

| 菜单 | 路径 | admin | owner | admin | member |
|------|------|:--------------:|:-----:|:-----:|:------:|
| Dashboard | / | ✅ | ✅ | ✅ | ✅ |
| Plugins | /plugins | ✅ | ✅ | ✅ | ❌ |
| Members | /members | ✅ | ✅ | ✅ | ❌ |
| Roles | /roles | ✅ | ✅ | ✅ | ❌ |
| Files | /files | ✅ | ✅ | ✅ | ❌ |
| Assets | /assets | ✅ | ✅ | ✅ | ❌ |
| Invitations | /invitations | ✅ | ✅ | ✅ | ✅ |
| Audit Logs | /audit | ✅ | ✅ | ✅ | ❌ |
| Hooks | /hooks | ✅ | ✅ | ✅ | ❌ |
| Notifications | /notifications | ✅ | ✅ | ✅ | ✅ |
| Notification Templates | /notification-templates | ✅ | ✅ | ✅ | ❌ |
| Notification Test | /notification-test | ✅ | ✅ | ✅ | ❌ |
| Webhooks | /webhooks | ✅ | ✅ | ✅ | ❌ |
| API Tokens | /api-tokens | ✅ | ✅ | ✅ | ❌ |
| Settings | /settings | ✅ | ✅ | ✅ | ❌ |

### 基础菜单（所有用户可见）

| 菜单 | 路径 | admin | owner | admin | member |
|------|------|:--------------:|:-----:|:-----:|:------:|
| Dashboard | / | ✅ | ✅ | ✅ | ✅ |
| Notifications | /notifications | ✅ | ✅ | ✅ | ✅ |
| Invitations | /invitations | ✅ | ✅ | ✅ | ✅ |

## 当前问题

### admin@example.com 显示平台菜单

**原因**：admin@example.com 的角色是 `owner`（组织所有者），当前 owner 角色被错误配置为可以看到所有菜单（包括平台菜单）。

**解决方案**：
1. 修改 `sync-menus-visibility.ts`，让 owner 角色不能看到平台菜单
2. 或者将 admin@example.com 的角色改为 `admin`

## 配置文件

菜单可见性配置在以下文件中：
- `apps/server/src/db/seed/sync-menus-visibility.ts` - 同步菜单和可见性配置
- `apps/server/src/db/schema/role-menu-visibility.ts` - 可见性表定义

## 数据库表

### role_menu_visibility

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| role_id | text | 角色 ID |
| menu_id | text | 菜单 ID |
| organization_id | text | 组织 ID（null 表示全局配置） |
| visible | boolean | 是否可见 |

### 可见性解析规则

1. **租户覆盖优先**：如果存在 `organization_id` 匹配的记录，使用该记录
2. **全局默认**：如果没有租户覆盖，使用 `organization_id = null` 的全局记录
3. **默认隐藏**：如果没有任何记录，菜单默认隐藏
4. **多角色合并**：如果用户有多个角色，任一角色可见则菜单可见


测试账号

账号信息
  ┌────────────┬───────────────────────┬────────────┬────────────────┐
  │    角色    │         邮箱          │    密码    │    可见菜单    │
  ├────────────┼───────────────────────┼────────────┼────────────────┤
  │ 平台管理员 │ admin@wordrhyme.test  │ admin123456 │ 全部 22 个菜单 │
  ├────────────┼───────────────────────┼────────────┼────────────────┤
  │ 租户所有者 │ owner@wordrhyme.test  │ Test123456 │ 17 个组织菜单  │
  ├────────────┼───────────────────────┼────────────┼────────────────┤
  │ 租户成员   │ member@wordrhyme.test │ Test123456 │ 3 个基础菜单   │
  └────────────┴───────────────────────┴────────────┴────────────────┘
