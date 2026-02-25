/**
 * Infrastructure Config Resolution & Masking Tests
 *
 * Covers:
 * - 7.3: resolveInfraConfig three modes
 * - 7.4: maskSensitiveFields
 * - 7.5: mode switch behavior (allow_override → unified keeps data, resolve ignores it)
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveInfraConfig,
  maskSensitiveFields,
  checkInfraPolicyAccess,
  readInfraPolicyMode,
} from '../../plugins/capabilities/infra-config.js';
import type { SettingsService } from '../../settings/settings.service.js';

// ─── Mock SettingsService ───

function createMockSettingsService(store: Record<string, unknown> = {}): SettingsService {
  return {
    get: vi.fn(async (scope: string, key: string, opts?: { scopeId?: string; organizationId?: string; defaultValue?: unknown }) => {
      // Build composite key: scope:scopeId:orgId:key
      const parts = [scope, opts?.scopeId ?? '', opts?.organizationId ?? '', key];
      const compositeKey = parts.join(':');
      return store[compositeKey] ?? opts?.defaultValue ?? null;
    }),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  } as unknown as SettingsService;
}

// Helpers to set store entries
function storeKey(scope: string, key: string, pluginId: string, orgId = ''): string {
  return `${scope}:${pluginId}:${orgId}:${key}`;
}

describe('readInfraPolicyMode', () => {
  it('should default to unified when no policy is stored', async () => {
    const svc = createMockSettingsService({});
    const mode = await readInfraPolicyMode(svc, 'storage-s3');
    expect(mode).toBe('unified');
  });

  it('should read allow_override mode', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', 'storage-s3')]: { mode: 'allow_override' },
    });
    const mode = await readInfraPolicyMode(svc, 'storage-s3');
    expect(mode).toBe('allow_override');
  });

  it('should read require_tenant mode', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', 'storage-s3')]: { mode: 'require_tenant' },
    });
    const mode = await readInfraPolicyMode(svc, 'storage-s3');
    expect(mode).toBe('require_tenant');
  });

  it('should fallback to unified for invalid mode value', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', 'storage-s3')]: { mode: 'invalid_mode' },
    });
    const mode = await readInfraPolicyMode(svc, 'storage-s3');
    expect(mode).toBe('unified');
  });

  it('should fallback to unified for malformed policy object', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', 'storage-s3')]: 'not-an-object',
    });
    const mode = await readInfraPolicyMode(svc, 'storage-s3');
    expect(mode).toBe('unified');
  });
});

describe('resolveInfraConfig', () => {
  const PLUGIN_ID = 'storage-s3';
  const TENANT_ORG = 'org-tenant-1';
  const platformConfig = { bucket: 'platform-bucket', region: 'us-east-1', secretAccessKey: 'PLATFORM_SECRET' };
  const tenantConfig = { bucket: 'tenant-bucket', region: 'eu-west-1', secretAccessKey: 'TENANT_SECRET' };

  describe('unified mode', () => {
    it('should return platform config only', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toEqual(platformConfig);
      expect(result.source).toBe('platform');
    });

    it('should return null when no platform config exists', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should ignore tenant config even if it exists', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      // Should be platform config, not tenant
      expect(result.config).toEqual(platformConfig);
      expect(result.source).toBe('platform');
    });
  });

  describe('allow_override mode', () => {
    it('should return tenant config when it exists', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'allow_override' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toEqual(tenantConfig);
      expect(result.source).toBe('tenant');
    });

    it('should fallback to platform config when no tenant config', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'allow_override' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toEqual(platformConfig);
      expect(result.source).toBe('platform');
    });

    it('should return null when neither tenant nor platform config exists', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'allow_override' },
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should return platform config when organizationId is undefined', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'allow_override' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, undefined);
      expect(result.config).toEqual(platformConfig);
      expect(result.source).toBe('platform');
    });
  });

  describe('require_tenant mode', () => {
    it('should return tenant config when it exists', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'require_tenant' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toEqual(tenantConfig);
      expect(result.source).toBe('tenant');
    });

    it('should NOT fallback to platform — return null when no tenant config', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'require_tenant' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.config).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should return null when organizationId is undefined', async () => {
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'require_tenant' },
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, undefined);
      expect(result.config).toBeNull();
      expect(result.source).toBeNull();
    });
  });

  describe('mode switch: allow_override → unified (Task 7.5)', () => {
    it('should not return tenant data after switching to unified, even though data is preserved', async () => {
      // Store has both platform and tenant configs + unified policy
      // Simulates: admin changed policy from allow_override to unified
      // Tenant data is still in the DB but resolveInfraConfig should ignore it
      const svc = createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        // Tenant data preserved from when it was allow_override
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      });

      const result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);

      // Should return platform config, NOT tenant config
      expect(result.config).toEqual(platformConfig);
      expect(result.source).toBe('platform');
      expect(result.config).not.toEqual(tenantConfig);
    });

    it('tenant data in DB is preserved (not deleted) — can be retrieved if mode switches back', async () => {
      const store = {
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' } as unknown,
        [storeKey('plugin_global', 'infra.config', PLUGIN_ID)]: platformConfig,
        [storeKey('plugin_tenant', 'infra.config', PLUGIN_ID, TENANT_ORG)]: tenantConfig,
      };
      const svc = createMockSettingsService(store);

      // Phase 1: unified — should return platform
      let result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      expect(result.source).toBe('platform');

      // Phase 2: switch back to allow_override
      store[storeKey('plugin_global', 'infra.policy', PLUGIN_ID)] = { mode: 'allow_override' };

      result = await resolveInfraConfig(svc, PLUGIN_ID, TENANT_ORG);
      // Tenant data is still there and should now be returned
      expect(result.config).toEqual(tenantConfig);
      expect(result.source).toBe('tenant');
    });
  });
});

describe('maskSensitiveFields', () => {
  it('should mask specified sensitive fields', () => {
    const config = {
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    };

    const masked = maskSensitiveFields(config, ['secretAccessKey']);
    expect(masked).toEqual({
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: '********',
    });
  });

  it('should mask multiple sensitive fields', () => {
    const config = {
      host: 'smtp.example.com',
      username: 'user@example.com',
      password: 'secret123',
      apiKey: 'sk-xxx',
    };

    const masked = maskSensitiveFields(config, ['password', 'apiKey']);
    expect(masked).toEqual({
      host: 'smtp.example.com',
      username: 'user@example.com',
      password: '********',
      apiKey: '********',
    });
  });

  it('should not modify original config object', () => {
    const config = { key: 'secret-value' };
    maskSensitiveFields(config, ['key']);
    expect(config.key).toBe('secret-value');
  });

  it('should handle empty sensitiveFields list', () => {
    const config = { bucket: 'test', secret: 'value' };
    const masked = maskSensitiveFields(config, []);
    expect(masked).toEqual(config);
  });

  it('should handle null config', () => {
    expect(maskSensitiveFields(null, ['key'])).toBeNull();
  });

  it('should handle undefined config', () => {
    expect(maskSensitiveFields(undefined, ['key'])).toBeUndefined();
  });

  it('should handle non-object config', () => {
    expect(maskSensitiveFields('string-value', ['key'])).toBe('string-value');
  });

  it('should skip fields that do not exist in config', () => {
    const config = { bucket: 'test' };
    const masked = maskSensitiveFields(config, ['nonExistentField']);
    expect(masked).toEqual({ bucket: 'test' });
  });

  it('should skip null and undefined field values', () => {
    const config = { key: null, other: undefined, visible: 'yes' };
    const masked = maskSensitiveFields(config, ['key', 'other']);
    expect(masked).toEqual({ key: null, other: undefined, visible: 'yes' });
  });
});

describe('checkInfraPolicyAccess', () => {
  const PLUGIN_ID = 'storage-s3';

  it('should allow platform admin (organizationId = platform)', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
    });
    const error = await checkInfraPolicyAccess(svc, PLUGIN_ID, 'platform', 'set');
    expect(error).toBeNull();
  });

  it('should allow when organizationId is undefined (no tenant context)', async () => {
    const svc = createMockSettingsService({
      [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
    });
    const error = await checkInfraPolicyAccess(svc, PLUGIN_ID, undefined, 'set');
    expect(error).toBeNull();
  });

  describe('unified mode', () => {
    const makeUnifiedSvc = () =>
      createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'unified' },
      });

    it('should deny tenant get', async () => {
      const error = await checkInfraPolicyAccess(makeUnifiedSvc(), PLUGIN_ID, 'org-1', 'get');
      expect(error).toBeTruthy();
      expect(error).toContain('unified');
    });

    it('should deny tenant set', async () => {
      const error = await checkInfraPolicyAccess(makeUnifiedSvc(), PLUGIN_ID, 'org-1', 'set');
      expect(error).toBeTruthy();
    });

    it('should deny tenant delete', async () => {
      const error = await checkInfraPolicyAccess(makeUnifiedSvc(), PLUGIN_ID, 'org-1', 'delete');
      expect(error).toBeTruthy();
    });

    it('should deny tenant list', async () => {
      const error = await checkInfraPolicyAccess(makeUnifiedSvc(), PLUGIN_ID, 'org-1', 'list');
      expect(error).toBeTruthy();
    });
  });

  describe('allow_override mode', () => {
    const makeSvc = () =>
      createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'allow_override' },
      });

    it.each(['get', 'set', 'delete', 'list'] as const)('should allow tenant %s', async (op) => {
      const error = await checkInfraPolicyAccess(makeSvc(), PLUGIN_ID, 'org-1', op);
      expect(error).toBeNull();
    });
  });

  describe('require_tenant mode', () => {
    const makeSvc = () =>
      createMockSettingsService({
        [storeKey('plugin_global', 'infra.policy', PLUGIN_ID)]: { mode: 'require_tenant' },
      });

    it.each(['get', 'set', 'delete', 'list'] as const)('should allow tenant %s', async (op) => {
      const error = await checkInfraPolicyAccess(makeSvc(), PLUGIN_ID, 'org-1', op);
      expect(error).toBeNull();
    });
  });
});
