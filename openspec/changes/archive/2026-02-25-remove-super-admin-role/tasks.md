## 1. Backend: Better-Auth 配置
- [x] 1.1 `auth.ts`: 从 `adminRoles` 和 `roles` 中移除 `super-admin`

## 2. Backend: Guard 层重构
- [x] 2.1 重命名 `super-admin.guard.ts` → `admin.guard.ts`，`SuperAdminGuard` → `AdminGuard`
- [x] 2.2 `types.ts`: 简化 `ADMIN_ROLES` 为 `['admin']`
- [x] 2.3 `guards.module.ts`: 更新导入和提供者
- [x] 2.4 `index.ts`: 更新导出
- [x] 2.5 `tenant-ban.controller.ts`: 更新 Guard 引用
- [x] 2.6 `roles.guard.ts`, `roles.decorator.ts`, `audited.decorator.ts`: 更新注释

## 3. Backend: tRPC Router
- [x] 3.1 `menu.ts`: 简化 `isPlatformAdmin` 检查

## 4. Frontend
- [x] 4.1 `auth.tsx`: 移除 `super-admin` 从 `ADMIN_ROLES`，重命名 `isSuperAdmin` → `isAdmin`，`SuperAdminRoute` → `AdminRoute`
- [x] 4.2 `AdminRoute.tsx`: 移除 `super-admin` 从 `ADMIN_ROLES`
- [x] 4.3 `Users.tsx` (platform) + `PlatformUsers.tsx`: 移除 `super-admin` badge case

## 5. 测试和脚本
- [x] 5.1 `spec-test-runner.ts`: 重命名 `super_admin` 测试账户
- [x] 5.2 `auth.spec.yaml`: 更新 `login_as` 引用
- [x] 5.3 `roles.integration.test.ts`: 更新测试用例名称和 slug
- [x] 5.4 `MultiTenantAuth.test.tsx`: 重命名内部 `isSuperAdmin`/`SuperAdminRoute` 术语

## 6. 文档
- [x] 6.1 `PLATFORM_ADMIN_REMOVAL.md`: 移除 `super-admin` 角色描述
- [x] 6.2 `user-management/spec.md`: 更新所有 `super-admin` 引用

## 7. 验证
- [x] 7.1 `grep -r "super-admin" apps/ --include="*.ts" --include="*.tsx"` 返回空
- [ ] 7.2 TypeScript 类型检查通过（预存问题，非本次修改引入）
- [ ] 7.3 OpenSpec 验证通过
