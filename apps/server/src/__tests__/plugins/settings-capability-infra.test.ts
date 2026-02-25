/**
 * Settings Capability Infrastructure Policy Enforcement Tests (Task 7.2)
 *
 * Tests that createPluginSettingsCapability's enforceInfraPolicy
 * blocks tenant get/set/delete/list when policy is 'unified',
 * and allows when policy is 'allow_override' or 'require_tenant'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPluginSettingsCapability } from '../../plugins/capabilities/settings.capability.js';
import type { SettingsService } from '../../settings/settings.service.js';
import type { FeatureFlagService } from '../../settings/feature-flag.service.js';
import type { PluginManifest } from '@wordrhyme/plugin';

// ─── Mock factories ───

function createMockSettingsService(policyMode: string = 'unified'): SettingsService {
  return {
    get: vi.fn(async (_scope: string, key: string, opts?: { defaultValue?: unknown }) => {
      if (key === 'infra.policy') {
        return { mode: policyMode };
      }
      return opts?.defaultValue ?? null;
    }),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as SettingsService;
}

function createMockFeatureFlagService(): FeatureFlagService {
  return {
    getByKey: vi.fn().mockResolvedValue(null),
    check: vi.fn().mockResolvedValue(false),
  } as unknown as FeatureFlagService;
}

const infraManifest: PluginManifest = {
  pluginId: 'storage-s3',
  version: '1.0.0',
  name: 'S3 Storage',
  vendor: 'WordRhyme',
  engines: { wordrhyme: '^0.1.0' },
  infrastructure: { tenantOverride: true, riskLevel: 'high', sensitiveFields: ['secretAccessKey'] },
} as PluginManifest;

const nonInfraManifest: PluginManifest = {
  pluginId: 'hello-world',
  version: '1.0.0',
  name: 'Hello World',
  vendor: 'Example',
  engines: { wordrhyme: '^0.1.0' },
} as PluginManifest;

describe('Settings Capability — infra policy enforcement (Task 7.2)', () => {
  let featureFlagService: FeatureFlagService;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlagService = createMockFeatureFlagService();
  });

  describe('unified mode — tenant blocked', () => {
    it('should throw on tenant get', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.get('some.key')).rejects.toThrow(/unified/i);
    });

    it('should throw on tenant set', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.set('some.key', 'value')).rejects.toThrow(/unified/i);
    });

    it('should throw on tenant delete', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.delete('some.key')).rejects.toThrow(/unified/i);
    });

    it('should throw on tenant list', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.list()).rejects.toThrow(/unified/i);
    });
  });

  describe('unified mode — platform admin allowed', () => {
    it('should allow platform get', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', 'platform', svc, featureFlagService, infraManifest);
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });

    it('should allow when no organizationId (no tenant context)', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('storage-s3', undefined, svc, featureFlagService, infraManifest);
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });
  });

  describe('allow_override mode — tenant allowed', () => {
    it('should allow tenant get', async () => {
      const svc = createMockSettingsService('allow_override');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });

    it('should allow tenant set', async () => {
      const svc = createMockSettingsService('allow_override');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.set('some.key', 'value')).resolves.not.toThrow();
    });

    it('should allow tenant delete', async () => {
      const svc = createMockSettingsService('allow_override');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.delete('some.key')).resolves.not.toThrow();
    });

    it('should allow tenant list', async () => {
      const svc = createMockSettingsService('allow_override');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.list()).resolves.not.toThrow();
    });
  });

  describe('require_tenant mode — tenant allowed', () => {
    it('should allow tenant get', async () => {
      const svc = createMockSettingsService('require_tenant');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });

    it('should allow tenant set', async () => {
      const svc = createMockSettingsService('require_tenant');
      const cap = createPluginSettingsCapability('storage-s3', 'org-tenant-1', svc, featureFlagService, infraManifest);
      await expect(cap.set('some.key', 'value')).resolves.not.toThrow();
    });
  });

  describe('non-infrastructure plugin — no enforcement', () => {
    it('should allow tenant operations without infra policy checks', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('hello-world', 'org-tenant-1', svc, featureFlagService, nonInfraManifest);
      // Non-infra plugin should not be affected by policy
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });

    it('should allow when no manifest provided', async () => {
      const svc = createMockSettingsService('unified');
      const cap = createPluginSettingsCapability('hello-world', 'org-tenant-1', svc, featureFlagService);
      await expect(cap.get('some.key')).resolves.not.toThrow();
    });
  });
});
