/**
 * S3 Storage Plugin Integration Tests
 *
 * Tests for plugin lifecycle hooks and integration with WordRhyme.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onLoad, onUnload } from '../src/index.js';
import type { PluginContext } from '@wordrhyme/plugin';

describe('S3 Storage Plugin', () => {
  let mockContext: PluginContext;
  let mockLogger: any;
  let mockStorage: any;
  let mockSettings: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockStorage = {
      registerProvider: vi.fn().mockResolvedValue(undefined),
      unregisterProvider: vi.fn().mockResolvedValue(undefined),
      listProviders: vi.fn().mockResolvedValue([]),
    };

    mockSettings = {
      get: vi.fn(),
      set: vi.fn(),
    };

    mockContext = {
      pluginId: 'storage-s3',
      logger: mockLogger,
      storage: mockStorage,
      settings: mockSettings,
      permissions: {} as any,
    };
  });

  describe('onLoad', () => {
    it('should register S3 storage provider with valid configuration', async () => {
      const config = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      };

      mockSettings.get.mockResolvedValue(config);

      await onLoad(mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith('Loading S3 storage plugin');
      expect(mockSettings.get).toHaveBeenCalledWith('config');
      expect(mockStorage.registerProvider).toHaveBeenCalledTimes(1);
      expect(mockStorage.registerProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 's3',
          name: 'S3 Compatible Storage',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'S3 storage provider registered successfully',
        expect.objectContaining({
          bucket: 'test-bucket',
          region: 'us-east-1',
        })
      );
    });

    it('should handle missing storage capability', async () => {
      const contextWithoutStorage = {
        ...mockContext,
        storage: undefined,
      };

      await onLoad(contextWithoutStorage);

      expect(mockLogger.error).toHaveBeenCalledWith('Storage capability not available');
      expect(mockStorage.registerProvider).not.toHaveBeenCalled();
    });

    it('should warn if configuration is missing', async () => {
      mockSettings.get.mockResolvedValue(null);

      await onLoad(mockContext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'S3 storage plugin not configured. Please configure in plugin settings.'
      );
      expect(mockStorage.registerProvider).not.toHaveBeenCalled();
    });

    it('should error if required configuration fields are missing', async () => {
      const incompleteConfig = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        // Missing accessKeyId and secretAccessKey
      };

      mockSettings.get.mockResolvedValue(incompleteConfig);

      await onLoad(mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'S3 storage plugin missing required configuration'
      );
      expect(mockStorage.registerProvider).not.toHaveBeenCalled();
    });

    it('should register provider with Cloudflare R2 configuration', async () => {
      const r2Config = {
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        region: 'auto',
        bucket: 'my-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      };

      mockSettings.get.mockResolvedValue(r2Config);

      await onLoad(mockContext);

      expect(mockStorage.registerProvider).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'S3 storage provider registered successfully',
        expect.objectContaining({
          endpoint: 'https://account-id.r2.cloudflarestorage.com',
        })
      );
    });

    it('should register provider with MinIO configuration', async () => {
      const minioConfig = {
        endpoint: 'https://minio.example.com',
        region: 'us-east-1',
        bucket: 'my-bucket',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
        forcePathStyle: true,
      };

      mockSettings.get.mockResolvedValue(minioConfig);

      await onLoad(mockContext);

      expect(mockStorage.registerProvider).toHaveBeenCalledTimes(1);
    });

    it('should register provider with CDN configuration', async () => {
      const cdnConfig = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        publicUrlBase: 'https://cdn.example.com',
      };

      mockSettings.get.mockResolvedValue(cdnConfig);

      await onLoad(mockContext);

      expect(mockStorage.registerProvider).toHaveBeenCalledTimes(1);
    });

    it('should provide factory function that creates S3StorageProvider', async () => {
      const config = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      };

      mockSettings.get.mockResolvedValue(config);

      await onLoad(mockContext);

      const registerCall = mockStorage.registerProvider.mock.calls[0][0];
      expect(registerCall.factory).toBeDefined();
      expect(typeof registerCall.factory).toBe('function');

      // Test factory function
      const provider = registerCall.factory(config);
      expect(provider).toBeDefined();
      expect(provider.type).toBe('s3');
    });

    it('should include config schema in registration', async () => {
      const config = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      };

      mockSettings.get.mockResolvedValue(config);

      await onLoad(mockContext);

      const registerCall = mockStorage.registerProvider.mock.calls[0][0];
      expect(registerCall.configSchema).toBeDefined();
      expect(registerCall.configSchema.type).toBe('object');
      expect(registerCall.configSchema.required).toContain('region');
      expect(registerCall.configSchema.required).toContain('bucket');
      expect(registerCall.configSchema.required).toContain('accessKeyId');
      expect(registerCall.configSchema.required).toContain('secretAccessKey');
    });
  });

  describe('onUnload', () => {
    it('should unregister S3 storage provider', async () => {
      await onUnload(mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith('Unloading S3 storage plugin');
      expect(mockStorage.unregisterProvider).toHaveBeenCalledWith('s3');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'S3 storage provider unregistered successfully'
      );
    });

    it('should handle missing storage capability', async () => {
      const contextWithoutStorage = {
        ...mockContext,
        storage: undefined,
      };

      await onUnload(contextWithoutStorage);

      expect(mockStorage.unregisterProvider).not.toHaveBeenCalled();
    });

    it('should handle unregister errors gracefully', async () => {
      const error = new Error('Unregister failed');
      mockStorage.unregisterProvider.mockRejectedValue(error);

      await onUnload(mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to unregister S3 storage provider',
        expect.objectContaining({ error })
      );
    });
  });

  describe('plugin lifecycle', () => {
    it('should complete full lifecycle (load -> unload)', async () => {
      const config = {
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      };

      mockSettings.get.mockResolvedValue(config);

      // Load plugin
      await onLoad(mockContext);
      expect(mockStorage.registerProvider).toHaveBeenCalledTimes(1);

      // Unload plugin
      await onUnload(mockContext);
      expect(mockStorage.unregisterProvider).toHaveBeenCalledTimes(1);
    });
  });
});
