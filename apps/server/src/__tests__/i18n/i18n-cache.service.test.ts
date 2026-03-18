/**
 * I18n Cache Service Unit Tests
 *
 * Tests for Redis caching with version-based invalidation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nCacheService, type CachedTranslations } from '../../i18n/i18n-cache.service';

// Mock cache instance
const mockCacheInstance = {
  get: vi.fn(),
  set: vi.fn(),
  invalidatePattern: vi.fn(),
};

// Mock CacheManager
const mockCacheManager = {
  forOrganization: vi.fn(() => mockCacheInstance),
};

describe('I18nCacheService', () => {
  let service: I18nCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create service with mocked CacheManager
    service = new I18nCacheService(mockCacheManager as any);
  });

  describe('getTranslations', () => {
    it('should return cached translations if present', async () => {
      const cachedData: CachedTranslations = {
        messages: { 'common.save': 'Save', 'common.cancel': 'Cancel' },
        version: '1706961234567',
        cachedAt: Date.now(),
      };
      mockCacheInstance.get.mockResolvedValue(cachedData);

      const result = await service.getTranslations('org-1', 'zh-CN', 'core');

      expect(result).toEqual(cachedData);
      expect(mockCacheManager.forOrganization).toHaveBeenCalledWith('org-1');
      expect(mockCacheInstance.get).toHaveBeenCalledWith('i18n:msg:org-1:zh-CN:core');
    });

    it('should return null if not cached', async () => {
      mockCacheInstance.get.mockResolvedValue(null);

      const result = await service.getTranslations('org-1', 'zh-CN', 'core');

      expect(result).toBeNull();
    });
  });

  describe('setTranslations', () => {
    it('should cache translations with version', async () => {
      mockCacheInstance.set.mockResolvedValue(undefined);

      const messages = { 'common.save': 'Save' };
      const version = await service.setTranslations('org-1', 'zh-CN', 'core', messages);

      expect(version).toMatch(/^\d+$/); // Timestamp format
      expect(mockCacheInstance.set).toHaveBeenCalledTimes(2); // messages + version

      // Check messages call
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        'i18n:msg:org-1:zh-CN:core',
        expect.objectContaining({
          messages,
          version,
        }),
        { ttl: 3600 } // CACHE_TTL.messages
      );

      // Check version call
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        'i18n:v:org-1:zh-CN:core',
        version,
        { ttl: 86400 } // CACHE_TTL.version
      );
    });
  });

  describe('getVersion', () => {
    it('should return cached version', async () => {
      mockCacheInstance.get.mockResolvedValue('1706961234567');

      const result = await service.getVersion('org-1', 'zh-CN', 'core');

      expect(result).toBe('1706961234567');
      expect(mockCacheInstance.get).toHaveBeenCalledWith('i18n:v:org-1:zh-CN:core');
    });

    it('should return null if not cached', async () => {
      mockCacheInstance.get.mockResolvedValue(null);

      const result = await service.getVersion('org-1', 'zh-CN', 'core');

      expect(result).toBeNull();
    });
  });

  describe('isVersionCurrent', () => {
    it('should return true if versions match', async () => {
      mockCacheInstance.get.mockResolvedValue('1706961234567');

      const result = await service.isVersionCurrent(
        'org-1',
        'zh-CN',
        'core',
        '1706961234567'
      );

      expect(result).toBe(true);
    });

    it('should return false if versions differ', async () => {
      mockCacheInstance.get.mockResolvedValue('1706961234567');

      const result = await service.isVersionCurrent(
        'org-1',
        'zh-CN',
        'core',
        '1706961200000'
      );

      expect(result).toBe(false);
    });

    it('should return false if not cached', async () => {
      mockCacheInstance.get.mockResolvedValue(null);

      const result = await service.isVersionCurrent(
        'org-1',
        'zh-CN',
        'core',
        '1706961234567'
      );

      expect(result).toBe(false);
    });
  });

  describe('invalidateNamespace', () => {
    it('should invalidate all locales for a namespace', async () => {
      mockCacheInstance.invalidatePattern.mockResolvedValue(undefined);

      await service.invalidateNamespace('org-1', 'core');

      expect(mockCacheInstance.invalidatePattern).toHaveBeenCalledWith(
        'i18n:msg:org-1:*:core'
      );
    });
  });

  describe('invalidateLocale', () => {
    it('should delete messages and versions for a specific locale', async () => {
      mockCacheInstance.invalidatePattern.mockResolvedValue(undefined);

      await service.invalidateLocale('org-1', 'zh-CN');

      expect(mockCacheInstance.invalidatePattern).toHaveBeenCalledWith(
        'i18n:msg:org-1:zh-CN:*'
      );
      expect(mockCacheInstance.invalidatePattern).toHaveBeenCalledWith(
        'i18n:v:org-1:zh-CN:*'
      );
    });
  });

  describe('invalidateOrganization', () => {
    it('should delete all i18n cache for an organization', async () => {
      mockCacheInstance.invalidatePattern.mockResolvedValue(undefined);

      await service.invalidateOrganization('org-1');

      expect(mockCacheInstance.invalidatePattern).toHaveBeenCalledWith(
        'i18n:msg:org-1:*'
      );
      expect(mockCacheInstance.invalidatePattern).toHaveBeenCalledWith(
        'i18n:v:org-1:*'
      );
    });
  });
});
