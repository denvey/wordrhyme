## Context

系统中存在两种等价的全局管理员角色 `admin` 和 `super-admin`，但 `super-admin` 在 CASL 层无独立权限定义。

| 层 | 修改前 | 修改后 |
|---|---|---|
| better-auth `adminRoles` | `['admin', 'super-admin']` | `['admin']` |
| better-auth `roles` | `admin` + `super-admin` | `admin` only |
| NestJS Guard `ADMIN_ROLES` | `['admin', 'super-admin', 'admin']` | `['admin']` |
| Guard 类名 | `SuperAdminGuard` | `AdminGuard` |
| 前端 `ADMIN_ROLES` | `['admin', 'super-admin']` | `['admin']` |

## Decisions

- **Guard 重命名**：`SuperAdminGuard` → `AdminGuard`，因为它检查的就是 `admin` 角色
- **保留 `PLATFORM_ADMIN_ROLE = 'admin'`**：这是正确的，不需要修改
- **数据库迁移**：复用现有的 `migrate-platform-admin-to-admin.ts` 脚本模式

## Risks

- 如果有外部系统依赖 `super-admin` 角色名 → 需要同步更新
  - 缓解：项目当前为内部系统，无外部依赖
