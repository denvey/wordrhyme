/**
 * StorageService Unit Tests
 *
 * Tests for unified storage service with database integration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../../storage/storage.service.js';
import { LocalStorageProvider } from '../../storage/providers/local-storage.provider.js';
import { StorageError, StorageErrorType } from '../../storage/storage-provider.interface.js';
import type { File } from '@wordrhyme/db';

// Mock dependencies
vi.mock('../../db/index.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../context/async-local-storage.js', () => ({
  requestContextStorage: {
    getStore: vi.fn(),
  },
}));

describe('StorageService', () => {
  let service: StorageService;
  let mockLocalProvider: LocalStorageProvider;

  beforeEach(() => {
    // Create mock provider
    mockLocalProvider = {
      name: 'local',
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
    } as any;

    service = new StorageService(mockLocalProvider);
  });

  describe('upload', () => {
    it('should upload file and create database record', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      // Mock context
      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
        userId: 'user-456',
      } as any);

      // Mock provider upload
      vi.spyOn(mockLocalProvider, 'upload').mockResolvedValue({
        storageKey: 'org-123/2024/01/test.txt',
        publicUrl: '/uploads/org-123/2024/01/test.txt',
        checksum: 'abc123',
      });

      // Mock database insert
      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
        storageProvider: 'local',
        storageKey: 'org-123/2024/01/test.txt',
        storageBucket: null,
        publicUrl: '/uploads/org-123/2024/01/test.txt',
        isPublic: true,
        metadata: {},
        checksum: 'abc123',
        uploadedBy: 'user-456',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockFile]),
        }),
      } as any);

      // Upload file
      const content = Buffer.from('test content');
      const result = await service.upload({
        filename: 'test.txt',
        mimeType: 'text/plain',
        content,
        isPublic: true,
      });

      expect(result.file).toEqual(mockFile);
      expect(result.publicUrl).toBe('/uploads/org-123/2024/01/test.txt');

      // Verify provider was called
      expect(mockLocalProvider.upload).toHaveBeenCalledWith({
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
        isPublic: true,
        metadata: undefined,
      });

      // Verify database insert was called
      expect(mockDb.db.insert).toHaveBeenCalled();
    });

    it('should throw error if organizationId is missing', async () => {
      const mockContext = await import('../../context/async-local-storage.js');

      // Mock context without organizationId
      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue(null);

      const content = Buffer.from('test');

      await expect(
        service.upload({
          filename: 'test.txt',
          mimeType: 'text/plain',
          content,
        })
      ).rejects.toThrow(StorageError);

      try {
        await service.upload({
          filename: 'test.txt',
          mimeType: 'text/plain',
          content,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.PERMISSION_DENIED);
      }
    });

    it('should rollback upload if database insert fails', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
        userId: 'user-456',
      } as any);

      vi.spyOn(mockLocalProvider, 'upload').mockResolvedValue({
        storageKey: 'org-123/2024/01/test.txt',
        checksum: 'abc123',
      });

      // Mock database insert failure
      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      // Mock provider delete for rollback
      vi.spyOn(mockLocalProvider, 'delete').mockResolvedValue(true);

      const content = Buffer.from('test');

      await expect(
        service.upload({
          filename: 'test.txt',
          mimeType: 'text/plain',
          content,
        })
      ).rejects.toThrow('Failed to create file record');

      // Verify rollback was attempted
      expect(mockLocalProvider.delete).toHaveBeenCalledWith('org-123/2024/01/test.txt');
    });

    it('should use provided organizationId over context', async () => {
      const mockContext = await import('../../context/async-local-storage.js');
      const mockDb = await import('../../db/index.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-999',
        userId: 'user-456',
      } as any);

      vi.spyOn(mockLocalProvider, 'upload').mockResolvedValue({
        storageKey: 'org-123/2024/01/test.txt',
        checksum: 'abc123',
      });

      vi.spyOn(mockDb.db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'file-789',
            organizationId: 'org-123',
          } as File]),
        }),
      } as any);

      const content = Buffer.from('test');
      await service.upload({
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        content,
      });

      // Verify correct organizationId was used
      expect(mockLocalProvider.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        })
      );
    });
  });

  describe('download', () => {
    it('should download file by ID', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      // Mock database query
      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        storageProvider: 'local',
        storageKey: 'org-123/2024/01/test.txt',
        deletedAt: null,
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      // Mock provider download
      const mockContent = Buffer.from('file content');
      vi.spyOn(mockLocalProvider, 'download').mockResolvedValue({
        content: mockContent,
        mimeType: 'text/plain',
        size: mockContent.length,
      });

      const result = await service.download('file-789');

      expect(result).toEqual(mockContent);
      expect(mockLocalProvider.download).toHaveBeenCalledWith('org-123/2024/01/test.txt');
    });

    it('should throw NOT_FOUND for non-existent file', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      await expect(service.download('file-999')).rejects.toThrow(StorageError);
    });

    it('should throw NOT_FOUND for deleted file', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        deletedAt: new Date(),
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      await expect(service.download('file-789')).rejects.toThrow(StorageError);
    });
  });

  describe('delete', () => {
    it('should delete file and soft delete database record', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        storageProvider: 'local',
        storageKey: 'org-123/2024/01/test.txt',
        deletedAt: null,
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      vi.spyOn(mockLocalProvider, 'delete').mockResolvedValue(true);

      vi.spyOn(mockDb.db, 'update').mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const result = await service.delete('file-789');

      expect(result).toBe(true);
      expect(mockLocalProvider.delete).toHaveBeenCalledWith('org-123/2024/01/test.txt');
      expect(mockDb.db.update).toHaveBeenCalled();
    });
  });

  describe('getUrl', () => {
    it('should return public URL for public files', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        isPublic: true,
        publicUrl: '/uploads/org-123/2024/01/test.txt',
        deletedAt: null,
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      const url = await service.getUrl('file-789');

      expect(url).toBe('/uploads/org-123/2024/01/test.txt');
      expect(mockLocalProvider.getUrl).not.toHaveBeenCalled();
    });

    it('should generate URL from provider for private files', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        isPublic: false,
        storageProvider: 'local',
        storageKey: 'org-123/2024/01/private.txt',
        deletedAt: null,
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      vi.spyOn(mockLocalProvider, 'getUrl').mockResolvedValue('/signed-url');

      const url = await service.getUrl('file-789');

      expect(url).toBe('/signed-url');
      expect(mockLocalProvider.getUrl).toHaveBeenCalledWith(
        'org-123/2024/01/private.txt',
        undefined
      );
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      const mockFile: File = {
        id: 'file-789',
        organizationId: 'org-123',
        deletedAt: null,
      } as File;

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFile]),
          }),
        }),
      } as any);

      const exists = await service.exists('file-789');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const mockDb = await import('../../db/index.js');
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue({
        organizationId: 'org-123',
      } as any);

      vi.spyOn(mockDb.db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const exists = await service.exists('file-999');
      expect(exists).toBe(false);
    });

    it('should return false if organizationId is missing', async () => {
      const mockContext = await import('../../context/async-local-storage.js');

      vi.spyOn(mockContext.requestContextStorage, 'getStore').mockReturnValue(null);

      const exists = await service.exists('file-789');
      expect(exists).toBe(false);
    });
  });
});
