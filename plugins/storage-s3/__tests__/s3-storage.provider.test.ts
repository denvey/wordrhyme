/**
 * S3 Storage Provider Unit Tests
 *
 * Tests for S3-compatible storage provider with mocked AWS SDK.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { S3StorageProvider, type S3ProviderConfig } from '../src/s3-storage.provider.js';
import type { PluginStorageUploadInput } from '@wordrhyme/plugin';

// Use vi.hoisted to ensure mockSend is available when vi.mock is hoisted
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

// Mock AWS SDK - class defined inside factory
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
      constructor(_config: any) {}
    },
    PutObjectCommand: class { constructor(public params: any) {} },
    GetObjectCommand: class { constructor(public params: any) {} },
    DeleteObjectCommand: class { constructor(public params: any) {} },
    HeadObjectCommand: class { constructor(public params: any) {} },
    CreateMultipartUploadCommand: class { constructor(public params: any) {} },
    UploadPartCommand: class { constructor(public params: any) {} },
    CompleteMultipartUploadCommand: class { constructor(public params: any) {} },
    AbortMultipartUploadCommand: class { constructor(public params: any) {} },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;

  const defaultConfig: S3ProviderConfig = {
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    provider = new S3StorageProvider(defaultConfig);
  });

  describe('constructor', () => {
    it('should initialize with AWS S3 configuration', () => {
      expect(provider.type).toBe('s3');
    });

    it('should initialize with custom endpoint for R2', () => {
      const r2Config: S3ProviderConfig = {
        ...defaultConfig,
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        region: 'auto',
      };

      const r2Provider = new S3StorageProvider(r2Config);
      expect(r2Provider.type).toBe('s3');
    });

    it('should initialize with MinIO configuration', () => {
      const minioConfig: S3ProviderConfig = {
        ...defaultConfig,
        endpoint: 'https://minio.example.com',
        forcePathStyle: true,
      };

      const minioProvider = new S3StorageProvider(minioConfig);
      expect(minioProvider.type).toBe('s3');
    });
  });

  describe('upload', () => {
    it('should upload a file successfully', async () => {
      mockSend.mockResolvedValue({});

      const input: PluginStorageUploadInput = {
        key: 'test/file.txt',
        body: Buffer.from('test content'),
        contentType: 'text/plain',
        metadata: { userId: '123' },
      };

      const result = await provider.upload(input);

      expect(result.key).toBe('test/file.txt');
      expect(result.size).toBe(12);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should upload file with metadata', async () => {
      mockSend.mockResolvedValue({});

      const input: PluginStorageUploadInput = {
        key: 'public/image.jpg',
        body: Buffer.from('image data'),
        contentType: 'image/jpeg',
        metadata: { userId: '123' },
      };

      const result = await provider.upload(input);

      expect(result.key).toBe('public/image.jpg');
      expect(result.size).toBe(10);
    });

    it('should handle upload without metadata', async () => {
      mockSend.mockResolvedValue({});

      const input: PluginStorageUploadInput = {
        key: 'file.txt',
        body: Buffer.from('data'),
        contentType: 'text/plain',
      };

      const result = await provider.upload(input);

      expect(result.key).toBe('file.txt');
      expect(result.size).toBe(4);
    });
  });

  describe('download', () => {
    it('should download file content', async () => {
      const mockContent = Buffer.from('file content');

      // Mock async iterator for Body stream
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield mockContent;
        },
      };

      mockSend.mockResolvedValue({
        Body: mockBody,
      });

      const content = await provider.download('test/file.txt');

      expect(content.toString()).toBe('file content');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if file not found', async () => {
      mockSend.mockResolvedValue({
        Body: null,
      });

      await expect(provider.download('nonexistent.txt')).rejects.toThrow(
        'File not found: nonexistent.txt'
      );
    });

    it('should handle large files with multiple chunks', async () => {
      const chunk1 = Buffer.from('chunk1');
      const chunk2 = Buffer.from('chunk2');
      const chunk3 = Buffer.from('chunk3');

      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield chunk1;
          yield chunk2;
          yield chunk3;
        },
      };

      mockSend.mockResolvedValue({
        Body: mockBody,
      });

      const content = await provider.download('large-file.bin');

      expect(content.toString()).toBe('chunk1chunk2chunk3');
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      mockSend.mockResolvedValue({});

      await provider.delete('test/file.txt');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should not throw error if file does not exist', async () => {
      mockSend.mockResolvedValue({});

      await expect(provider.delete('nonexistent.txt')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true if file exists', async () => {
      mockSend.mockResolvedValue({
        ContentLength: 1024,
      });

      const exists = await provider.exists('test/file.txt');

      expect(exists).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return false if file does not exist', async () => {
      const error: any = new Error('Not Found');
      error.name = 'NotFound';
      mockSend.mockRejectedValue(error);

      const exists = await provider.exists('nonexistent.txt');

      expect(exists).toBe(false);
    });

    it('should return false for 404 status code', async () => {
      const error: any = new Error('Not Found');
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValue(error);

      const exists = await provider.exists('nonexistent.txt');

      expect(exists).toBe(false);
    });

    it('should throw error for other errors', async () => {
      const error = new Error('Network error');
      mockSend.mockRejectedValue(error);

      await expect(provider.exists('test/file.txt')).rejects.toThrow('Network error');
    });
  });

  describe('getSignedUrl', () => {
    it('should generate signed URL for download', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const url = await provider.getSignedUrl('test/file.txt', {
        expiresIn: 3600,
        operation: 'get',
      });

      expect(url).toBe('https://signed-url.example.com');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('should generate signed URL for upload', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const url = await provider.getSignedUrl('test/upload.txt', {
        expiresIn: 3600,
        operation: 'put',
        contentType: 'text/plain',
      });

      expect(url).toBe('https://signed-url.example.com');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('multipart upload', () => {
    it('should initiate multipart upload', async () => {
      mockSend.mockResolvedValue({
        UploadId: 'test-upload-id',
      });

      const uploadId = await provider.initiateMultipartUpload('large-file.bin');

      expect(uploadId).toBe('test-upload-id');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if upload ID not returned', async () => {
      mockSend.mockResolvedValue({});

      await expect(
        provider.initiateMultipartUpload('large-file.bin')
      ).rejects.toThrow('Failed to initiate multipart upload');
    });

    it('should upload a part', async () => {
      mockSend.mockResolvedValue({
        ETag: '"etag-123"',
      });

      const result = await provider.uploadPart(
        'key|upload-id',
        1,
        Buffer.from('part data')
      );

      expect(result.partNumber).toBe(1);
      expect(result.etag).toBe('"etag-123"');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if ETag not returned', async () => {
      mockSend.mockResolvedValue({});

      await expect(
        provider.uploadPart('key|upload-id', 1, Buffer.from('data'))
      ).rejects.toThrow('Failed to upload part');
    });

    it('should complete multipart upload', async () => {
      mockSend.mockResolvedValue({});

      const parts = [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ];

      await provider.completeMultipartUpload('key|upload-id', parts);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should abort multipart upload', async () => {
      mockSend.mockResolvedValue({});

      await provider.abortMultipartUpload('key|upload-id');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('public URL generation', () => {
    it('should generate AWS S3 public URL', () => {
      const provider = new S3StorageProvider(defaultConfig);
      expect(provider.type).toBe('s3');
    });

    it('should support custom endpoint configuration', () => {
      const provider = new S3StorageProvider({
        ...defaultConfig,
        endpoint: 'https://minio.example.com',
      });
      expect(provider.type).toBe('s3');
    });

    it('should support path-style URLs', () => {
      const provider = new S3StorageProvider({
        ...defaultConfig,
        endpoint: 'https://minio.example.com',
        forcePathStyle: true,
      });
      expect(provider.type).toBe('s3');
    });
  });
});
