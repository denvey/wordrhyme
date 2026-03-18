/**
 * Local Storage Provider
 *
 * File system-based storage provider for local development and single-server deployments.
 * Files are stored in a directory structure: {uploadDir}/{organizationId}/{year}/{month}/{filename}
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  GetUrlOptions,
  StorageError,
} from '../storage-provider.interface.js';
import { StorageError as StorageErrorClass, StorageErrorType } from '../storage-provider.interface.js';

/**
 * Local storage configuration
 */
interface LocalStorageConfig {
  /** Base upload directory (default: ./uploads) */
  uploadDir: string;
  /** Base URL for serving files (default: /uploads) */
  baseUrl: string;
}

/**
 * Get configuration from environment
 */
function getConfig(): LocalStorageConfig {
  return {
    uploadDir: process.env['UPLOAD_DIR'] || './uploads',
    baseUrl: process.env['UPLOAD_BASE_URL'] || '/uploads',
  };
}

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly config: LocalStorageConfig;

  constructor() {
    this.config = getConfig();
    this.logger.log(`Local storage initialized: ${this.config.uploadDir}`);
  }

  /**
   * Upload a file to local storage
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    const { organizationId, filename, content, isPublic = false } = options;

    // Generate storage key with date-based path
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = this.sanitizeFilename(filename);

    // Generate unique filename to avoid collisions
    const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${sanitizedFilename}`;

    const storageKey = `${organizationId}/${year}/${month}/${uniqueFilename}`;
    const fullPath = path.join(this.config.uploadDir, storageKey);

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content);

      // Calculate checksum
      const checksum = createHash('md5').update(content).digest('hex');

      // Generate public URL if requested
      const publicUrl = isPublic
        ? `${this.config.baseUrl}/${storageKey}`
        : undefined;

      this.logger.debug(`File uploaded: ${storageKey} (${content.length} bytes)`);

      return {
        storageKey,
        checksum,
        ...(publicUrl ? { publicUrl } : {}),
      };
    } catch (error) {
      this.logger.error(`Upload failed: ${storageKey}`, error);

      if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
        throw StorageErrorClass.insufficientSpace('Disk space full');
      }

      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw StorageErrorClass.permissionDenied('Permission denied');
      }

      throw StorageErrorClass.unknown('Upload failed', error as Error);
    }
  }

  /**
   * Download a file from local storage
   */
  async download(storageKey: string): Promise<DownloadResult> {
    const fullPath = path.join(this.config.uploadDir, storageKey);

    try {
      // Check if file exists
      const stats = await fs.stat(fullPath);

      if (!stats.isFile()) {
        throw StorageErrorClass.notFound(storageKey);
      }

      // Read file content
      const content = await fs.readFile(fullPath);

      // Infer MIME type from extension (basic implementation)
      const mimeType = this.inferMimeType(storageKey);

      this.logger.debug(`File downloaded: ${storageKey} (${content.length} bytes)`);

      return {
        content,
        mimeType,
        size: content.length,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw StorageErrorClass.notFound(storageKey);
      }

      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw StorageErrorClass.permissionDenied('Permission denied');
      }

      if (error instanceof StorageErrorClass) {
        throw error;
      }

      throw StorageErrorClass.unknown('Download failed', error as Error);
    }
  }

  /**
   * Delete a file from local storage
   */
  async delete(storageKey: string): Promise<boolean> {
    const fullPath = path.join(this.config.uploadDir, storageKey);

    try {
      await fs.unlink(fullPath);
      this.logger.debug(`File deleted: ${storageKey}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }

      this.logger.error(`Delete failed: ${storageKey}`, error);
      throw StorageErrorClass.unknown('Delete failed', error as Error);
    }
  }

  /**
   * Check if a file exists
   */
  async exists(storageKey: string): Promise<boolean> {
    const fullPath = path.join(this.config.uploadDir, storageKey);

    try {
      const stats = await fs.stat(fullPath);
      return stats.isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }

      throw StorageErrorClass.unknown('Exists check failed', error as Error);
    }
  }

  /**
   * Get URL for accessing a file
   */
  async getUrl(storageKey: string, options?: GetUrlOptions): Promise<string> {
    // For local storage, we always return the base URL + storage key
    // Signed URLs are not supported in local storage
    const url = `${this.config.baseUrl}/${storageKey}`;

    // Add query parameters if specified
    const params = new URLSearchParams();

    if (options?.disposition) {
      params.set('disposition', options.disposition);
    }

    if (options?.filename) {
      params.set('filename', options.filename);
    }

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Get file metadata
   */
  async getMetadata(storageKey: string): Promise<{
    size: number;
    mimeType: string;
    lastModified: Date;
  }> {
    const fullPath = path.join(this.config.uploadDir, storageKey);

    try {
      const stats = await fs.stat(fullPath);

      if (!stats.isFile()) {
        throw StorageErrorClass.notFound(storageKey);
      }

      return {
        size: stats.size,
        mimeType: this.inferMimeType(storageKey),
        lastModified: stats.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw StorageErrorClass.notFound(storageKey);
      }

      throw StorageErrorClass.unknown('Metadata retrieval failed', error as Error);
    }
  }

  /**
   * Sanitize filename to prevent path traversal attacks
   */
  private sanitizeFilename(filename: string): string {
    // Remove path separators and null bytes
    return filename
      .replace(/[/\\]/g, '_')
      .replace(/\0/g, '')
      .replace(/\.\./g, '_');
  }

  /**
   * Infer MIME type from file extension
   */
  private inferMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}
