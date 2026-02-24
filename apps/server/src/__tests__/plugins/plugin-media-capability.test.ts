/**
 * Plugin Media/Storage Capability Unit Tests
 *
 * Tests for unified media capability (replaces file + asset capabilities).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPluginMediaCapability } from '../../plugins/capabilities/media.capability';
import { createPluginStorageCapability } from '../../plugins/capabilities/storage.capability';

describe('Plugin Media Capability', () => {
  let mockMediaService: {
    upload: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getVariantUrl: ReturnType<typeof vi.fn>;
    getVariants: ReturnType<typeof vi.fn>;
  };

  const mockMedia = {
    id: 'media-123',
    filename: 'test.txt',
    mimeType: 'text/plain',
    size: 4,
    isPublic: false,
    alt: null,
    title: null,
    tags: [],
    folderPath: null,
    width: null,
    height: null,
    format: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockMediaService = {
      upload: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      download: vi.fn(),
      getSignedUrl: vi.fn(),
      list: vi.fn(),
      getVariantUrl: vi.fn(),
      getVariants: vi.fn(),
    };
  });

  describe('createPluginMediaCapability', () => {
    it('should require organization context for operations', async () => {
      const capability = createPluginMediaCapability(
        'com.test.plugin',
        undefined, // No organization
        mockMediaService as any
      );

      await expect(
        capability.upload({
          content: Buffer.from('test'),
          filename: 'test.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('Media operations require organization context');
    });

    it('should upload media with plugin attribution', async () => {
      mockMediaService.upload.mockResolvedValue(mockMedia);

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.upload({
        content: Buffer.from('test'),
        filename: 'test.txt',
        mimeType: 'text/plain',
      });

      expect(result.id).toBe('media-123');
      expect(mockMediaService.upload).toHaveBeenCalledWith(
        Buffer.from('test'),
        expect.objectContaining({
          filename: 'test.txt',
          contentType: 'text/plain',
          organizationId: 'org-123',
          createdBy: 'plugin:com.test.plugin',
          metadata: expect.objectContaining({
            _sourcePlugin: 'com.test.plugin',
          }),
        })
      );
    });

    it('should enforce file size limits', async () => {
      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any,
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
      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any,
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
      mockMediaService.upload.mockResolvedValue({
        ...mockMedia,
        id: 'media-456',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any,
        { allowedMimeTypes: ['image/*'] }
      );

      const result = await capability.upload({
        content: Buffer.from('test'),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.id).toBe('media-456');
    });

    it('should get media by ID', async () => {
      mockMediaService.get.mockResolvedValue(mockMedia);

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.get('media-123');

      expect(result?.id).toBe('media-123');
      expect(mockMediaService.get).toHaveBeenCalledWith('media-123', 'org-123');
    });

    it('should return null for non-existent media', async () => {
      mockMediaService.get.mockResolvedValue(null);

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should update media metadata', async () => {
      mockMediaService.update.mockResolvedValue({
        ...mockMedia,
        alt: 'Updated alt',
        tags: ['tag1'],
      });

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.update('media-123', {
        alt: 'Updated alt',
        tags: ['tag1'],
      });

      expect(result.alt).toBe('Updated alt');
      expect(mockMediaService.update).toHaveBeenCalledWith(
        'media-123',
        'org-123',
        expect.objectContaining({
          alt: 'Updated alt',
          tags: ['tag1'],
        })
      );
    });

    it('should delete media', async () => {
      mockMediaService.delete.mockResolvedValue(undefined);

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      await capability.delete('media-123');

      expect(mockMediaService.delete).toHaveBeenCalledWith('media-123', 'org-123');
    });

    it('should get signed URL', async () => {
      mockMediaService.getSignedUrl.mockResolvedValue('https://signed-url.example.com');

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.getSignedUrl('media-123', { expiresIn: 7200 });

      expect(result.url).toBe('https://signed-url.example.com');
      expect(result.expiresIn).toBe(7200);
      expect(mockMediaService.getSignedUrl).toHaveBeenCalledWith(
        'media-123',
        'org-123',
        expect.objectContaining({ expiresIn: 7200, operation: 'get' })
      );
    });

    it('should list media with filtering', async () => {
      mockMediaService.list.mockResolvedValue({
        items: [mockMedia, { ...mockMedia, id: 'media-456' }],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const result = await capability.list({
        mimeType: 'image/*',
        tags: ['nature'],
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(2);
      expect(mockMediaService.list).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          mimeType: 'image/*',
          tags: ['nature'],
          page: 1,
          pageSize: 20,
        })
      );
    });

    it('should get variants for media', async () => {
      mockMediaService.getVariants.mockResolvedValue([
        { id: 'var-1', variantName: 'thumbnail', width: 200, height: 200, format: 'webp' },
        { id: 'var-2', variantName: 'medium', width: 800, height: 600, format: 'webp' },
      ]);

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const variants = await capability.getVariants('media-123');

      expect(variants).toHaveLength(2);
      expect(variants[0]).toEqual({
        name: 'thumbnail',
        mediaId: 'var-1',
        width: 200,
        height: 200,
        format: 'webp',
      });
      expect(mockMediaService.getVariants).toHaveBeenCalledWith('media-123', 'org-123');
    });

    it('should get variant URL', async () => {
      mockMediaService.getVariantUrl.mockResolvedValue('https://cdn.example.com/thumb.webp');

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      const url = await capability.getVariantUrl('media-123', 'thumbnail');

      expect(url).toBe('https://cdn.example.com/thumb.webp');
      expect(mockMediaService.getVariantUrl).toHaveBeenCalledWith(
        'media-123',
        'org-123',
        'thumbnail'
      );
    });

    it('should pass optional fields on upload', async () => {
      mockMediaService.upload.mockResolvedValue({
        ...mockMedia,
        alt: 'My image',
        tags: ['test'],
        folderPath: '/uploads',
        isPublic: true,
      });

      const capability = createPluginMediaCapability(
        'com.test.plugin',
        'org-123',
        mockMediaService as any
      );

      await capability.upload({
        content: Buffer.from('test'),
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        alt: 'My image',
        tags: ['test'],
        folderPath: '/uploads',
        isPublic: true,
      });

      expect(mockMediaService.upload).toHaveBeenCalledWith(
        Buffer.from('test'),
        expect.objectContaining({
          alt: 'My image',
          tags: ['test'],
          folderPath: '/uploads',
          isPublic: true,
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
        { capabilities: {} } as any, // No storage.provider
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
        { capabilities: { storage: { provider: true } } } as any,
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
        { capabilities: { storage: { provider: true } } } as any,
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
        { capabilities: { storage: { provider: true } } } as any,
        mockRegistry as any
      );

      const providers = await capability.listProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0]!.type).toBe('s3'); // Without namespace prefix
      expect(providers[0]!.pluginId).toBe('com.test.plugin');
    });
  });
});
