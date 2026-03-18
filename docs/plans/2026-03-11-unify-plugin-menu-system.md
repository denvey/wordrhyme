# 统一插件菜单系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复插件菜单的 AI 实现偏差，统一到数据库驱动渲染，修复 disable 行为，添加 manifest 变更调和机制。

**Architecture:** 删除客户端 extension-based 菜单渲染路径（PluginSidebarExtensions），统一走数据库 → MenuService.getTree() → NavMain。MenuRegistry 增加 visibility 切换和 reconciliation 能力。disable 改为标记不可见而非删除。

**Tech Stack:** NestJS, Drizzle ORM, React, tRPC

---

## 问题总结

| # | 问题 | 根因 |
|---|------|------|
| 1 | 插件菜单平铺在"Plugins"下，无层级 | `PluginSidebarExtensions` 绕过数据库，从 extension registry 平铺渲染 |
| 2 | 停用插件删除菜单记录，丢失用户自定义 | disable 调用 `unregisterMenusForTenant`（DELETE） |
| 3 | 插件升级后菜单结构不更新 | `registerPluginMenus` 检测到已存在就跳过 |

---

### Task 1: 前端 — 删除 PluginSidebarExtensions，统一走 NavMain

**Files:**
- Modify: `apps/admin/src/components/Layout.tsx:35,199-200`

**Step 1: 删除 PluginSidebarExtensions 的 import 和使用**

从 `Layout.tsx` 中移除两处引用：

```tsx
// 删除 line 35:
import { PluginSidebarExtensions } from './PluginSidebarExtensions';

// 删除 line 199-200:
{/* Plugin sidebar extensions */}
<PluginSidebarExtensions />
```

**Step 2: 验证**

启动 admin 前端，确认：
- 插件菜单通过 NavMain 渲染（有正确层级：Shop → Products/Orders/...）
- 不再出现重复的 "Plugins" 平铺分组

**Step 3: Commit**

```bash
git add apps/admin/src/components/Layout.tsx
git commit -m "fix(admin): remove PluginSidebarExtensions, unify to database-driven NavMain"
```

---

### Task 2: 后端 — MenuRegistry 增加 visibility 切换方法

**Files:**
- Modify: `apps/server/src/plugins/menu-registry.ts`

**Step 1: 添加 `setPluginMenusVisibility` 方法**

在 `MenuRegistry` 类中添加：

```typescript
/**
 * Toggle visibility of all menus for a plugin (used for disable/enable)
 * Unlike unregister (DELETE), this preserves menu records and user customizations
 */
async setPluginMenusVisibility(
    pluginId: string,
    organizationId: string,
    visible: boolean
): Promise<void> {
    await db.update(menus)
        .set({ visible })
        .where(
            and(
                eq(menus.source, pluginId),
                eq(menus.organizationId, organizationId)
            )
        );

    this.logger.log(`${visible ? '👁️' : '🙈'} Set visibility=${visible} for plugin ${pluginId} menus in org ${organizationId}`);
}
```

需要在文件顶部导入 `update` 相关依赖（`db` 已导入，确认 drizzle `update` 可用）。

**Step 2: Commit**

```bash
git add apps/server/src/plugins/menu-registry.ts
git commit -m "feat(menu-registry): add setPluginMenusVisibility for disable/enable"
```

---

### Task 3: 后端 — MenuRegistry 增加 reconciliation 方法

**Files:**
- Modify: `apps/server/src/plugins/menu-registry.ts`

**Step 1: 将 `registerPluginMenus` 重构为支持调和**

替换当前的"已存在就跳过"逻辑为 diff-based reconciliation：

```typescript
async registerPluginMenus(
    manifest: PluginManifest,
    organizationId: string | null = null
): Promise<void> {
    const { pluginId } = manifest;

    // Extract expected menus from manifest
    const expectedRows = this.extractMenuRows(manifest, organizationId);
    if (expectedRows.length === 0) return;

    // Get existing menus from DB
    const orgCondition = organizationId === null
        ? isNull(menus.organizationId)
        : eq(menus.organizationId, organizationId);
    const existingMenus = await db
        .select()
        .from(menus)
        .where(and(
            eq(menus.source, pluginId),
            orgCondition
        ));

    // If no existing menus, simple insert (first install)
    if (existingMenus.length === 0) {
        await db.insert(menus).values(expectedRows);
        this.logger.log(`✅ Registered ${expectedRows.length} menus for plugin ${pluginId} in org ${organizationId}`);
        return;
    }

    // Reconcile: diff expected vs existing
    const existingByCode = new Map(existingMenus.map(m => [m.code, m]));
    const expectedByCode = new Map(expectedRows.map(r => [r.code, r]));

    // 1. New codes → INSERT
    const toInsert = expectedRows.filter(r => !existingByCode.has(r.code));

    // 2. Removed codes → DELETE
    const toDelete = existingMenus.filter(m => !expectedByCode.has(m.code));

    // 3. Existing codes → UPDATE structural fields only (preserve user customizations: order, visible)
    const toUpdate: Array<{ code: string; updates: Partial<InsertMenu> }> = [];
    for (const [code, expected] of expectedByCode) {
        const existing = existingByCode.get(code);
        if (!existing) continue;
        // Only update structural fields that come from manifest
        const structuralUpdates: Partial<InsertMenu> = {};
        if (existing.label !== expected.label) structuralUpdates.label = expected.label;
        if (existing.icon !== expected.icon) structuralUpdates.icon = expected.icon;
        if (existing.parentCode !== expected.parentCode) structuralUpdates.parentCode = expected.parentCode;
        if (existing.path !== expected.path) structuralUpdates.path = expected.path;
        if (existing.requiredPermission !== expected.requiredPermission) structuralUpdates.requiredPermission = expected.requiredPermission;

        if (Object.keys(structuralUpdates).length > 0) {
            toUpdate.push({ code, updates: structuralUpdates });
        }
    }

    // Execute operations
    if (toInsert.length > 0) {
        await db.insert(menus).values(toInsert);
    }

    for (const { code, updates } of toUpdate) {
        await db.update(menus)
            .set(updates)
            .where(and(
                eq(menus.code, code),
                orgCondition
            ));
    }

    for (const menu of toDelete) {
        await db.delete(menus).where(eq(menus.id, menu.id));
    }

    const ops = [
        toInsert.length > 0 ? `+${toInsert.length}` : null,
        toUpdate.length > 0 ? `~${toUpdate.length}` : null,
        toDelete.length > 0 ? `-${toDelete.length}` : null,
    ].filter(Boolean).join(', ');

    if (ops) {
        this.logger.log(`🔄 Reconciled menus for plugin ${pluginId} in org ${organizationId}: ${ops}`);
    }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/plugins/menu-registry.ts
git commit -m "feat(menu-registry): replace skip-if-exists with reconciliation logic"
```

---

### Task 4: 后端 — PluginManager 增加 disable/enable visibility 方法

**Files:**
- Modify: `apps/server/src/plugins/plugin-manager.ts:509-537`

**Step 1: 添加 `disableMenusForTenant` 和 `enableMenusForTenant`**

```typescript
/**
 * Hide plugin menus for a tenant (called on disable)
 * Preserves menu records and user customizations
 */
async disableMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
    try {
        await this.menuRegistry.setPluginMenusVisibility(pluginId, organizationId, false);
    } catch (error) {
        this.logger.warn(`Failed to hide menus for ${pluginId} in org ${organizationId}:`, error);
    }
}

/**
 * Show plugin menus for a tenant (called on enable)
 * Also reconciles menu structure with current manifest
 */
async enableMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) return;

    try {
        // First reconcile (handles manifest changes since last enable)
        await this.menuRegistry.registerPluginMenus(plugin.manifest, organizationId);
        // Then ensure visible
        await this.menuRegistry.setPluginMenusVisibility(pluginId, organizationId, true);
    } catch (error) {
        this.logger.warn(`Failed to enable menus for ${pluginId} in org ${organizationId}:`, error);
    }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/plugins/plugin-manager.ts
git commit -m "feat(plugin-manager): add disable/enable menu visibility methods"
```

---

### Task 5: 后端 — plugin.ts router 更新 disable/enable 调用

**Files:**
- Modify: `apps/server/src/trpc/routers/plugin.ts:456-457,478-479,518-519,535-536`

**Step 1: 更新四个路由方法**

| 路由 | 原调用 | 新调用 |
|------|--------|--------|
| `installForTenant` (L395) | `registerMenusForTenant` | `registerMenusForTenant`（不变） |
| `uninstallForTenant` (L416) | `unregisterMenusForTenant` | `unregisterMenusForTenant`（不变，真删除） |
| `enableForTenant` (L457) | `registerMenusForTenant` | `enableMenusForTenant`（reconcile + 显示） |
| `disableForTenant` (L479) | `unregisterMenusForTenant` | `disableMenusForTenant`（隐藏） |
| `enable` (L519) | `registerMenusForTenant` | `enableMenusForTenant` |
| `disable` (L536) | `unregisterMenusForTenant` | `disableMenusForTenant` |

具体改动：

```typescript
// enableForTenant (L456-457): 替换
await pluginManager.registerMenusForTenant(input.pluginId, organizationId);
// →
await pluginManager.enableMenusForTenant(input.pluginId, organizationId);

// disableForTenant (L478-479): 替换
await pluginManager.unregisterMenusForTenant(input.pluginId, organizationId);
// →
await pluginManager.disableMenusForTenant(input.pluginId, organizationId);

// enable backward compat (L518-519): 替换
await pluginManager.registerMenusForTenant(input.pluginId, organizationId);
// →
await pluginManager.enableMenusForTenant(input.pluginId, organizationId);

// disable backward compat (L535-536): 替换
await pluginManager.unregisterMenusForTenant(input.pluginId, organizationId);
// →
await pluginManager.disableMenusForTenant(input.pluginId, organizationId);
```

**注意**：`installForTenant` 和 `uninstallForTenant` 保持不变 — install 首次注册菜单，uninstall 真正删除。

**Step 2: Commit**

```bash
git add apps/server/src/trpc/routers/plugin.ts
git commit -m "fix(plugin): disable hides menus instead of deleting, enable reconciles and shows"
```

---

### Task 6: 更新测试

**Files:**
- Modify: `apps/server/src/__tests__/plugins/menu-registry.test.ts`

**Step 1: 补充测试用例**

需要覆盖的场景：

1. **reconciliation**: 注册菜单 → 修改 manifest → 再次注册 → 验证 diff 正确
2. **visibility toggle**: setPluginMenusVisibility 正确调用 db.update
3. **disable 不删除**: disable 后菜单仍在数据库中（visible=false）
4. **enable 恢复**: enable 后菜单 visible=true + 结构已调和

由于现有测试文件基本是空骨架（mock 较重），补充关键逻辑的单元测试。

**Step 2: 运行测试**

```bash
cd apps/server && pnpm vitest run src/__tests__/plugins/menu-registry.test.ts
```

**Step 3: Commit**

```bash
git add apps/server/src/__tests__/plugins/menu-registry.test.ts
git commit -m "test(menu-registry): add tests for reconciliation and visibility toggle"
```

---

## 变更矩阵

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/admin/src/components/Layout.tsx` | Modify | 删除 PluginSidebarExtensions 引用 |
| `apps/server/src/plugins/menu-registry.ts` | Modify | 添加 visibility 切换 + reconciliation |
| `apps/server/src/plugins/plugin-manager.ts` | Modify | 添加 enable/disable 菜单方法 |
| `apps/server/src/trpc/routers/plugin.ts` | Modify | 切换 disable/enable 调用 |
| `apps/server/src/__tests__/plugins/menu-registry.test.ts` | Modify | 补充测试 |

**注意**：`PluginSidebarExtensions.tsx` 文件暂不删除 — `nav.sidebar` 的 extension 机制可能还有其他非菜单用途（如插件在 sidebar 注入自定义 widget）。如确认无其他用途可后续清理。
