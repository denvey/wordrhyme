import { Stream } from 'stream';

/**
 * Storage Provider Type - Core only includes 'local', others via plugins
 */
export type StorageProviderType = 'local' | string;

/**
 * Signed URL Operation Types
 */
export type SignedUrlOperation = 'get' | 'put';

/**
 * Upload Input for storage operations
 */
export interface UploadInput {
  /** Storage path/key */
  key: string;
  /** File content */
  body: Buffer | Stream;
  /** MIME type */
  contentType: string;
  /** Optional metadata */
  metadata?: Record<string, string>;
}

/**
 * Upload Result from storage operations
 */
export interface UploadResult {
  /** Storage path/key */
  key: string;
  /** File size in bytes */
  size: number;
  /** ETag (if available) */
  etag?: string;
}

/**
 * Signed URL Options
 */
export interface SignedUrlOptions {
  /** Expiration time in seconds */
  expiresIn: number;
  /** Operation type: 'get' for download, 'put' for upload */
  operation: SignedUrlOperation;
  /** Content type (required for PUT) */
  contentType?: string;
}

/**
 * Part Result for multipart upload
 */
export interface PartResult {
  /** Part number (1-indexed) */
  partNumber: number;
  /** ETag for the part */
  etag: string;
}

/**
 * Storage Provider Interface
 *
 * Defines the contract for all storage providers (local, S3, OSS, R2, etc.)
 * Core only implements LocalStorageProvider, others are provided by plugins.
 */
export interface StorageProvider {
  /** Provider type identifier */
  readonly type: StorageProviderType;

  /**
   * Upload a file to storage
   */
  upload(input: UploadInput): Promise<UploadResult>;

  /**
   * Download a file from storage
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * Should be idempotent - no error if file doesn't exist
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get a signed URL for file access
   * - operation: 'get' for download, 'put' for direct upload
   */
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;

  /**
   * Get public URL (if the file is public)
   * Returns null if public URLs are not supported
   */
  getPublicUrl(key: string): string | null;

  // Multipart upload operations

  /**
   * Initiate a multipart upload
   * @returns uploadId for the multipart upload session
   */
  initiateMultipartUpload(key: string): Promise<string>;

  /**
   * Upload a part of a multipart upload
   */
  uploadPart(
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<PartResult>;

  /**
   * Complete a multipart upload by merging all parts
   */
  completeMultipartUpload(uploadId: string, parts: PartResult[]): Promise<void>;

  /**
   * Abort a multipart upload and clean up parts
   */
  abortMultipartUpload(uploadId: string): Promise<void>;
}

/**
 * Storage Provider Factory Function
 * Creates a provider instance from configuration
 */
export type StorageProviderFactory = (
  config: Record<string, unknown>
) => StorageProvider;

/**
 * Storage Provider Metadata
 * Used for Admin UI and plugin registration
 */
export interface StorageProviderMetadata {
  /** Provider type identifier */
  type: string;
  /** Display name for UI */
  displayName: string;
  /** Description for UI */
  description?: string | undefined;
  /** JSON Schema for configuration */
  configSchema: Record<string, unknown>;
  /** Source plugin ID ('core' for built-in) */
  pluginId: string;
}
