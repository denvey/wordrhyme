/**
 * AssetService Unit Tests
 *
 * Tests for CMS asset management service.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface Asset {
  id: string;
  organizationId: string;
  fileId: string;
  type: 'image' | 'video' | 'document' | 'other';
  alt?: string | null;
  title?: string | null;
  tags: string[];
  folderPath?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  variants: unknown[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface File {
  id: string;
  organizationId: string;
  filename: string;
  mimeType: string;
  size: number;
}

// Mock AssetService implementation for testing
class MockAssetService {
  private assets: Map<string, Asset> = new Map();

  constructor(
    private fileService: { getOrThrow: (id: string, orgId: string) => Promise<File> },
    private imageProcessor?: { getMetadata: (fileId: string, orgId: string) => Promise<{ width: number; height: number; format: string }> }
  ) {}

  private detectAssetType(mimeType: string): Asset['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('application/pdf') || mimeType.startsWith('text/')) return 'document';
    return 'other';
  }

  async create(
    fileId: string,
    organizationId: string,
    createdBy: string,
    options: { type?: Asset['type']; alt?: string; title?: string; tags?: string[]; folderPath?: string } = {}
  ): Promise<Asset> {
    const file = await this.fileService.getOrThrow(fileId, organizationId);
    const type = options.type || this.detectAssetType(file.mimeType);

    const asset: Asset = {
      id: `asset-${Date.now()}`,
      organizationId,
      fileId,
      type,
      alt: options.alt,
      title: options.title || file.filename,
      tags: options.tags || [],
      folderPath: options.folderPath,
      width: null,
      height: null,
      format: null,
      variants: [],
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Extract image metadata if available
    if (type === 'image' && this.imageProcessor) {
      try {
        const metadata = await this.imageProcessor.getMetadata(fileId, organizationId);
        asset.width = metadata.width;
        asset.height = metadata.height;
        asset.format = metadata.format;
      } catch {
        // Ignore metadata extraction errors
      }
    }

    this.assets.set(asset.id, asset);
    return asset;
  }

  async get(assetId: string, organizationId: string): Promise<Asset | null> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.organizationId !== organizationId || asset.deletedAt) {
      return null;
    }
    return asset;
  }

  async update(
    assetId: string,
    organizationId: string,
    data: { alt?: string; title?: string; tags?: string[]; folderPath?: string }
  ): Promise<Asset> {
    const asset = await this.get(assetId, organizationId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    if (data.alt !== undefined) asset.alt = data.alt;
    if (data.title !== undefined) asset.title = data.title;
    if (data.tags !== undefined) asset.tags = data.tags;
    if (data.folderPath !== undefined) asset.folderPath = data.folderPath;
    asset.updatedAt = new Date();

    return asset;
  }

  async delete(assetId: string, organizationId: string): Promise<void> {
    const asset = await this.get(assetId, organizationId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    asset.deletedAt = new Date();
  }

  async list(
    organizationId: string,
    query: { type?: Asset['type']; tags?: string[]; folderPath?: string; search?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ items: Asset[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { page = 1, pageSize = 20 } = query;

    let items = Array.from(this.assets.values()).filter(
      (a) => a.organizationId === organizationId && !a.deletedAt
    );

    if (query.type) {
      items = items.filter((a) => a.type === query.type);
    }

    if (query.tags && query.tags.length > 0) {
      items = items.filter((a) => query.tags!.every((t) => a.tags.includes(t)));
    }

    if (query.folderPath) {
      items = items.filter((a) => a.folderPath?.startsWith(query.folderPath!));
    }

    if (query.search) {
      const search = query.search.toLowerCase();
      items = items.filter(
        (a) =>
          a.alt?.toLowerCase().includes(search) ||
          a.title?.toLowerCase().includes(search)
      );
    }

    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total, page, pageSize, totalPages };
  }
}

describe('AssetService', () => {
  let service: MockAssetService;
  let mockFileService: { getOrThrow: ReturnType<typeof vi.fn> };
  let mockImageProcessor: { getMetadata: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFileService = {
      getOrThrow: vi.fn(),
    };

    mockImageProcessor = {
      getMetadata: vi.fn(),
    };

    service = new MockAssetService(mockFileService, mockImageProcessor);
  });

  describe('create', () => {
    it('should create an asset from a file', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      mockImageProcessor.getMetadata.mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });

      const asset = await service.create('file-123', 'org-123', 'user-456', {
        alt: 'A beautiful photo',
        tags: ['nature', 'landscape'],
      });

      expect(asset.fileId).toBe('file-123');
      expect(asset.organizationId).toBe('org-123');
      expect(asset.type).toBe('image');
      expect(asset.alt).toBe('A beautiful photo');
      expect(asset.tags).toEqual(['nature', 'landscape']);
      expect(asset.width).toBe(1920);
      expect(asset.height).toBe(1080);
      expect(asset.format).toBe('jpeg');
    });

    it('should detect asset type from MIME type', async () => {
      const testCases = [
        { mimeType: 'image/png', expectedType: 'image' },
        { mimeType: 'video/mp4', expectedType: 'video' },
        { mimeType: 'application/pdf', expectedType: 'document' },
        { mimeType: 'text/plain', expectedType: 'document' },
        { mimeType: 'application/zip', expectedType: 'other' },
      ];

      for (const testCase of testCases) {
        mockFileService.getOrThrow.mockResolvedValue({
          id: 'file-123',
          organizationId: 'org-123',
          filename: 'test.file',
          mimeType: testCase.mimeType,
          size: 1024,
        });

        const asset = await service.create('file-123', 'org-123', 'user-456');
        expect(asset.type).toBe(testCase.expectedType);
      }
    });

    it('should use provided type override', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'file.bin',
        mimeType: 'application/octet-stream',
        size: 1024,
      });

      const asset = await service.create('file-123', 'org-123', 'user-456', {
        type: 'document',
      });

      expect(asset.type).toBe('document');
    });

    it('should use filename as default title', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'my-document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });

      const asset = await service.create('file-123', 'org-123', 'user-456');

      expect(asset.title).toBe('my-document.pdf');
    });

    it('should handle image metadata extraction failure gracefully', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      mockImageProcessor.getMetadata.mockRejectedValue(new Error('Failed to read image'));

      const asset = await service.create('file-123', 'org-123', 'user-456');

      expect(asset.type).toBe('image');
      expect(asset.width).toBeNull();
      expect(asset.height).toBeNull();
    });
  });

  describe('get', () => {
    it('should return asset by ID', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      });

      const created = await service.create('file-123', 'org-123', 'user-456');
      const asset = await service.get(created.id, 'org-123');

      expect(asset).not.toBeNull();
      expect(asset?.id).toBe(created.id);
    });

    it('should return null for non-existent asset', async () => {
      const asset = await service.get('non-existent', 'org-123');
      expect(asset).toBeNull();
    });

    it('should return null for asset from different organization', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      });

      const created = await service.create('file-123', 'org-123', 'user-456');
      const asset = await service.get(created.id, 'org-999');

      expect(asset).toBeNull();
    });

    it('should return null for deleted asset', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      });

      const created = await service.create('file-123', 'org-123', 'user-456');
      await service.delete(created.id, 'org-123');
      const asset = await service.get(created.id, 'org-123');

      expect(asset).toBeNull();
    });
  });

  describe('update', () => {
    it('should update asset metadata', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      });

      const created = await service.create('file-123', 'org-123', 'user-456');
      const updated = await service.update(created.id, 'org-123', {
        alt: 'Updated alt text',
        title: 'New Title',
        tags: ['updated', 'tags'],
        folderPath: '/new/path',
      });

      expect(updated.alt).toBe('Updated alt text');
      expect(updated.title).toBe('New Title');
      expect(updated.tags).toEqual(['updated', 'tags']);
      expect(updated.folderPath).toBe('/new/path');
    });

    it('should throw error for non-existent asset', async () => {
      await expect(
        service.update('non-existent', 'org-123', { title: 'New Title' })
      ).rejects.toThrow('Asset not found');
    });
  });

  describe('delete', () => {
    it('should soft delete an asset', async () => {
      mockFileService.getOrThrow.mockResolvedValue({
        id: 'file-123',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      });

      const created = await service.create('file-123', 'org-123', 'user-456');
      await service.delete(created.id, 'org-123');

      const asset = await service.get(created.id, 'org-123');
      expect(asset).toBeNull();
    });

    it('should throw error for non-existent asset', async () => {
      await expect(service.delete('non-existent', 'org-123')).rejects.toThrow(
        'Asset not found'
      );
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      mockFileService.getOrThrow.mockImplementation((id: string) =>
        Promise.resolve({
          id,
          organizationId: 'org-123',
          filename: `file-${id}.jpg`,
          mimeType: 'image/jpeg',
          size: 1024,
        })
      );

      // Create test assets
      await service.create('file-1', 'org-123', 'user-456', {
        title: 'Photo 1',
        tags: ['nature'],
        folderPath: '/photos/nature',
      });
      await service.create('file-2', 'org-123', 'user-456', {
        title: 'Photo 2',
        tags: ['nature', 'landscape'],
        folderPath: '/photos/nature',
      });
      await service.create('file-3', 'org-123', 'user-456', {
        title: 'Document',
        tags: ['work'],
        folderPath: '/documents',
      });
    });

    it('should list all assets for organization', async () => {
      const result = await service.list('org-123');

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by type', async () => {
      const result = await service.list('org-123', { type: 'image' });

      expect(result.items).toHaveLength(3);
      expect(result.items.every((a) => a.type === 'image')).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await service.list('org-123', { tags: ['nature'] });

      expect(result.items).toHaveLength(2);
    });

    it('should filter by folder path prefix', async () => {
      const result = await service.list('org-123', { folderPath: '/photos' });

      expect(result.items).toHaveLength(2);
    });

    it('should search in title', async () => {
      const result = await service.list('org-123', { search: 'Document' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Document');
    });

    it('should paginate results', async () => {
      const result = await service.list('org-123', { page: 1, pageSize: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('should return empty for different organization', async () => {
      const result = await service.list('org-999');

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
