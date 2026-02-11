/**
 * Settings Integration Tests
 *
 * End-to-end tests for settings system with real database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../db/index.js';
import { settings, settingSchemas } from '@wordrhyme/db';
import { SettingsService } from '../../settings/settings.service.js';
import { EncryptionService } from '../../settings/encryption.service.js';
import { SettingsCacheService } from '../../settings/cache.service.js';
import { SchemaRegistryService } from '../../settings/schema-registry.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { CacheManager } from '../../cache/cache-manager.js';
import { eq, and, sql } from 'drizzle-orm';

describe.sequential('Settings Integration Tests', () => {
  let settingsService: SettingsService;
  let encryptionService: EncryptionService;
  let cacheService: SettingsCacheService;
  let schemaRegistry: SchemaRegistryService;
  let auditService: AuditService;

  beforeAll(async () => {
    // Initialize services
    encryptionService = new EncryptionService();
    encryptionService.onModuleInit();

    const mockEventEmitter = {
      emit: vi.fn(),
    } as any;

    const mockCacheManager = new CacheManager();
    await mockCacheManager.onModuleInit();

    cacheService = new SettingsCacheService(mockCacheManager);
    schemaRegistry = new SchemaRegistryService();
    await schemaRegistry.onModuleInit();

    auditService = new AuditService(mockEventEmitter);

    settingsService = new SettingsService(
      encryptionService,
      cacheService,
      schemaRegistry,
      auditService
    );
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.delete(settings).where(sql`${settings.key} LIKE 'test.%'`);
    await db.delete(settingSchemas).where(sql`${settingSchemas.keyPattern} LIKE 'test.%'`);

    // Clear cache
    schemaRegistry.clearCache();
  });

  afterEach(async () => {
    // Clean up test data after each test to prevent leakage
    await db.delete(settings).where(sql`${settings.key} LIKE 'test.%'`);
    await db.delete(settingSchemas).where(sql`${settingSchemas.keyPattern} LIKE 'test.%'`);
  });

  afterAll(async () => {
    // Final cleanup
    await db.delete(settings).where(sql`${settings.key} LIKE 'test.%'`);
    await db.delete(settingSchemas).where(sql`${settingSchemas.keyPattern} LIKE 'test.%'`);
  });

  describe('Cascade Resolution', () => {
    it('should resolve global → tenant → plugin hierarchy', async () => {
      // Set global default
      await settingsService.set('global', 'test.cascade', 'global-value');

      // Set tenant override
      await settingsService.set('tenant', 'test.cascade', 'tenant-value', {
        organizationId: 'org-123',
      });

      // Set plugin global
      await settingsService.set('plugin_global', 'test.cascade', 'plugin-global-value', {
        scopeId: 'my-plugin',
      });

      // Set plugin tenant override
      await settingsService.set('plugin_tenant', 'test.cascade', 'plugin-tenant-value', {
        scopeId: 'my-plugin',
        organizationId: 'org-123',
      });

      // Test resolution order
      const globalResult = await settingsService.get('global', 'test.cascade');
      expect(globalResult).toBe('global-value');

      const tenantResult = await settingsService.get('tenant', 'test.cascade', {
        organizationId: 'org-123',
      });
      expect(tenantResult).toBe('tenant-value');

      const pluginGlobalResult = await settingsService.get('plugin_global', 'test.cascade', {
        scopeId: 'my-plugin',
      });
      expect(pluginGlobalResult).toBe('plugin-global-value');

      const pluginTenantResult = await settingsService.get('plugin_tenant', 'test.cascade', {
        scopeId: 'my-plugin',
        organizationId: 'org-123',
      });
      expect(pluginTenantResult).toBe('plugin-tenant-value');
    });

    it('should fall back correctly when overrides not found', async () => {
      // Only set global
      await settingsService.set('global', 'test.fallback', 'global-value');

      // Tenant should fall back to global
      const tenantResult = await settingsService.get('tenant', 'test.fallback', {
        organizationId: 'org-999',
      });
      expect(tenantResult).toBe('global-value');
    });

    it('should not leak settings across organizations', async () => {
      // Set for org-1
      await settingsService.set('tenant', 'test.isolation', 'org-1-value', {
        organizationId: 'org-1',
      });

      // Set for org-2
      await settingsService.set('tenant', 'test.isolation', 'org-2-value', {
        organizationId: 'org-2',
      });

      // Verify isolation
      const org1Result = await settingsService.get('tenant', 'test.isolation', {
        organizationId: 'org-1',
      });
      expect(org1Result).toBe('org-1-value');

      const org2Result = await settingsService.get('tenant', 'test.isolation', {
        organizationId: 'org-2',
      });
      expect(org2Result).toBe('org-2-value');
    });
  });

  describe('Encryption End-to-End', () => {
    it('should encrypt on write and decrypt on read', async () => {
      if (!encryptionService.isAvailable()) {
        console.warn('Encryption not configured, skipping test');
        return;
      }

      const secretValue = 'my-secret-api-key';

      // Write encrypted
      await settingsService.set('global', 'test.encrypted', secretValue, {
        encrypted: true,
      });

      // Read decrypted
      const result = await settingsService.get('global', 'test.encrypted');
      expect(result).toBe(secretValue);

      // Verify stored value is encrypted
      const stored = await db
        .select()
        .from(settings)
        .where(
          and(
            eq(settings.scope, 'global'),
            eq(settings.key, 'test.encrypted')
          )
        )
        .limit(1);

      expect(stored[0]?.encrypted).toBe(true);
      expect(stored[0]?.value).toHaveProperty('ciphertext');
      expect(stored[0]?.value).toHaveProperty('iv');
      expect(stored[0]?.value).toHaveProperty('authTag');
      expect(stored[0]?.value).toHaveProperty('keyVersion');
    });

    it('should handle different value types with encryption', async () => {
      if (!encryptionService.isAvailable()) {
        console.warn('Encryption not configured, skipping test');
        return;
      }

      const testCases = [
        { key: 'test.enc.string', value: 'secret-string' },
        { key: 'test.enc.number', value: 42 },
        { key: 'test.enc.boolean', value: true },
        { key: 'test.enc.object', value: { host: 'smtp.example.com', port: 587 } },
        { key: 'test.enc.array', value: ['item1', 'item2', 'item3'] },
      ];

      for (const testCase of testCases) {
        await settingsService.set('global', testCase.key, testCase.value, {
          encrypted: true,
        });

        const result = await settingsService.get('global', testCase.key);
        expect(result).toEqual(testCase.value);
      }
    });
  });

  describe('Schema Validation', () => {
    it('should validate against registered schema', async () => {
      // Register schema
      await schemaRegistry.register({
        keyPattern: 'test.validated',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string' },
            port: { type: 'number', minimum: 1, maximum: 65535 },
          },
          required: ['host', 'port'],
        },
        defaultValue: { host: 'localhost', port: 3000 },
      });

      // Reload schemas
      await schemaRegistry.loadSchemas();

      // Valid value should succeed
      await expect(
        settingsService.set('global', 'test.validated', {
          host: 'example.com',
          port: 8080,
        })
      ).resolves.toBeDefined();

      // Invalid value should fail
      await expect(
        settingsService.set('global', 'test.validated', {
          host: 'example.com',
          port: 99999, // exceeds maximum
        })
      ).rejects.toThrow();

      // Missing required field should fail
      await expect(
        settingsService.set('global', 'test.validated', {
          host: 'example.com',
        })
      ).rejects.toThrow();
    });

    it('should use schema default when setting not found', async () => {
      // Register schema with default
      await schemaRegistry.register({
        keyPattern: 'test.with-default',
        schema: { type: 'string' },
        defaultValue: 'default-from-schema',
      });

      await schemaRegistry.loadSchemas();

      // Should return schema default
      const result = await settingsService.get('global', 'test.with-default');
      expect(result).toBe('default-from-schema');
    });

    it('should match wildcard patterns', async () => {
      // Register wildcard schema
      await schemaRegistry.register({
        keyPattern: 'test.email.*',
        schema: {
          type: 'string',
          format: 'email',
        },
      });

      await schemaRegistry.loadSchemas();

      // Valid email should succeed
      await expect(
        settingsService.set('global', 'test.email.from', 'user@example.com')
      ).resolves.toBeDefined();

      // Invalid email should fail
      await expect(
        settingsService.set('global', 'test.email.to', 'not-an-email')
      ).rejects.toThrow();
    });
  });

  describe('Audit Logging', () => {
    it('should log setting creation', async () => {
      const logSpy = vi.spyOn(auditService, 'log');

      await settingsService.set('global', 'test.audit.create', 'test-value');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'setting',
          action: 'create',
          changes: expect.objectContaining({
            old: null,
            new: 'test-value',
          }),
        })
      );
    });

    it('should log setting update', async () => {
      // Create initial setting
      await settingsService.set('global', 'test.audit.update', 'old-value');

      const logSpy = vi.spyOn(auditService, 'log');

      // Update setting
      await settingsService.set('global', 'test.audit.update', 'new-value');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          changes: expect.objectContaining({
            old: 'old-value',
            new: 'new-value',
          }),
        })
      );
    });

    it('should log setting deletion', async () => {
      // Create setting
      await settingsService.set('global', 'test.audit.delete', 'value');

      const logSpy = vi.spyOn(auditService, 'log');

      // Delete setting
      await settingsService.delete('global', 'test.audit.delete');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          changes: expect.objectContaining({
            old: 'value',
          }),
        })
      );
    });

    it('should redact encrypted values in audit log', async () => {
      if (!encryptionService.isAvailable()) {
        console.warn('Encryption not configured, skipping test');
        return;
      }

      const logSpy = vi.spyOn(auditService, 'log');

      await settingsService.set('global', 'test.audit.encrypted', 'secret', {
        encrypted: true,
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            new: '[REDACTED]',
          }),
        })
      );
    });
  });

  describe('Plugin Settings Lifecycle', () => {
    it('should manage plugin settings independently', async () => {
      // Set plugin settings
      await settingsService.set('plugin_global', 'test.plugin.key', 'plugin-value', {
        scopeId: 'test-plugin',
      });

      // Verify retrieval
      const result = await settingsService.get('plugin_global', 'test.plugin.key', {
        scopeId: 'test-plugin',
      });
      expect(result).toBe('plugin-value');

      // List plugin settings
      const list = await settingsService.list('plugin_global', {
        scopeId: 'test-plugin',
      });
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]?.key).toBe('test.plugin.key');
    });

    it('should clean up plugin settings on uninstall', async () => {
      // Create multiple plugin settings
      await settingsService.set('plugin_global', 'test.cleanup.key1', 'value1', {
        scopeId: 'cleanup-plugin',
      });
      await settingsService.set('plugin_global', 'test.cleanup.key2', 'value2', {
        scopeId: 'cleanup-plugin',
      });
      await settingsService.set('plugin_tenant', 'test.cleanup.key3', 'value3', {
        scopeId: 'cleanup-plugin',
        organizationId: 'org-123',
      });

      // Delete all plugin settings
      const count = await settingsService.deletePluginSettings('cleanup-plugin');
      expect(count).toBe(3);

      // Verify deletion
      const remaining = await settingsService.list('plugin_global', {
        scopeId: 'cleanup-plugin',
      });
      expect(remaining.length).toBe(0);
    });
  });

  describe('List and Query', () => {
    beforeEach(async () => {
      // Set up test data
      await settingsService.set('global', 'test.list.key1', 'value1');
      await settingsService.set('global', 'test.list.key2', 'value2');
      await settingsService.set('global', 'test.list.key3', 'value3');
      await settingsService.set('tenant', 'test.list.key1', 'tenant-value1', {
        organizationId: 'org-123',
      });
    });

    it('should list all settings for a scope', async () => {
      const list = await settingsService.list('global', {
        keyPrefix: 'test.list.',
      });

      expect(list.length).toBe(3);
      expect(list.map(s => s.key)).toContain('test.list.key1');
      expect(list.map(s => s.key)).toContain('test.list.key2');
      expect(list.map(s => s.key)).toContain('test.list.key3');
    });

    it('should filter by key prefix', async () => {
      await settingsService.set('global', 'test.other.key', 'other-value');

      const list = await settingsService.list('global', {
        keyPrefix: 'test.list.',
      });

      expect(list.every(s => s.key.startsWith('test.list.'))).toBe(true);
    });

    it('should filter by organization', async () => {
      const list = await settingsService.list('tenant', {
        organizationId: 'org-123',
        keyPrefix: 'test.list.',
      });

      expect(list.length).toBe(1);
      expect(list[0]?.key).toBe('test.list.key1');
      expect(list[0]?.value).toBe('tenant-value1');
    });
  });

  describe('Value Type Inference', () => {
    it('should infer correct value types', async () => {
      await settingsService.set('global', 'test.type.string', 'string-value');
      await settingsService.set('global', 'test.type.number', 42);
      await settingsService.set('global', 'test.type.boolean', true);
      await settingsService.set('global', 'test.type.json', { key: 'value' });

      const stringMeta = await settingsService.getWithMetadata('global', 'test.type.string');
      expect(stringMeta?.valueType).toBe('string');

      const numberMeta = await settingsService.getWithMetadata('global', 'test.type.number');
      expect(numberMeta?.valueType).toBe('number');

      const booleanMeta = await settingsService.getWithMetadata('global', 'test.type.boolean');
      expect(booleanMeta?.valueType).toBe('boolean');

      const jsonMeta = await settingsService.getWithMetadata('global', 'test.type.json');
      expect(jsonMeta?.valueType).toBe('json');
    });
  });
});
