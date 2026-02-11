/**
 * SettingsService Unit Tests
 *
 * Tests for settings service with cascade resolution, encryption, and multi-tenant isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../../settings/settings.service.js';
import { EncryptionService } from '../../settings/encryption.service.js';
import { SettingsCacheService } from '../../settings/cache.service.js';
import { SchemaRegistryService } from '../../settings/schema-registry.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Setting, SettingScope } from '@wordrhyme/db';

// Mock dependencies
vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('SettingsService', () => {
  let service: SettingsService;
  let encryptionService: EncryptionService;
  let cacheService: SettingsCacheService;
  let schemaRegistry: SchemaRegistryService;
  let auditService: AuditService;

  beforeEach(() => {
    // Create mock services
    encryptionService = {
      isAvailable: vi.fn().mockReturnValue(true),
      encrypt: vi.fn((value) => ({
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'tag',
        keyVersion: 1,
      })),
      decrypt: vi.fn((encrypted) => 'decrypted-value'),
      getCurrentKeyVersion: vi.fn().mockReturnValue(1),
    } as any;

    cacheService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidatePattern: vi.fn().mockResolvedValue(undefined),
      buildKey: vi.fn((scope, key, orgId, scopeId) =>
        `${scope}:${scopeId || ''}:${orgId || ''}:${key}`
      ),
    } as any;

    schemaRegistry = {
      validate: vi.fn().mockReturnValue({ valid: true, schemaVersion: 1 }),
      getDefault: vi.fn().mockReturnValue(null),
    } as any;

    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as any;

    service = new SettingsService(
      encryptionService,
      cacheService,
      schemaRegistry,
      auditService
    );
  });

  describe('Cascade Resolution', () => {
    it('should resolve tenant override over global', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');

      // Mock tenant setting exists
      mockFindSetting.mockResolvedValueOnce({
        id: '1',
        scope: 'tenant',
        key: 'test.key',
        value: 'tenant-value',
        encrypted: false,
      } as Setting);

      const result = await service.get('tenant', 'test.key', {
        organizationId: 'org-123',
      });

      expect(result).toBe('tenant-value');
      expect(mockFindSetting).toHaveBeenCalledWith(
        'tenant',
        'test.key',
        'org-123'
      );
    });

    it('should fall back to global when tenant not found', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');

      // Mock tenant not found, global exists
      mockFindSetting
        .mockResolvedValueOnce(undefined) // tenant
        .mockResolvedValueOnce({
          id: '2',
          scope: 'global',
          key: 'test.key',
          value: 'global-value',
          encrypted: false,
        } as Setting);

      const result = await (service as any).resolveCoreSetting(
        'test.key',
        'org-123',
        undefined
      );

      expect(result).toBe('global-value');
    });

    it('should use schema default when no setting found', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      vi.spyOn(schemaRegistry, 'getDefault').mockReturnValue('schema-default');

      const result = await (service as any).resolveCoreSetting(
        'test.key',
        'org-123',
        undefined
      );

      expect(result).toBe('schema-default');
    });

    it('should use provided default when nothing else found', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      vi.spyOn(schemaRegistry, 'getDefault').mockReturnValue(null);

      const result = await (service as any).resolveCoreSetting(
        'test.key',
        'org-123',
        'provided-default'
      );

      expect(result).toBe('provided-default');
    });
  });

  describe('Plugin Settings Resolution', () => {
    it('should resolve plugin tenant over plugin global', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');

      mockFindSetting.mockResolvedValueOnce({
        id: '1',
        scope: 'plugin_tenant',
        scopeId: 'my-plugin',
        organizationId: 'org-123',
        key: 'api_key',
        value: 'tenant-key',
        encrypted: false,
      } as Setting);

      const result = await (service as any).resolvePluginSetting(
        'api_key',
        'my-plugin',
        'org-123',
        undefined
      );

      expect(result).toBe('tenant-key');
    });

    it('should fall back to plugin global when tenant not found', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');

      mockFindSetting
        .mockResolvedValueOnce(undefined) // plugin_tenant
        .mockResolvedValueOnce({
          id: '2',
          scope: 'plugin_global',
          scopeId: 'my-plugin',
          key: 'api_key',
          value: 'global-key',
          encrypted: false,
        } as Setting);

      const result = await (service as any).resolvePluginSetting(
        'api_key',
        'my-plugin',
        'org-123',
        undefined
      );

      expect(result).toBe('global-key');
    });

    it('should not fall back to core settings', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      const result = await (service as any).resolvePluginSetting(
        'api_key',
        'my-plugin',
        'org-123',
        'default-value'
      );

      expect(result).toBe('default-value');
      // Should only check plugin scopes, not core
      expect(mockFindSetting).toHaveBeenCalledTimes(2);
    });
  });

  describe('Encryption', () => {
    it('should encrypt sensitive values on set', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'api_key',
            value: { ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyVersion: 1 },
            encrypted: true,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'api_key', 'secret-value', {
        encrypted: true,
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith('secret-value');
    });

    it('should decrypt encrypted values on get', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue({
        id: '1',
        scope: 'global',
        key: 'api_key',
        value: { ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyVersion: 1 },
        encrypted: true,
      } as Setting);

      const result = await service.get('global', 'api_key');

      expect(encryptionService.decrypt).toHaveBeenCalled();
      expect(result).toBe('decrypted-value');
    });

    it('should not encrypt when encryption not requested', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'public_key',
            value: 'plain-value',
            encrypted: false,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'public_key', 'plain-value', {
        encrypted: false,
      });

      expect(encryptionService.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('Schema Validation', () => {
    it('should validate value against schema on set', async () => {
      vi.spyOn(schemaRegistry, 'validate').mockReturnValue({
        valid: true,
        schemaVersion: 1,
      });

      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'test.key',
            value: 'valid-value',
            encrypted: false,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'test.key', 'valid-value');

      expect(schemaRegistry.validate).toHaveBeenCalledWith('test.key', 'valid-value');
    });

    it('should reject invalid values', async () => {
      vi.spyOn(schemaRegistry, 'validate').mockReturnValue({
        valid: false,
        errors: ['Value must be a string'],
      });

      await expect(
        service.set('global', 'test.key', 123)
      ).rejects.toThrow('Invalid value for setting "test.key": Value must be a string');
    });
  });

  describe('Audit Logging', () => {
    it('should log setting creation', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'test.key',
            value: 'test-value',
            encrypted: false,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'test.key', 'test-value');

      expect(auditService.log).toHaveBeenCalledWith(
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
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'update').mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: '1',
              scope: 'global',
              key: 'test.key',
              value: 'new-value',
              encrypted: false,
            }]),
          }),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue({
        id: '1',
        scope: 'global',
        key: 'test.key',
        value: 'old-value',
        encrypted: false,
      } as Setting);

      await service.set('global', 'test.key', 'new-value');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          changes: expect.objectContaining({
            old: 'old-value',
            new: 'new-value',
          }),
        })
      );
    });

    it('should redact encrypted values in audit log', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'api_key',
            value: { ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyVersion: 1 },
            encrypted: true,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'api_key', 'secret', { encrypted: true });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            new: '[REDACTED]',
          }),
        })
      );
    });
  });

  describe('Cache Management', () => {
    it('should check cache before database query', async () => {
      vi.spyOn(cacheService, 'get').mockResolvedValue({
        id: '1',
        scope: 'global',
        key: 'test.key',
        value: 'cached-value',
        encrypted: false,
      } as Setting);

      const mockDb = await import('../../db/index.js');
      const selectSpy = vi.spyOn(mockDb.db, 'select');

      const result = await (service as any).findSetting('global', 'test.key');

      expect(result.value).toBe('cached-value');
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it('should invalidate cache on set', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: '1',
            scope: 'global',
            key: 'test.key',
            value: 'new-value',
            encrypted: false,
          }]),
        }),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue(undefined);

      await service.set('global', 'test.key', 'new-value');

      expect(cacheService.invalidate).toHaveBeenCalled();
    });

    it('should invalidate cache on delete', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'delete').mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const mockFindSetting = vi.spyOn(service as any, 'findSetting');
      mockFindSetting.mockResolvedValue({
        id: '1',
        scope: 'global',
        key: 'test.key',
        value: 'value',
        encrypted: false,
      } as Setting);

      await service.delete('global', 'test.key');

      expect(cacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate settings by organization', async () => {
      const mockFindSetting = vi.spyOn(service as any, 'findSetting');

      // Different organizations should get different settings
      mockFindSetting
        .mockResolvedValueOnce({
          id: '1',
          scope: 'tenant',
          organizationId: 'org-1',
          key: 'test.key',
          value: 'org-1-value',
          encrypted: false,
        } as Setting)
        .mockResolvedValueOnce({
          id: '2',
          scope: 'tenant',
          organizationId: 'org-2',
          key: 'test.key',
          value: 'org-2-value',
          encrypted: false,
        } as Setting);

      const result1 = await service.get('tenant', 'test.key', {
        organizationId: 'org-1',
      });
      const result2 = await service.get('tenant', 'test.key', {
        organizationId: 'org-2',
      });

      expect(result1).toBe('org-1-value');
      expect(result2).toBe('org-2-value');
    });

    it('should validate scope parameters', () => {
      expect(() => {
        (service as any).validateScopeParams('global', 'org-123', undefined);
      }).toThrow('Global scope should not have organizationId');

      expect(() => {
        (service as any).validateScopeParams('tenant', undefined, undefined);
      }).toThrow('Tenant scope requires organizationId');

      expect(() => {
        (service as any).validateScopeParams('plugin_global', undefined, undefined);
      }).toThrow('Plugin global scope requires scopeId');

      expect(() => {
        (service as any).validateScopeParams('plugin_tenant', undefined, 'plugin-id');
      }).toThrow('Plugin tenant scope requires organizationId');
    });
  });

  describe('Plugin Settings Cleanup', () => {
    it('should delete all settings for a plugin', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: '1' },
            { id: '2' },
            { id: '3' },
          ]),
        }),
      } as any);

      const count = await service.deletePluginSettings('my-plugin');

      expect(count).toBe(3);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete_bulk',
          metadata: expect.objectContaining({
            pluginId: 'my-plugin',
            count: 3,
            reason: 'plugin_uninstall',
          }),
        })
      );
    });

    it('should invalidate plugin cache patterns', async () => {
      const mockDb = await import('../../db/index.js');
      vi.spyOn(mockDb.db, 'delete').mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: '1' }]),
        }),
      } as any);

      await service.deletePluginSettings('my-plugin');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'plugin_global:my-plugin:*'
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'plugin_tenant:my-plugin:*'
      );
    });
  });
});
