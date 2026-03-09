import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRouteDriftReport,
  detectRouteDrift,
  getLatestRouteDriftReport,
  snapshotPluginRoutes,
  type RouteProcedureSnapshot,
} from '../../trpc/route-drift';
import { initPermissionRegistry } from '../../trpc/permission-registry';

function createMockRouter(procedures: Record<string, { meta?: Record<string, unknown> }>) {
  const flatProcedures: Record<string, unknown> = {};
  for (const [path, config] of Object.entries(procedures)) {
    flatProcedures[path] = {
      _def: {
        procedure: true,
        type: 'mutation',
        mutation: true,
        meta: config.meta ?? {},
      },
    };
  }
  return { _def: { procedures: flatProcedures } };
}

function noL2Default(_pluginId: string): string | null {
  return null;
}

describe('RouteDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initPermissionRegistry({ _def: { procedures: {} } });
    clearRouteDriftReport('test-plugin');
  });

  it('should snapshot billing and permission declarations together', () => {
    initPermissionRegistry(createMockRouter({
      'pluginApis.test-plugin.generateImage': {
        meta: {
          permission: { action: 'generate', subject: 'Image' },
          billing: { subject: 'plugin.imageGen' },
        },
      },
    }));

    const snapshot = snapshotPluginRoutes('test-plugin');
    expect(snapshot).toEqual([
      {
        path: 'pluginApis.test-plugin.generateImage',
        billingSubject: 'plugin.imageGen',
        permissionAction: 'generate',
        permissionSubject: 'Image',
      },
    ]);
  });

  it('should detect permission declaration changes for the same route', () => {
    const oldSnapshot: RouteProcedureSnapshot[] = [
      {
        path: 'pluginApis.test-plugin.generateImage',
        billingSubject: 'plugin.imageGen',
        permissionAction: 'generate',
        permissionSubject: 'Image',
      },
    ];

    initPermissionRegistry(createMockRouter({
      'pluginApis.test-plugin.generateImage': {
        meta: {
          permission: { action: 'create', subject: 'MediaAsset' },
          billing: { subject: 'plugin.imageGen' },
        },
      },
    }));

    const report = detectRouteDrift('test-plugin', oldSnapshot, noL2Default);
    expect(report.hasDrift).toBe(true);
    expect(report.permissionChanged).toEqual([
      {
        path: 'pluginApis.test-plugin.generateImage',
        oldAction: 'generate',
        newAction: 'create',
        oldSubject: 'Image',
        newSubject: 'MediaAsset',
      },
    ]);
    expect(getLatestRouteDriftReport('test-plugin')?.pluginId).toBe('test-plugin');
  });
});
