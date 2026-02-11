/**
 * LocalStorageProvider Unit Tests
 *
 * Tests for local file system storage provider.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { LocalStorageProvider } from '../../storage/providers/local-storage.provider.js';
import { StorageError, StorageErrorType } from '../../storage/storage-provider.interface.js';

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  const testUploadDir = './test-uploads';

  beforeEach(() => {
    // Set test environment
    process.env['UPLOAD_DIR'] = testUploadDir;
    process.env['UPLOAD_BASE_URL'] = '/test-uploads';

    provider = new LocalStorageProvider();
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testUploadDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Reset environment
    delete process.env['UPLOAD_DIR'];
    delete process.env['UPLOAD_BASE_URL'];
  });

  describe('upload', () => {
    it('should upload a file successfully', async () => {
      const content = Buffer.from('test file content');
      const result = await provider.upload({
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
        isPublic: true,
      });

      expect(result.storageKey).toMatch(/^org-123\/\d{4}\/\d{2}\/.+\.txt$/);
      expect(result.publicUrl).toBe(`/test-uploads/${result.storageKey}`);
      expect(result.checksum).toBeTruthy();
      expect(result.checksum).toHaveLength(32); // MD5 hash length

      // Verify file exists
      const fullPath = path.join(testUploadDir, result.storageKey);
      const fileContent = await fs.readFile(fullPath);
      expect(fileContent.toString()).toBe('test file content');
    });

    it('should sanitize filename to prevent path traversal', async () => {
      const content = Buffer.from('test');
      const result = await provider.upload({
        organizationId: 'org-123',
        filename: '../../../etc/passwd',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      // Filename should be sanitized
      expect(result.storageKey).not.toContain('..');
      expect(result.storageKey).not.toContain('/etc/passwd');
    });

    it('should generate unique filenames for same filename', async () => {
      const content = Buffer.from('test');

      const result1 = await provider.upload({
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      const result2 = await provider.upload({
        organizationId: 'org-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      expect(result1.storageKey).not.toBe(result2.storageKey);
    });

    it('should organize files by organization and date', async () => {
      const content = Buffer.from('test');
      const result = await provider.upload({
        organizationId: 'org-456',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      expect(result.storageKey).toMatch(new RegExp(`^org-456/${year}/${month}/`));
    });

    it('should not generate public URL for private files', async () => {
      const content = Buffer.from('test');
      const result = await provider.upload({
        organizationId: 'org-123',
        filename: 'private.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
        isPublic: false,
      });

      expect(result.publicUrl).toBeUndefined();
    });
  });

  describe('download', () => {
    it('should download an existing file', async () => {
      // Upload a file first
      const uploadContent = Buffer.from('download test content');
      const uploadResult = await provider.upload({
        organizationId: 'org-123',
        filename: 'download.txt',
        mimeType: 'text/plain',
        size: uploadContent.length,
        content: uploadContent,
      });

      // Download the file
      const downloadResult = await provider.download(uploadResult.storageKey);

      expect(downloadResult.content.toString()).toBe('download test content');
      expect(downloadResult.mimeType).toBe('text/plain');
      expect(downloadResult.size).toBe(uploadContent.length);
    });

    it('should throw NOT_FOUND error for non-existent file', async () => {
      await expect(
        provider.download('org-123/2024/01/nonexistent.txt')
      ).rejects.toThrow(StorageError);

      try {
        await provider.download('org-123/2024/01/nonexistent.txt');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.NOT_FOUND);
      }
    });

    it('should infer correct MIME type from extension', async () => {
      const testCases = [
        { filename: 'test.jpg', expectedMime: 'image/jpeg' },
        { filename: 'test.png', expectedMime: 'image/png' },
        { filename: 'test.pdf', expectedMime: 'application/pdf' },
        { filename: 'test.json', expectedMime: 'application/json' },
        { filename: 'test.unknown', expectedMime: 'application/octet-stream' },
      ];

      for (const testCase of testCases) {
        const content = Buffer.from('test');
        const uploadResult = await provider.upload({
          organizationId: 'org-123',
          filename: testCase.filename,
          mimeType: 'application/octet-stream',
          size: content.length,
          content,
        });

        const downloadResult = await provider.download(uploadResult.storageKey);
        expect(downloadResult.mimeType).toBe(testCase.expectedMime);
      }
    });
  });

  describe('delete', () => {
    it('should delete an existing file', async () => {
      // Upload a file first
      const content = Buffer.from('delete test');
      const uploadResult = await provider.upload({
        organizationId: 'org-123',
        filename: 'delete.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      // Delete the file
      const deleted = await provider.delete(uploadResult.storageKey);
      expect(deleted).toBe(true);

      // Verify file no longer exists
      const exists = await provider.exists(uploadResult.storageKey);
      expect(exists).toBe(false);
    });

    it('should return false for non-existent file', async () => {
      const deleted = await provider.delete('org-123/2024/01/nonexistent.txt');
      expect(deleted).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const content = Buffer.from('exists test');
      const uploadResult = await provider.upload({
        organizationId: 'org-123',
        filename: 'exists.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      const exists = await provider.exists(uploadResult.storageKey);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await provider.exists('org-123/2024/01/nonexistent.txt');
      expect(exists).toBe(false);
    });
  });

  describe('getUrl', () => {
    it('should generate URL with base path', async () => {
      const url = await provider.getUrl('org-123/2024/01/test.txt');
      expect(url).toBe('/test-uploads/org-123/2024/01/test.txt');
    });

    it('should add query parameters when specified', async () => {
      const url = await provider.getUrl('org-123/2024/01/test.txt', {
        disposition: 'attachment',
        filename: 'download.txt',
      });

      expect(url).toContain('disposition=attachment');
      expect(url).toContain('filename=download.txt');
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const content = Buffer.from('metadata test');
      const uploadResult = await provider.upload({
        organizationId: 'org-123',
        filename: 'metadata.txt',
        mimeType: 'text/plain',
        size: content.length,
        content,
      });

      const metadata = await provider.getMetadata(uploadResult.storageKey);

      expect(metadata.size).toBe(content.length);
      expect(metadata.mimeType).toBe('text/plain');
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('should throw NOT_FOUND for non-existent file', async () => {
      await expect(
        provider.getMetadata('org-123/2024/01/nonexistent.txt')
      ).rejects.toThrow(StorageError);
    });
  });

  describe('provider name', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('local');
    });
  });
});
