import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  snapshotPluginProcedures,
  detectBillingDrift,
  getLatestDriftReport,
  clearDriftReport,
  type ProcedureSnapshot,
  type BillingDriftReport,
} from '../../billing/billing-drift';
import { initPermissionRegistry } from '../../trpc/permission-registry';

// ─── Test Helpers ───

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

describe('BillingDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Start with empty registry
    initPermissionRegistry({ _def: { procedures: {} } });
    clearDriftReport('test-plugin');
  });

  // ========================================================================
  // Snapshot
  // ========================================================================

  describe('snapshotPluginProcedures', () => {
    it('should capture procedures for a specific plugin', () => {
      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.generateImage': { meta: { billing: { subject: 'plugin.imageGen' } } },
        'pluginApis.test-plugin.healthCheck': { meta: {} },
        'pluginApis.other-plugin.doSomething': { meta: {} },
        'currency.list': { meta: { __crudSubject: 'Currency' } },
      }));

      const snapshot = snapshotPluginProcedures('test-plugin');
      expect(snapshot).toHaveLength(2);
      expect(snapshot.find(s => s.path === 'pluginApis.test-plugin.generateImage')).toEqual({
        path: 'pluginApis.test-plugin.generateImage',
        billingSubject: 'plugin.imageGen',
      });
      expect(snapshot.find(s => s.path === 'pluginApis.test-plugin.healthCheck')).toEqual({
        path: 'pluginApis.test-plugin.healthCheck',
        billingSubject: null,
      });
    });

    it('should return empty for non-existent plugin', () => {
      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.foo': { meta: {} },
      }));

      const snapshot = snapshotPluginProcedures('non-existent');
      expect(snapshot).toHaveLength(0);
    });
  });

  // ========================================================================
  // Drift Detection
  // ========================================================================

  describe('detectBillingDrift', () => {
    it('should detect removed procedures', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.generateImage', billingSubject: 'plugin.imageGen' },
        { path: 'pluginApis.test-plugin.healthCheck', billingSubject: null },
      ];

      // New registry: only healthCheck remains
      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.healthCheck': { meta: {} },
      }));

      const report = detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      expect(report.hasDrift).toBe(true);
      expect(report.removed).toHaveLength(1);
      expect(report.removed[0]!.path).toBe('pluginApis.test-plugin.generateImage');
    });

    it('should detect added procedures', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.healthCheck', billingSubject: null },
      ];

      // New registry: added generateImage
      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.healthCheck': { meta: {} },
        'pluginApis.test-plugin.generateImage': { meta: { billing: { subject: 'plugin.imageGen' } } },
      }));

      const report = detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      expect(report.hasDrift).toBe(true);
      expect(report.added).toHaveLength(1);
      expect(report.added[0]!.path).toBe('pluginApis.test-plugin.generateImage');
      expect(report.added[0]!.billingSubject).toBe('plugin.imageGen');
    });

    it('should detect changed billingSubject', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.generateImage', billingSubject: 'plugin.imageGen' },
      ];

      // New registry: same route but different billing subject
      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.generateImage': { meta: { billing: { subject: 'plugin.newImageGen' } } },
      }));

      const report = detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      expect(report.hasDrift).toBe(true);
      expect(report.changed).toHaveLength(1);
      expect(report.changed[0]!.oldSubject).toBe('plugin.imageGen');
      expect(report.changed[0]!.newSubject).toBe('plugin.newImageGen');
    });

    it('should report no drift when nothing changed', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.generateImage', billingSubject: 'plugin.imageGen' },
      ];

      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.generateImage': { meta: { billing: { subject: 'plugin.imageGen' } } },
      }));

      const report = detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      expect(report.hasDrift).toBe(false);
      expect(report.removed).toHaveLength(0);
      expect(report.added).toHaveLength(0);
      expect(report.changed).toHaveLength(0);
    });

    it('should detect L2 safety net status', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.foo', billingSubject: null },
      ];

      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.bar': { meta: {} },
      }));

      const withL2 = (_id: string) => 'plugin.default';

      const report = detectBillingDrift('test-plugin', oldSnapshot, withL2);
      expect(report.hasL2SafetyNet).toBe(true);

      const reportNoL2 = detectBillingDrift('test-plugin', oldSnapshot, noL2Default);
      expect(reportNoL2.hasL2SafetyNet).toBe(false);
    });
  });

  // ========================================================================
  // Report Cache
  // ========================================================================

  describe('drift report cache', () => {
    it('should cache drift report when drift detected', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.removed', billingSubject: null },
      ];
      initPermissionRegistry(createMockRouter({}));

      detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      const cached = getLatestDriftReport('test-plugin');
      expect(cached).not.toBeNull();
      expect(cached!.pluginId).toBe('test-plugin');
    });

    it('should not cache when no drift', () => {
      const oldSnapshot: ProcedureSnapshot[] = [];
      initPermissionRegistry(createMockRouter({}));

      detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      expect(getLatestDriftReport('test-plugin')).toBeNull();
    });

    it('should clear on demand', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.removed', billingSubject: null },
      ];
      initPermissionRegistry(createMockRouter({}));
      detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      clearDriftReport('test-plugin');
      expect(getLatestDriftReport('test-plugin')).toBeNull();
    });

    it('should clear stale cache when drift is resolved', () => {
      const oldSnapshot: ProcedureSnapshot[] = [
        { path: 'pluginApis.test-plugin.removed', billingSubject: null },
      ];
      initPermissionRegistry(createMockRouter({}));
      detectBillingDrift('test-plugin', oldSnapshot, noL2Default);

      initPermissionRegistry(createMockRouter({
        'pluginApis.test-plugin.removed': { meta: {} },
      }));
      detectBillingDrift('test-plugin', [
        { path: 'pluginApis.test-plugin.removed', billingSubject: null },
      ], noL2Default);

      expect(getLatestDriftReport('test-plugin')).toBeNull();
    });
  });
});
