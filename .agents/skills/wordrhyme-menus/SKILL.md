---
description: WordRhyme菜单系统可见性及路由机制规范
---

## 菜单系统规则 (Critical)

### 平台菜单 vs 全局菜单

- **平台菜单**（`systemReserved: true`）：`organizationId = 'platform'`，仅平台组织可见
- **全局菜单**（`systemReserved: false`）：`organizationId = null`，所有组织可见
- **绝对禁止**：将平台菜单设为 `organizationId: null`，这会导致所有租户都能看到平台管理功能

### 菜单可见性机制

菜单过滤依赖 `MenuService.getTree()` 的查询范围，不依赖特殊权限：
1. 查 `organizationId IS NULL`（全局模板）
2. 查 `organizationId = currentOrgId`（当前组织菜单）
3. 合并后按 `requiredPermission` 做权限过滤

平台菜单因为绑定了 `organizationId = 'platform'`，只有用户切换到 platform 组织时才会被 Step 2 查到。

### 相关文件

- 菜单数据源：`apps/server/src/permission/resource-definitions.ts`（`RESOURCE_DEFINITIONS`）
- 菜单 seed：`apps/server/src/db/seeds/menus.seed.ts`（`generateCoreMenus()`）
- 菜单查询：`apps/server/src/services/menu.service.ts`（`getTree()`）
- 权限过滤：`apps/server/src/trpc/routers/menu.ts`（`filterMenusByPermission()`）
- 平台组织 ID：`'platform'`（定义在 `seed-accounts.ts` 的 `PLATFORM_ORG_ID`）

### 命名规范

- 平台级页面放在 `pages/platform/` 目录，文件名不加 `Platform` 前缀
  - 正确：`pages/platform/StorageSettings.tsx`
  - 错误：`pages/PlatformStorageSettings.tsx`
