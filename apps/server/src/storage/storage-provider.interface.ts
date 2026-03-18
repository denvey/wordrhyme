/**
 * Storage Provider Interface
 *
 * Abstraction layer for file storage backends (local, S3, OSS, R2, etc.)
 */

/**
 * Upload options
 */
export interface UploadOptions {
  /** Organization ID for multi-tenant isolation */
  organizationId: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Whether the file should be publicly accessible */
  isPublic?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** File content */
  content: Buffer;
}

/**
 * Upload result
 */
export interface UploadResult {
  /** Storage key (path within the storage backend) */
  storageKey: string;
  /** Storage bucket (for cloud providers) */
  storageBucket?: string;
  /** Public URL (if isPublic=true) */
  publicUrl?: string;
  /** File checksum (MD5) */
  checksum: string;
}

/**
 * Download result
 */
export interface DownloadResult {
  /** File content */
  content: Buffer;
  /** MIME type */
  mimeType: string;
  /** File size */
  size: number;
}

/**
 * URL generation options
 */
export interface GetUrlOptions {
  /** URL expiration time in seconds (for signed URLs) */
  expiresIn?: number;
  /** Response content disposition (attachment or inline) */
  disposition?: 'attachment' | 'inline';
  /** Custom filename for download */
  filename?: string;
}

/**
 * Storage Provider Interface
 *
 * All storage providers must implement this interface to ensure consistent behavior
 * across different storage backends.
 */
export interface IStorageProvider {
  /**
   * Provider name (e.g., 'local', 's3', 'oss', 'r2')
   */
  readonly name: string;

  /**
   * Upload a file to storage
   *
   * @param options Upload options
   * @returns Upload result with storage key and URL
   * @throws StorageError if upload fails
   */
  upload(options: UploadOptions): Promise<UploadResult>;

  /**
   * Download a file from storage
   *
   * @param storageKey Storage key returned from upload
   * @returns File content and metadata
   * @throws StorageError if file not found or download fails
   */
  download(storageKey: string): Promise<DownloadResult>;

  /**
   * Delete a file from storage
   *
   * @param storageKey Storage key to delete
   * @returns True if deleted, false if not found
   * @throws StorageError if deletion fails
   */
  delete(storageKey: string): Promise<boolean>;

  /**
   * Check if a file exists in storage
   *
   * @param storageKey Storage key to check
   * @returns True if exists, false otherwise
   */
  exists(storageKey: string): Promise<boolean>;

  /**
   * Get URL for accessing a file
   *
   * For public files, returns the public URL.
   * For private files, returns a signed/temporary URL.
   *
   * @param storageKey Storage key
   * @param options URL generation options
   * @returns Accessible URL
   */
  getUrl(storageKey: string, options?: GetUrlOptions): Promise<string>;

  /**
   * Get file metadata without downloading content
   *
   * @param storageKey Storage key
   * @returns File metadata
   * @throws StorageError if file not found
   */
  getMetadata(storageKey: string): Promise<{
    size: number;
    mimeType: string;
    lastModified: Date;
  }>;
}

/**
 * Storage Error Types
 */
export enum StorageErrorType {
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INSUFFICIENT_SPACE = 'INSUFFICIENT_SPACE',
  INVALID_FILE = 'INVALID_FILE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Storage Error
 */
export class StorageError extends Error {
  constructor(
    public readonly type: StorageErrorType,
    message: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }

  static notFound(storageKey: string): StorageError {
    return new StorageError(
      StorageErrorType.NOT_FOUND,
      `File not found: ${storageKey}`
    );
  }

  static permissionDenied(message: string): StorageError {
    return new StorageError(StorageErrorType.PERMISSION_DENIED, message);
  }

  static insufficientSpace(message: string): StorageError {
    return new StorageError(StorageErrorType.INSUFFICIENT_SPACE, message);
  }

  static invalidFile(message: string): StorageError {
    return new StorageError(StorageErrorType.INVALID_FILE, message);
  }

  static networkError(message: string, cause?: Error): StorageError {
    return new StorageError(StorageErrorType.NETWORK_ERROR, message, cause);
  }

  static unknown(message: string, cause?: Error): StorageError {
    return new StorageError(StorageErrorType.UNKNOWN, message, cause);
  }
}
