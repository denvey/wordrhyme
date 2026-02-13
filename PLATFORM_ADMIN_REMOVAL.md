# platform-admin 移除总结

## 完成时间
2026-01-16

## 背景
`platform-admin` 是一个冗余的角色名称，与 Better Auth 的标准 `admin` 角色重复。为了简化系统并保持一致性，我们决定移除 `platform-admin`，统一使用 `admin` 作为全局管理员角色。

## 修改内容

### 1. 代码文件修改

#### 文档
- ✅ `docs/PERMISSION_SYSTEM.md` - 移除 `platform-admin` 示例
- ✅ `docs/CORE_SETTINGS_GUIDE.md` - 更新权限说明
- ✅ `docs/MENU_PERMISSION_MATRIX.md` - 批量替换

#### 后端代码
- ✅ `apps/server/src/db/schema/roles.ts` - 更新注释
- ✅ `apps/server/src/db/seed/set-platform-admin.ts` - 改为设置 `admin` 角色
- ✅ `apps/server/src/db/seed/*.ts` - 批量替换所有 seed 脚本
- ✅ `apps/server/src/auth/*.ts` - 批量替换认证相关文件
- ✅ `apps/server/src/trpc/routers/*.ts` - 批量替换路由文件

#### 前端代码
- ✅ `apps/admin/src/components/AdminRoute.tsx` - 移除重复的 `admin` 并更新注释
- ✅ `apps/admin/src/lib/auth.tsx` - 批量替换
- ✅ `apps/admin/src/hooks/useMenus.ts` - 批量替换
- ✅ `apps/admin/src/pages/*.tsx` - 批量替换所有页面组件

### 2. 数据库迁移脚本

创建了迁移脚本：`apps/server/migrate-platform-admin-to-admin.ts`

**功能**：
- 查找所有 `user.role = 'platform-admin'` 的用户
- 将其更新为 `user.role = 'admin'`
- 显示受影响的用户列表

**运行方法**：
```bash
tsx apps/server/migrate-platform-admin-to-admin.ts
```

## 新的角色设计

### 全局角色（user.role）
- `admin` - 全局管理员（原 `platform-admin`）
- `auditor` - 全局审计员
- `order-viewer` - 全局订单查看员
- 等等...

### 组织角色（member.role）
- `owner` - 组织所有者
- `admin` - 组织管理员
- `member` - 普通成员
- `viewer` - 只读成员

### Platform 组织
Platform 组织使用**标准的组织角色**（owner, admin），不再使用特殊的 `platform-admin`。

## 权限配置示例

### 全局管理员配置

```sql
-- 1. 设置用户的全局角色
UPDATE "user"
SET role = 'admin'
WHERE email = 'superadmin@example.com';

-- 2. 添加到 Platform 组织（使用标准角色）
INSERT INTO member (userId, organizationId, role)
VALUES ('user-id', 'platform', 'owner');

-- 3. Platform 组织的 admin 角色配置跨租户权限
INSERT INTO role_permissions (roleId, action, subject)
VALUES
    (platform-admin-role-id, 'manage', 'cross-tenant'),
    (platform-admin-role-id, 'read', 'User'),
    (platform-admin-role-id, 'read', 'Order');
```

## 迁移步骤

### 对于现有系统

1. **备份数据库**
   ```bash
   pg_dump your_database > backup.sql
   ```

2. **运行迁移脚本**
   ```bash
   tsx apps/server/migrate-platform-admin-to-admin.ts
   ```

3. **通知用户重新登录**
   - 所有受影响的用户需要重新登录
   - 角色权限会自动更新

4. **验证**
   - 检查用户是否能正常访问管理功能
   - 检查跨租户权限是否正常工作

### 对于新系统

直接使用 `admin` 角色，无需迁移。

## 优势

✅ **一致性**：所有组织使用相同的角色名称
✅ **简单性**：不需要特殊处理 Platform 组织
✅ **标准化**：符合 Better Auth 和 RBAC 最佳实践
✅ **可维护性**：减少特殊情况，降低维护成本

## 注意事项

⚠️ **重要**：
- 所有 `platform-admin` 引用已从代码中移除
- 数据库中的 `platform-admin` 角色需要手动迁移
- 用户需要重新登录才能看到角色变更

## 相关文档

- `docs/PERMISSION_SYSTEM.md` - 权限系统设计文档
- `docs/CROSS_TENANT_PERMISSIONS.md` - 跨租户权限设计文档
- `apps/server/setup-global-admin.ts` - 全局管理员配置脚本
- `apps/server/setup-cross-tenant-permissions.ts` - 跨租户权限配置脚本

## 验证清单

- [x] 代码中所有 `platform-admin` 引用已移除
- [x] 文档已更新
- [x] 创建了数据库迁移脚本
- [ ] 运行迁移脚本（需要在实际数据库上执行）
- [ ] 通知用户重新登录
- [ ] 验证权限功能正常

---

**完成状态**: 代码修改完成，等待数据库迁移
**最后更新**: 2026-01-16
