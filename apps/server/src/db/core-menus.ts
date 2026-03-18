import { RESOURCE_DEFINITIONS, getResourceMenuCode } from '../permission/resource-definitions';

const PLATFORM_ORG_ID = 'platform';

export function generateCoreMenus() {
  const menus = [];

  for (const [_key, resource] of Object.entries(RESOURCE_DEFINITIONS)) {
    const code = getResourceMenuCode(resource);
    const isDirectory = resource.menuPath === null;
    const isSystemReserved = (resource as { systemReserved?: boolean }).systemReserved === true;

    let requiredPermission: string | null = null;
    if (!isDirectory) {
      requiredPermission = `${resource.subject}:read`;
    }

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
      parentCode: (resource as { parentCode?: string | null }).parentCode ?? null,
      order: resource.order ?? 0,
    });
  }

  menus.sort((a, b) => {
    if (!a.parentCode && b.parentCode) return -1;
    if (a.parentCode && !b.parentCode) return 1;
    return a.order - b.order;
  });

  return menus;
}
