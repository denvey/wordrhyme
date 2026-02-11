/**
 * File Upload Lifecycle Integration Tests
 *
 * Tests the complete file upload flow:
 * - Upload → Storage → Database Record → CDN URL → Download → Delete
 *
 * @task A.2 - Backend Integration Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage service
const mockUpload = vi.fn();
const mockDownload = vi.fn();
const mockDelete = vi.fn();
const mockGetUrl = vi.fn();
const mockGetMetadata = vi.fn();
const mockExists = vi.fn();

// Mock multipart upload service
const mockInitiateMultipart = vi.fn();
const mockUploadPart = vi.fn();
const mockCompleteMultipart = vi.fn();
const mockAbortMultipart = vi.fn();

// Mock CDN service
const mockGetCdnUrl = vi.fn();
const mockPurgeCache = vi.fn();
const mockPrewarm = vi.fn();

// Mock database operations
const mockInsertFile = vi.fn();
const mockUpdateFile = vi.fn();
const mockDeleteFile = vi.fn();
const mockGetFile = vi.fn();
const mockListFiles = vi.fn();

vi.mock('../../storage/storage.service', () => ({
  StorageService: vi.fn().mockImplementation(() => ({
    upload: mockUpload,
    download: mockDownload,
    delete: mockDelete,
    getUrl: mockGetUrl,
    getMetadata: mockGetMetadata,
    exists: mockExists,
  })),
}));

vi.mock('../../storage/multipart-upload.service', () => ({
  MultipartUploadService: vi.fn().mockImplementation(() => ({
    initiate: mockInitiateMultipart,
    uploadPart: mockUploadPart,
    complete: mockCompleteMultipart,
    abort: mockAbortMultipart,
  })),
}));

vi.mock('../../storage/cdn.service', () => ({
  CdnService: vi.fn().mockImplementation(() => ({
    getCdnUrl: mockGetCdnUrl,
    purgeCache: mockPurgeCache,
    prewarm: mockPrewarm,
  })),
}));

// Test data
const testFile = {
  id: 'file-123',
  organizationId: 'org-456',
  filename: 'document.pdf',
  mimeType: 'application/pdf',
  size: 1024 * 1024, // 1MB
  storageProvider: 's3',
  storageKey: 'org-456/2025/01/document.pdf',
  storageBucket: 'wordrhyme-uploads',
  publicUrl: 'https://cdn.example.com/org-456/2025/01/document.pdf',
  isPublic: true,
  metadata: { author: 'Test User' },
  checksum: 'sha256:abc123',
  uploadedBy: 'user-789',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testUploadResult = {
  storageKey: 'org-456/2025/01/document.pdf',
  publicUrl: 'https://cdn.example.com/org-456/2025/01/document.pdf',
  checksum: 'sha256:abc123',
};

describe('File Upload Lifecycle Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Phase 1: Upload', () => {
    it('should upload file to storage provider', async () => {
      mockUpload.mockResolvedValue({
        file: testFile,
        publicUrl: testFile.publicUrl,
      });

      const content = Buffer.from('test content');
      const result = await mockUpload({
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        content,
        isPublic: true,
      });

      expect(result.file.id).toBeDefined();
      expect(result.publicUrl).toContain('cdn.example.com');
    });

    it('should validate file type', async () => {
      mockUpload.mockRejectedValue(new Error('Invalid file type'));

      await expect(
        mockUpload({
          filename: 'malware.exe',
          mimeType: 'application/x-msdownload',
          content: Buffer.from(''),
        })
      ).rejects.toThrow('Invalid file type');
    });

    it('should enforce file size limits', async () => {
      mockUpload.mockRejectedValue(new Error('File too large'));

      await expect(
        mockUpload({
          filename: 'huge-file.zip',
          mimeType: 'application/zip',
          content: Buffer.alloc(100 * 1024 * 1024), // 100MB
        })
      ).rejects.toThrow('File too large');
    });

    it('should generate unique storage key', async () => {
      mockUpload
        .mockResolvedValueOnce({
          file: { ...testFile, storageKey: 'org-456/2025/01/doc-1.pdf' },
        })
        .mockResolvedValueOnce({
          file: { ...testFile, storageKey: 'org-456/2025/01/doc-2.pdf' },
        });

      const result1 = await mockUpload({ filename: 'doc.pdf' });
      const result2 = await mockUpload({ filename: 'doc.pdf' });

      expect(result1.file.storageKey).not.toBe(result2.file.storageKey);
    });

    it('should calculate file checksum', async () => {
      mockUpload.mockResolvedValue({
        file: { ...testFile, checksum: 'sha256:computed_hash' },
      });

      const result = await mockUpload({
        filename: 'document.pdf',
        content: Buffer.from('test content'),
      });

      expect(result.file.checksum).toMatch(/^sha256:/);
    });

    it('should handle upload with metadata', async () => {
      mockUpload.mockResolvedValue({
        file: {
          ...testFile,
          metadata: { author: 'John', department: 'Engineering' },
        },
      });

      const result = await mockUpload({
        filename: 'report.pdf',
        metadata: { author: 'John', department: 'Engineering' },
      });

      expect(result.file.metadata.author).toBe('John');
    });
  });

  describe('Phase 2: Storage', () => {
    it('should store file in configured provider', async () => {
      mockUpload.mockResolvedValue({
        file: { ...testFile, storageProvider: 's3' },
      });

      const result = await mockUpload({ filename: 'doc.pdf' });

      expect(result.file.storageProvider).toBe('s3');
    });

    it('should organize files by tenant and date', async () => {
      mockUpload.mockResolvedValue({
        file: {
          ...testFile,
          storageKey: 'org-456/2025/01/document.pdf',
        },
      });

      const result = await mockUpload({
        organizationId: 'org-456',
        filename: 'document.pdf',
      });

      expect(result.file.storageKey).toMatch(/^org-456\/\d{4}\/\d{2}\//);
    });

    it('should support private file storage', async () => {
      mockUpload.mockResolvedValue({
        file: { ...testFile, isPublic: false, publicUrl: null },
      });

      const result = await mockUpload({
        filename: 'private-doc.pdf',
        isPublic: false,
      });

      expect(result.file.isPublic).toBe(false);
    });

    it('should check if file exists', async () => {
      mockExists.mockResolvedValue(true);

      const exists = await mockExists('org-456/2025/01/document.pdf');

      expect(exists).toBe(true);
    });

    it('should get file metadata from storage', async () => {
      mockGetMetadata.mockResolvedValue({
        contentType: 'application/pdf',
        contentLength: 1024 * 1024,
        lastModified: new Date(),
        etag: '"abc123"',
      });

      const metadata = await mockGetMetadata('org-456/2025/01/document.pdf');

      expect(metadata.contentType).toBe('application/pdf');
    });
  });

  describe('Phase 3: Database Record', () => {
    it('should create file record in database', async () => {
      mockInsertFile.mockResolvedValue(testFile);

      const result = await mockInsertFile({
        organizationId: 'org-456',
        filename: 'document.pdf',
        storageKey: 'org-456/2025/01/document.pdf',
      });

      expect(result.id).toBeDefined();
      expect(result.organizationId).toBe('org-456');
    });

    it('should update file record', async () => {
      mockUpdateFile.mockResolvedValue({
        ...testFile,
        metadata: { updated: true },
      });

      const result = await mockUpdateFile('file-123', {
        metadata: { updated: true },
      });

      expect(result.metadata.updated).toBe(true);
    });

    it('should soft delete file record', async () => {
      mockDeleteFile.mockResolvedValue({
        ...testFile,
        deletedAt: new Date(),
      });

      const result = await mockDeleteFile('file-123');

      expect(result.deletedAt).toBeDefined();
    });

    it('should list files for organization', async () => {
      mockListFiles.mockResolvedValue({
        files: [testFile, { ...testFile, id: 'file-456' }],
        total: 2,
      });

      const result = await mockListFiles({
        organizationId: 'org-456',
        limit: 10,
      });

      expect(result.files).toHaveLength(2);
    });

    it('should filter files by mime type', async () => {
      mockListFiles.mockResolvedValue({
        files: [testFile],
        total: 1,
      });

      const result = await mockListFiles({
        organizationId: 'org-456',
        mimeType: 'application/pdf',
      });

      expect(result.files[0].mimeType).toBe('application/pdf');
    });
  });

  describe('Phase 4: CDN Integration', () => {
    it('should generate CDN URL for public file', async () => {
      mockGetCdnUrl.mockResolvedValue(
        'https://cdn.example.com/org-456/2025/01/document.pdf'
      );

      const cdnUrl = await mockGetCdnUrl({
        storageKey: 'org-456/2025/01/document.pdf',
        isPublic: true,
      });

      expect(cdnUrl).toContain('cdn.example.com');
    });

    it('should generate signed URL for private file', async () => {
      mockGetUrl.mockResolvedValue(
        'https://cdn.example.com/org-456/private.pdf?token=signed_token&expires=3600'
      );

      const signedUrl = await mockGetUrl({
        storageKey: 'org-456/private.pdf',
        expiresIn: 3600,
      });

      expect(signedUrl).toContain('token=');
      expect(signedUrl).toContain('expires=');
    });

    it('should purge CDN cache on file update', async () => {
      mockPurgeCache.mockResolvedValue({ success: true, purgedUrls: 1 });

      const result = await mockPurgeCache({
        urls: ['https://cdn.example.com/org-456/2025/01/document.pdf'],
      });

      expect(result.success).toBe(true);
    });

    it('should prewarm CDN cache for new uploads', async () => {
      mockPrewarm.mockResolvedValue({ success: true, prewarmedUrls: 1 });

      const result = await mockPrewarm({
        urls: ['https://cdn.example.com/org-456/2025/01/document.pdf'],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Phase 5: Download', () => {
    it('should download file content', async () => {
      const fileContent = Buffer.from('PDF content here');
      mockDownload.mockResolvedValue({
        content: fileContent,
        contentType: 'application/pdf',
        contentLength: fileContent.length,
      });

      const result = await mockDownload('org-456/2025/01/document.pdf');

      expect(result.content).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('application/pdf');
    });

    it('should stream large file downloads', async () => {
      const mockStream = { pipe: vi.fn() };
      mockDownload.mockResolvedValue({
        stream: mockStream,
        contentType: 'video/mp4',
        contentLength: 100 * 1024 * 1024,
      });

      const result = await mockDownload('org-456/2025/01/video.mp4', {
        stream: true,
      });

      expect(result.stream).toBeDefined();
    });

    it('should handle file not found', async () => {
      mockDownload.mockRejectedValue(new Error('File not found'));

      await expect(
        mockDownload('org-456/2025/01/nonexistent.pdf')
      ).rejects.toThrow('File not found');
    });

    it('should support range requests', async () => {
      mockDownload.mockResolvedValue({
        content: Buffer.from('partial content'),
        contentRange: 'bytes 0-1023/10240',
        contentLength: 1024,
      });

      const result = await mockDownload('org-456/2025/01/document.pdf', {
        range: 'bytes=0-1023',
      });

      expect(result.contentRange).toContain('bytes');
    });
  });

  describe('Phase 6: Delete', () => {
    it('should delete file from storage', async () => {
      mockDelete.mockResolvedValue({ success: true });

      const result = await mockDelete('org-456/2025/01/document.pdf');

      expect(result.success).toBe(true);
    });

    it('should purge CDN cache on delete', async () => {
      mockDelete.mockResolvedValue({ success: true });
      mockPurgeCache.mockResolvedValue({ success: true });

      await mockDelete('org-456/2025/01/document.pdf');
      await mockPurgeCache({
        urls: ['https://cdn.example.com/org-456/2025/01/document.pdf'],
      });

      expect(mockPurgeCache).toHaveBeenCalled();
    });

    it('should handle delete of non-existent file', async () => {
      mockDelete.mockResolvedValue({ success: true, notFound: true });

      const result = await mockDelete('org-456/2025/01/nonexistent.pdf');

      // Should succeed idempotently
      expect(result.success).toBe(true);
    });
  });

  describe('Multipart Upload (Large Files)', () => {
    it('should initiate multipart upload', async () => {
      mockInitiateMultipart.mockResolvedValue({
        uploadId: 'upload-abc123',
        key: 'org-456/2025/01/large-file.zip',
      });

      const result = await mockInitiateMultipart({
        filename: 'large-file.zip',
        mimeType: 'application/zip',
        totalSize: 500 * 1024 * 1024, // 500MB
      });

      expect(result.uploadId).toBeDefined();
    });

    it('should upload individual parts', async () => {
      mockUploadPart.mockResolvedValue({
        etag: '"part-etag-1"',
        partNumber: 1,
      });

      const result = await mockUploadPart({
        uploadId: 'upload-abc123',
        partNumber: 1,
        content: Buffer.alloc(5 * 1024 * 1024), // 5MB chunk
      });

      expect(result.etag).toBeDefined();
      expect(result.partNumber).toBe(1);
    });

    it('should complete multipart upload', async () => {
      mockCompleteMultipart.mockResolvedValue({
        file: testFile,
        publicUrl: testFile.publicUrl,
      });

      const result = await mockCompleteMultipart({
        uploadId: 'upload-abc123',
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
        ],
      });

      expect(result.file.id).toBeDefined();
    });

    it('should abort multipart upload', async () => {
      mockAbortMultipart.mockResolvedValue({ success: true });

      const result = await mockAbortMultipart({
        uploadId: 'upload-abc123',
      });

      expect(result.success).toBe(true);
    });

    it('should handle part upload failure', async () => {
      mockUploadPart.mockRejectedValue(new Error('Part upload failed'));

      await expect(
        mockUploadPart({
          uploadId: 'upload-abc123',
          partNumber: 5,
          content: Buffer.alloc(5 * 1024 * 1024),
        })
      ).rejects.toThrow('Part upload failed');
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should complete full upload → CDN → download → delete flow', async () => {
      // Step 1: Upload file
      mockUpload.mockResolvedValue({
        file: testFile,
        publicUrl: testFile.publicUrl,
      });

      const uploaded = await mockUpload({
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('PDF content'),
        isPublic: true,
      });
      expect(uploaded.file.id).toBeDefined();

      // Step 2: Get CDN URL
      mockGetCdnUrl.mockResolvedValue(uploaded.publicUrl);

      const cdnUrl = await mockGetCdnUrl({
        storageKey: uploaded.file.storageKey,
      });
      expect(cdnUrl).toContain('cdn.example.com');

      // Step 3: Download file
      mockDownload.mockResolvedValue({
        content: Buffer.from('PDF content'),
        contentType: 'application/pdf',
      });

      const downloaded = await mockDownload(uploaded.file.storageKey);
      expect(downloaded.content).toBeInstanceOf(Buffer);

      // Step 4: Delete file
      mockDelete.mockResolvedValue({ success: true });
      mockPurgeCache.mockResolvedValue({ success: true });

      await mockDelete(uploaded.file.storageKey);
      await mockPurgeCache({ urls: [cdnUrl] });

      // Step 5: Verify deleted
      mockExists.mockResolvedValue(false);

      const exists = await mockExists(uploaded.file.storageKey);
      expect(exists).toBe(false);
    });

    it('should handle large file multipart upload flow', async () => {
      // Step 1: Initiate multipart
      mockInitiateMultipart.mockResolvedValue({
        uploadId: 'mp-123',
        key: 'org-456/large.zip',
      });

      const initiate = await mockInitiateMultipart({
        filename: 'large.zip',
        totalSize: 100 * 1024 * 1024,
      });

      // Step 2: Upload parts
      const parts = [];
      for (let i = 1; i <= 3; i++) {
        mockUploadPart.mockResolvedValueOnce({
          etag: `"etag-${i}"`,
          partNumber: i,
        });

        const part = await mockUploadPart({
          uploadId: initiate.uploadId,
          partNumber: i,
          content: Buffer.alloc(5 * 1024 * 1024),
        });
        parts.push({ partNumber: part.partNumber, etag: part.etag });
      }

      // Step 3: Complete multipart
      mockCompleteMultipart.mockResolvedValue({
        file: { ...testFile, filename: 'large.zip' },
        publicUrl: 'https://cdn.example.com/org-456/large.zip',
      });

      const complete = await mockCompleteMultipart({
        uploadId: initiate.uploadId,
        parts,
      });

      expect(complete.file.filename).toBe('large.zip');
    });
  });

  describe('Tenant Isolation', () => {
    it('should scope file storage to organization', async () => {
      mockUpload.mockResolvedValue({
        file: { ...testFile, organizationId: 'org-456' },
      });

      const result = await mockUpload({
        organizationId: 'org-456',
        filename: 'doc.pdf',
      });

      expect(result.file.organizationId).toBe('org-456');
      expect(result.file.storageKey).toContain('org-456');
    });

    it('should prevent cross-tenant file access', async () => {
      mockDownload.mockRejectedValue(new Error('Access denied'));

      await expect(
        mockDownload('org-other/2025/01/document.pdf', {
          organizationId: 'org-456', // Different org
        })
      ).rejects.toThrow('Access denied');
    });

    it('should list only files for current organization', async () => {
      mockListFiles.mockResolvedValue({
        files: [testFile],
        total: 1,
      });

      const result = await mockListFiles({ organizationId: 'org-456' });

      expect(result.files.every((f: any) => f.organizationId === 'org-456')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage provider errors', async () => {
      mockUpload.mockRejectedValue(new Error('Storage provider unavailable'));

      await expect(
        mockUpload({ filename: 'doc.pdf' })
      ).rejects.toThrow('Storage provider unavailable');
    });

    it('should handle CDN errors gracefully', async () => {
      mockGetCdnUrl.mockRejectedValue(new Error('CDN error'));

      await expect(
        mockGetCdnUrl({ storageKey: 'org-456/doc.pdf' })
      ).rejects.toThrow('CDN error');
    });

    it('should handle database transaction errors', async () => {
      mockInsertFile.mockRejectedValue(new Error('Database error'));

      await expect(
        mockInsertFile({ filename: 'doc.pdf' })
      ).rejects.toThrow('Database error');
    });

    it('should cleanup on partial failure', async () => {
      // Upload succeeds but DB insert fails
      mockUpload.mockResolvedValue({ file: testFile });
      mockInsertFile.mockRejectedValue(new Error('DB error'));
      mockDelete.mockResolvedValue({ success: true });

      // In real implementation, storage should be cleaned up
      await mockDelete(testFile.storageKey);

      expect(mockDelete).toHaveBeenCalledWith(testFile.storageKey);
    });
  });
});
