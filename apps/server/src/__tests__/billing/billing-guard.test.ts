/**
 * Billing Guard — Unit & Integration Tests
 *
 * Tasks 5.6.8–5.6.16:
 * - 5.6.8:  L4 override > L3 manifest
 * - 5.6.9:  L3 manifest auto-triggers entitlement
 * - 5.6.10: L2 module default applies to undeclared procedures
 * - 5.6.11: "free" bypasses all billing
 * - 5.6.12: Default Policy (allow/deny/audit)
 * - 5.6.13: boolean → existence check only (covered in entitlement.service.test.ts)
 * - 5.6.14: metered → auto consume(1) (covered in entitlement.service.test.ts)
 * - 5.6.15: Full four-layer chain integration
 * - 5.6.16: Plugin zero-code → manifest → billing → quota deduction
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initBillingGuard,
  resolveBillingSubject,
  getDefaultPolicy,
  isBillingGuardReady,
  refreshBillingSettings,
} from '../../billing/billing-guard.js';
import type { SettingsService } from '../../settings/settings.service.js';
import type { PluginManifest } from '@wordrhyme/plugin';

// ─── Mock SettingsService ───

function createMockSettings(
  store: Record<string, unknown> = {},
): SettingsService {
  const data = new Map<string, unknown>(Object.entries(store));

  return {
    get: vi.fn(async (_scope: string, key: string, opts?: { defaultValue?: unknown }) => {
      const compositeKey = `${_scope}:${key}`;
      return data.get(compositeKey) ?? opts?.defaultValue ?? null;
    }),
    set: vi.fn(async (_scope: string, key: string, value: unknown) => {
      data.set(`${_scope}:${key}`, value);
    }),
    list: vi.fn(async (_scope: string, opts?: { keyPrefix?: string }) => {
      const prefix = opts?.keyPrefix ?? '';
      const results: Array<{ key: string; value: unknown }> = [];
      for (const [k, v] of data) {
        if (_scope === 'global' && k.startsWith(`global:${prefix}`)) {
          results.push({ key: k.replace('global:', ''), value: v });
        }
      }
      return results;
    }),
    delete: vi.fn(),
  } as unknown as SettingsService;
}

// ─── Manifest Factory ───

function createManifest(
  billing?: Record<string, string>,
): PluginManifest {
  return {
    id: 'com.example.test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    capabilities: billing ? {
      billing: { procedures: billing },
    } : undefined,
  } as unknown as PluginManifest;
}

// ─── Tests ───

describe('BillingGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // Initialization
  // ========================================================================

  describe('initBillingGuard', () => {
    it('should mark guard as ready after init', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });
      const getManifest = vi.fn();

      await initBillingGuard(settings, getManifest);
      expect(isBillingGuardReady()).toBe(true);
    });

    it('should load default policy from settings', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('deny');
    });

    it('should default to "allow" when no policy is set', async () => {
      const settings = createMockSettings({});
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('allow');
    });
  });

  // ========================================================================
  // 5.6.8: L4 Settings override > L3 manifest
  // ========================================================================

  describe('5.6.8: L4 override takes priority over L3 manifest', () => {
    it('should return L4 override subject even when L3 manifest declares a different subject', async () => {
      const settings = createMockSettings({
        // L4 override: hello-world.sayHello → plugin.premium
        'global:billing.override.pluginApis.hello-world.sayHello': 'plugin.premium',
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      const manifest = createManifest({
        // L3 manifest declares: sayHello → plugin.basic
        sayHello: 'plugin.basic',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.hello-world' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'hello-world',
        'com.example.hello-world',
        'sayHello',
      );

      expect(result.source).toBe('L4');
      expect(result.subject).toBe('plugin.premium');
      expect(result.free).toBe(false);
    });

    it('should return L4 "free" even when L3 declares a subject', async () => {
      const settings = createMockSettings({
        'global:billing.override.pluginApis.hello-world.sayHello': 'free',
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      const manifest = createManifest({ sayHello: 'plugin.basic' });
      await initBillingGuard(settings, (id) =>
        id === 'com.example.hello-world' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'hello-world',
        'com.example.hello-world',
        'sayHello',
      );

      expect(result.source).toBe('L4');
      expect(result.free).toBe(true);
      expect(result.subject).toBeNull();
    });
  });

  // ========================================================================
  // 5.6.9: L3 manifest declaration auto-triggers entitlement
  // ========================================================================

  describe('5.6.9: L3 manifest declaration resolves subject', () => {
    it('should resolve subject from manifest when no L4 override', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      const manifest = createManifest({
        generateImage: 'plugin.imageGen',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'generateImage',
      );

      expect(result.source).toBe('L3');
      expect(result.subject).toBe('plugin.imageGen');
      expect(result.free).toBe(false);
    });

    it('should resolve "free" from manifest', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      const manifest = createManifest({
        getStatus: 'free',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'getStatus',
      );

      expect(result.source).toBe('L3');
      expect(result.free).toBe(true);
      expect(result.subject).toBeNull();
    });
  });

  // ========================================================================
  // 5.6.10: L2 Module Default applies to undeclared procedures
  // ========================================================================

  describe('5.6.10: L2 module default for undeclared procedures', () => {
    it('should fall back to L2 module default when procedure not in L3 manifest', async () => {
      const settings = createMockSettings({
        // L2: module default for test-plugin
        'global:billing.module.test-plugin.subject': 'plugin.defaultCap',
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      // Manifest has billing for generateImage, but NOT for listImages
      const manifest = createManifest({
        generateImage: 'plugin.imageGen',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'listImages', // not declared in manifest
      );

      expect(result.source).toBe('L2');
      expect(result.subject).toBe('plugin.defaultCap');
      expect(result.free).toBe(false);
    });

    it('should not use L2 when L3 manifest declares the procedure', async () => {
      const settings = createMockSettings({
        'global:billing.module.test-plugin.subject': 'plugin.defaultCap',
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });

      const manifest = createManifest({
        generateImage: 'plugin.imageGen',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'generateImage',
      );

      // L3 takes precedence over L2
      expect(result.source).toBe('L3');
      expect(result.subject).toBe('plugin.imageGen');
    });
  });

  // ========================================================================
  // 5.6.11: "free" at any layer bypasses billing
  // ========================================================================

  describe('5.6.11: "free" bypasses all billing checks', () => {
    it('should bypass when L4 is "free"', async () => {
      const settings = createMockSettings({
        'global:billing.override.pluginApis.hello-world.sayHello': 'free',
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });

      await initBillingGuard(settings, vi.fn());

      const result = resolveBillingSubject('hello-world', 'com.example', 'sayHello');
      expect(result.free).toBe(true);
    });

    it('should bypass when L3 manifest declares "free"', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });

      const manifest = createManifest({ health: 'free' });
      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'health',
      );
      expect(result.free).toBe(true);
      expect(result.source).toBe('L3');
    });

    it('should bypass when L2 module default is "free"', async () => {
      const settings = createMockSettings({
        'global:billing.module.test-plugin.subject': 'free',
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });

      await initBillingGuard(settings, vi.fn());

      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'anything',
      );
      expect(result.free).toBe(true);
      expect(result.source).toBe('L2');
    });
  });

  // ========================================================================
  // 5.6.12: Default Policy (allow/deny/audit)
  // ========================================================================

  describe('5.6.12: default policy for undeclared procedures', () => {
    it('should return "default" source when no layer resolves', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'audit',
      });

      await initBillingGuard(settings, vi.fn());

      const result = resolveBillingSubject(
        'unknown-plugin',
        'com.example.unknown',
        'doSomething',
      );

      expect(result.source).toBe('default');
      expect(result.subject).toBeNull();
      expect(result.free).toBe(false);
    });

    it('should expose "allow" policy', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('allow');
    });

    it('should expose "deny" policy', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('deny');
    });

    it('should expose "audit" policy', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'audit',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('audit');
    });

    it('should default to "allow" for invalid policy value', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'invalid-value',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('allow');
    });
  });

  // ========================================================================
  // 5.6.15: Full four-layer chain integration
  // ========================================================================

  describe('5.6.15: four-layer resolution chain', () => {
    let manifest: PluginManifest;

    beforeEach(async () => {
      manifest = createManifest({
        generateImage: 'plugin.imageGen',
        health: 'free',
      });

      const settings = createMockSettings({
        // L4: override generateImage to premium subject
        'global:billing.override.pluginApis.test-plugin.generateImage': 'plugin.premium',
        // L2: module default for test-plugin
        'global:billing.module.test-plugin.subject': 'plugin.defaultCap',
        'global:billing.defaultUndeclaredPolicy': 'audit',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.test-plugin' ? manifest : undefined,
      );
    });

    it('L4 wins for generateImage (override > manifest)', () => {
      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'generateImage',
      );
      expect(result.source).toBe('L4');
      expect(result.subject).toBe('plugin.premium');
    });

    it('L3 wins for health (manifest "free", no L4)', () => {
      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'health',
      );
      expect(result.source).toBe('L3');
      expect(result.free).toBe(true);
    });

    it('L2 wins for undeclared procedure (module default)', () => {
      const result = resolveBillingSubject(
        'test-plugin',
        'com.example.test-plugin',
        'listImages', // not in manifest, not in L4
      );
      expect(result.source).toBe('L2');
      expect(result.subject).toBe('plugin.defaultCap');
    });

    it('default policy for completely unknown plugin', () => {
      const result = resolveBillingSubject(
        'other-plugin',
        'com.example.other-plugin',
        'doSomething',
      );
      expect(result.source).toBe('default');
      expect(result.subject).toBeNull();
      expect(getDefaultPolicy()).toBe('audit');
    });
  });

  // ========================================================================
  // 5.6.16: Plugin zero-code → manifest → billing → quota chain
  // ========================================================================

  describe('5.6.16: plugin zero-code billing chain', () => {
    it('should resolve subject from manifest without any settings config', async () => {
      // Scenario: plugin has manifest.capabilities.billing.procedures
      // but admin has not configured any overrides or module defaults
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'deny',
      });

      const manifest = createManifest({
        analyze: 'plugin.analysis',
        status: 'free',
      });

      await initBillingGuard(settings, (id) =>
        id === 'com.example.zero-code' ? manifest : undefined,
      );

      // Declared procedure → resolved via L3
      const analyzeResult = resolveBillingSubject(
        'zero-code',
        'com.example.zero-code',
        'analyze',
      );
      expect(analyzeResult.source).toBe('L3');
      expect(analyzeResult.subject).toBe('plugin.analysis');
      expect(analyzeResult.free).toBe(false);

      // Free procedure → bypasses billing
      const statusResult = resolveBillingSubject(
        'zero-code',
        'com.example.zero-code',
        'status',
      );
      expect(statusResult.source).toBe('L3');
      expect(statusResult.free).toBe(true);

      // Undeclared procedure → falls to default policy (deny)
      const unknownResult = resolveBillingSubject(
        'zero-code',
        'com.example.zero-code',
        'undeclared',
      );
      expect(unknownResult.source).toBe('default');
      expect(unknownResult.subject).toBeNull();
      expect(getDefaultPolicy()).toBe('deny');
    });
  });

  // ========================================================================
  // refreshBillingSettings
  // ========================================================================

  describe('refreshBillingSettings', () => {
    it('should reload settings after changes', async () => {
      const settings = createMockSettings({
        'global:billing.defaultUndeclaredPolicy': 'allow',
      });
      await initBillingGuard(settings, vi.fn());
      expect(getDefaultPolicy()).toBe('allow');

      // Simulate admin changing policy — mock returns new value
      (settings.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('deny');
      // list still returns empty (no overrides)
      (settings.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await refreshBillingSettings();
      expect(getDefaultPolicy()).toBe('deny');
    });
  });
});
