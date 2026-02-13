# Change: Remove super-admin role

## Why

`super-admin` 是一个冗余的悬空角色：
- 在 better-auth 层与 `admin` 完全等价（映射到相同的 `adminRole`）
- 在 CASL 层没有独立权限规则（`seed-roles.ts` 中只有 owner/admin/member/viewer）
- `owner` 角色已通过 `{ manage, all }` 覆盖了超级管理员语义
- 保留它增加维护负担，可能导致权限配置混乱

## What Changes

- **后端**：从 better-auth 配置移除 `super-admin`，简化 Guard 层（`SuperAdminGuard` → `AdminGuard`），清理 `ADMIN_ROLES` 常量
- **前端**：移除 `ADMIN_ROLES` 中的 `super-admin`，清理 UI badge 映射
- **规范**：更新 `user-management` spec 中的角色描述
- **BREAKING**：已分配 `super-admin` 全局角色的用户需通过数据库迁移更新为 `admin`

## Impact

- Affected specs: `user-management`
- Affected code: `auth.ts`, Guard 链（6 文件）, tRPC router, 前端路由守卫和 UI（4 文件）
- **BREAKING**: 需要数据库迁移（`UPDATE user SET role = 'admin' WHERE role = 'super-admin'`）
