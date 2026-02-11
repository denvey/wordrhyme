/**
 * Plugin File/Asset/Storage Capability Unit Tests
 *
 * Tests for plugin capabilities related to file and asset management.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPluginFileCapability } from '../../plugins/capabilities/file.capability';
import { createPluginAssetCapability } from '../../plugins/capabilities/asset.capability';
import { createPluginStorageCapability } from '../../plugins/capabilities/storage.capability';

describe('Plugin File Capability', () => {
  let mockFileService: {
    upload: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockFileService = {
      upload: vi.fn(),
      get: vi.fn(),
      download: vi.fn(),
      getSignedUrl: vi.fn(),
      delete: vi.fn(),
    };
  });

  describe('createPluginFileCapability', () => {
    it('should require organization context for operations', async () => {
      const capability = createPluginFileCapability(
        'com.test.plugin',
        undefined, // No organization
        mockFileService as any
      );

      await expect(
        capability.upload({
          content: Buffer.from('test'),
          filename: 'test.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('File operations require organization context');
    });

    it('should upload file with plugin attribution', async () => {
      const mockFile = {
        id: 'file-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 4,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFileService.upload.mockResolvedValue(mockFile);

      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any
      );

      const result = await capability.upload({
        content: Buffer.from('test'),
        filename: 'test.txt',
        mimeType: 'text/plain',
      });

      expect(result.id).toBe('file-123');
      expect(mockFileService.upload).toHaveBeenCalledWith(
        Buffer.from('test'),
        expect.objectContaining({
          filename: 'test.txt',
          contentType: 'text/plain',
          organizationId: 'org-123',
          uploadedBy: 'plugin:com.test.plugin',
          metadata: expect.objectContaining({
            _sourcePlugin: 'com.test.plugin',
          }),
        })
      );
    });

    it('should enforce file size limits', async () => {
      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any,
        { maxFileSize: 100 } // 100 bytes limit
      );

      await expect(
        capability.upload({
          content: Buffer.alloc(200), // 200 bytes
          filename: 'large.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('File size 200 exceeds maximum 100 bytes');
    });

    it('should enforce MIME type restrictions', async () => {
      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any,
        { allowedMimeTypes: ['image/*'] }
      );

      await expect(
        capability.upload({
          content: Buffer.from('test'),
          filename: 'test.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('File type text/plain is not allowed');
    });

    it('should allow wildcard MIME types', async () => {
      const mockFile = {
        id: 'file-123',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 4,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFileService.upload.mockResolvedValue(mockFile);

      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any,
        { allowedMimeTypes: ['image/*'] }
      );

      const result = await capability.upload({
        content: Buffer.from('test'),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.id).toBe('file-123');
    });

    it('should get file by ID', async () => {
      const mockFile = {
        id: 'file-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 4,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFileService.get.mockResolvedValue(mockFile);

      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any
      );

      const result = await capability.get('file-123');

      expect(result?.id).toBe('file-123');
      expect(mockFileService.get).toHaveBeenCalledWith('file-123', 'org-123');
    });

    it('should get signed URL', async () => {
      mockFileService.getSignedUrl.mockResolvedValue('https://signed-url.example.com');

      const capability = createPluginFileCapability(
        'com.test.plugin',
        'org-123',
        mockFileService as any
      );

      const result = await capability.getSignedUrl('file-123', { expiresIn: 7200 });

      expect(result.url).toBe('https://signed-url.example.com');
      expect(result.expiresIn).toBe(7200);
    });
  });
});

describe('Plugin Asset Capability', () => {
  let mockAssetService: {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getVariantUrl: ReturnType<typeof vi.fn>;
    getVariants: ReturnType<typeof vi.fn>;
  };

  let mockAuditService: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAssetService = {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getVariantUrl: vi.fn(),
      getVariants: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn(),
    };
  });

  describe('createPluginAssetCapability', () => {
    it('should require organization context for operations', async () => {
      const capability = createPluginAssetCapability(
        'com.test.plugin',
        undefined,
        mockAssetService as any
      );

      await expect(capability.create('file-123')).rejects.toThrow(
        'Asset operations require organization context'
      );
    });

    it('should create asset with plugin attribution', async () => {
      const mockAsset = {
        id: 'asset-123',
        fileId: 'file-123',
        type: 'image',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAssetService.create.mockResolvedValue(mockAsset);

      const capability = createPluginAssetCapability(
        'com.test.plugin',
        'org-123',
        mockAssetService as any,
        mockAuditService as any
      );

      const result = await capability.create('file-123', {
        alt: 'Test image',
        tags: ['test'],
      });

      expect(result.id).toBe('asset-123');
      expect(mockAssetService.create).toHaveBeenCalledWith(
        'file-123',
        'org-123',
        'plugin:com.test.plugin',
        expect.objectContaining({
          alt: 'Test image',
          tags: ['test'],
        })
      );
    });

    it('should log audit events on create', async () => {
      const mockAsset = {
        id: 'asset-123',
        fileId: 'file-123',
        type: 'image',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAssetService.create.mockResolvedValue(mockAsset);

      const capability = createPluginAssetCapability(
        'com.test.plugin',
        'org-123',
        mockAssetService as any,
        mockAuditService as any
      );

      await capability.create('file-123');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'asset',
          entityId: 'asset-123',
          organizationId: 'org-123',
          action: 'plugin_create',
          metadata: expect.objectContaining({
            pluginId: 'com.test.plugin',
          }),
        })
      );
    });

    it('should list assets with filtering', async () => {
      mockAssetService.list.mockResolvedValue({
        items: [{ id: 'asset-1' }, { id: 'asset-2' }],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const capability = createPluginAssetCapability(
        'com.test.plugin',
        'org-123',
        mockAssetService as any
      );

      const result = await capability.list({
        type: 'image',
        tags: ['nature'],
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(2);
      expect(mockAssetService.list).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          type: 'image',
          tags: ['nature'],
        })
      );
    });
  });
});

describe('Plugin Storage Capability', () => {
  let mockRegistry: {
    has: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    resetInstance: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRegistry = {
      has: vi.fn(),
      register: vi.fn(),
      list: vi.fn(),
      resetInstance: vi.fn(),
    };
  });

  describe('createPluginStorageCapability', () => {
    it('should require storage.provider capability in manifest', async () => {
      const capability = createPluginStorageCapability(
        'com.test.plugin',
        { capabilities: {} }, // No storage.provider
        mockRegistry as any
      );

      await expect(
        capability.registerProvider({
          type: 's3',
          name: 'S3 Storage',
          configSchema: {},
          factory: () => ({} as any),
        })
      ).rejects.toThrow("must declare 'storage.provider' capability");
    });

    it('should register provider with namespaced type', async () => {
      mockRegistry.has.mockReturnValue(false);

      const capability = createPluginStorageCapability(
        'com.test.plugin',
        { capabilities: { storage: { provider: true } } },
        mockRegistry as any
      );

      const mockFactory = vi.fn();

      await capability.registerProvider({
        type: 's3',
        name: 'S3 Storage',
        configSchema: { type: 'object' },
        factory: mockFactory,
      });

      expect(mockRegistry.register).toHaveBeenCalledWith(
        'plugin_com_test_plugin_s3', // Namespaced type
        expect.any(Function),
        expect.objectContaining({
          displayName: 'S3 Storage',
        }),
        'com.test.plugin'
      );
    });

    it('should prevent duplicate registration', async () => {
      mockRegistry.has.mockReturnValue(true);

      const capability = createPluginStorageCapability(
        'com.test.plugin',
        { capabilities: { storage: { provider: true } } },
        mockRegistry as any
      );

      await expect(
        capability.registerProvider({
          type: 's3',
          name: 'S3 Storage',
          configSchema: {},
          factory: () => ({} as any),
        })
      ).rejects.toThrow("already registered");
    });

    it('should list only plugin providers', async () => {
      mockRegistry.list.mockReturnValue([
        { type: 'plugin_com_test_plugin_s3', displayName: 'S3', pluginId: 'com.test.plugin' },
        { type: 'local', displayName: 'Local', pluginId: 'core' },
        { type: 'plugin_other_plugin_oss', displayName: 'OSS', pluginId: 'other.plugin' },
      ]);

      const capability = createPluginStorageCapability(
        'com.test.plugin',
        { capabilities: { storage: { provider: true } } },
        mockRegistry as any
      );

      const providers = await capability.listProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0].type).toBe('s3'); // Without namespace prefix
      expect(providers[0].pluginId).toBe('com.test.plugin');
    });
  });
});
