/**
 * 从 RESOURCE_DEFINITIONS 自动生成菜单 seed 数据
 *
 * 用法:
 * - 在数据库 seed 脚本中调用
 * - 或在系统初始化时动态生成
 *
 * 菜单结构由 RESOURCE_DEFINITIONS 中的 parentCode 和 order 字段定义
 *
 * 菜单归属规则:
 * - systemReserved = true → organizationId = PLATFORM_ORG_ID（仅平台组织可见）
 * - systemReserved = false → organizationId = null（全局模板，所有组织可见）
 */

import { RESOURCE_DEFINITIONS, getResourceMenuCode } from '../../permission/resource-definitions';

/** Platform organization ID - must match seed-accounts.ts */
const PLATFORM_ORG_ID = 'platform';

/**
 * 生成核心系统菜单
 *
 * 自动从 RESOURCE_DEFINITIONS 生成，包含父子层级关系
 */
export function generateCoreMenus() {
  const menus = [];

  for (const [_key, resource] of Object.entries(RESOURCE_DEFINITIONS)) {
    const code = getResourceMenuCode(resource);
    const isDirectory = resource.menuPath === null;
    const isSystemReserved = (resource as any).systemReserved === true;

    // 计算 requiredPermission:
    // - 目录菜单：无权限要求（由子菜单决定可见性）
    // - 普通资源：需要 read 权限
    let requiredPermission: string | null = null;
    if (!isDirectory) {
      requiredPermission = `${resource.subject}:read`;
    }

    // 菜单归属:
    // - systemReserved → 绑定到 platform 组织（只有切换到 platform 组织才可见）
    // - 普通菜单 → null（全局模板，所有组织可见）
    const organizationId = isSystemReserved ? PLATFORM_ORG_ID : null;

    menus.push({
      code,
      type: 'system' as const,
      source: 'core',
      organizationId,
      label: resource.label,
      icon: resource.icon,
      path: resource.menuPath,
      requiredPermission,
      target: 'admin' as const,
      parentCode: (resource as any).parentCode ?? null,
      order: resource.order ?? 0,
    });
  }

  // 按 order 排序（父级优先，同级按 order）
  menus.sort((a, b) => {
    // 先按是否有 parentCode 分组（父级在前）
    if (!a.parentCode && b.parentCode) return -1;
    if (a.parentCode && !b.parentCode) return 1;
    // 同级按 order 排序
    return a.order - b.order;
  });

  return menus;
}

/**
 * 按父子关系分组菜单（供前端 Sidebar 使用）
 */
export function getMenuTree() {
  const menus = generateCoreMenus();
  const menuMap = new Map(menus.map(m => [m.code, { ...m, children: [] as typeof menus }]));

  const roots: typeof menus = [];

  for (const menu of menus) {
    if (menu.parentCode) {
      const parent = menuMap.get(menu.parentCode);
      if (parent) {
        (parent as any).children.push(menuMap.get(menu.code));
      }
    } else {
      roots.push(menuMap.get(menu.code)!);
    }
  }

  return roots;
}
