/**
 * Storage Service
 *
 * Unified service for file storage operations.
 * Manages multiple storage providers and provides a consistent API.
 */

import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db/index.js';
import { files, type File, type InsertFile } from '../db/schema/files.js';
import { requestContextStorage } from '../context/async-local-storage.js';
import type {
  IStorageProvider,
  UploadOptions,
  GetUrlOptions,
} from './storage-provider.interface.js';
import { StorageError, StorageErrorType } from './storage-provider.interface.js';
import { LocalStorageProvider } from './providers/local-storage.provider.js';
import { eq, and } from 'drizzle-orm';

/**
 * File upload options for StorageService
 */
export interface FileUploadOptions {
  /** Organization ID (defaults to current context) */
  organizationId?: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File content */
  content: Buffer;
  /** Whether the file should be publicly accessible */
  isPublic?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Storage provider to use (defaults to configured provider) */
  storageProvider?: string;
}

/**
 * File upload result
 */
export interface FileUploadResult {
  /** File record from database */
  file: File;
  /** Public URL (if isPublic=true) */
  publicUrl?: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly providers = new Map<string, IStorageProvider>();
  private readonly defaultProvider: string;

  constructor(
    private readonly localStorageProvider: LocalStorageProvider
  ) {
    // Register providers
    this.registerProvider(localStorageProvider);

    // Set default provider from environment
    this.defaultProvider = process.env['STORAGE_PROVIDER'] || 'local';

    this.logger.log(`Storage service initialized with default provider: ${this.defaultProvider}`);
  }

  /**
   * Register a storage provider
   */
  private registerProvider(provider: IStorageProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.log(`Registered storage provider: ${provider.name}`);
  }

  /**
   * Get a storage provider by name
   */
  private getProvider(name?: string): IStorageProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new StorageError(
        StorageErrorType.UNKNOWN,
        `Storage provider not found: ${providerName}`
      );
    }

    return provider;
  }

  /**
   * Upload a file
   *
   * This method:
   * 1. Uploads the file to the storage provider
   * 2. Creates a database record
   * 3. Returns the file record and URL
   */
  async upload(options: FileUploadOptions): Promise<FileUploadResult> {
    const ctx = requestContextStorage.getStore();
    const organizationId = options.organizationId || ctx?.organizationId;

    if (!organizationId) {
      throw new StorageError(
        StorageErrorType.PERMISSION_DENIED,
        'Organization ID is required'
      );
    }

    const provider = this.getProvider(options.storageProvider);

    // Upload to storage provider
    const uploadOptions: UploadOptions = {
      organizationId,
      filename: options.filename,
      mimeType: options.mimeType,
      size: options.content.length,
      content: options.content,
      ...(options.isPublic !== undefined ? { isPublic: options.isPublic } : {}),
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    };
    const uploadResult = await provider.upload(uploadOptions);

    // Create database record
    const fileData = {
      organizationId,
      filename: options.filename,
      mimeType: options.mimeType,
      size: options.content.length,
      storageProvider: provider.name,
      storageKey: uploadResult.storageKey,
      storageBucket: uploadResult.storageBucket,
      isPublic: options.isPublic || false,
      checksum: uploadResult.checksum,
      uploadedBy: ctx?.userId || 'system',
      ...(uploadResult.storageBucket ? { storageBucket: uploadResult.storageBucket } : {}),
      ...(uploadResult.publicUrl ? { publicUrl: uploadResult.publicUrl } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    } satisfies InsertFile;

    const [file] = await db.insert(files).values(fileData).returning();

    if (!file) {
      // Rollback: delete uploaded file
      await provider.delete(uploadResult.storageKey).catch((error) => {
        this.logger.error(`Failed to rollback upload: ${uploadResult.storageKey}`, error);
      });

      throw new StorageError(
        StorageErrorType.UNKNOWN,
        'Failed to create file record'
      );
    }

    this.logger.log(`File uploaded: ${file.id} (${file.size} bytes)`);

    return {
      file,
      ...(uploadResult.publicUrl ? { publicUrl: uploadResult.publicUrl } : {}),
    };
  }

  /**
   * Download a file by ID
   */
  async download(fileId: string, organizationId?: string): Promise<Buffer> {
    const ctx = requestContextStorage.getStore();
    const orgId = organizationId || ctx?.organizationId;

    if (!orgId) {
      throw new StorageError(
        StorageErrorType.PERMISSION_DENIED,
        'Organization ID is required'
      );
    }

    // Get file record
    const file = await this.getFile(fileId, orgId);

    // Download from storage provider
    const provider = this.getProvider(file.storageProvider);
    const result = await provider.download(file.storageKey);

    return result.content;
  }

  /**
   * Delete a file by ID
   */
  async delete(fileId: string, organizationId?: string): Promise<boolean> {
    const ctx = requestContextStorage.getStore();
    const orgId = organizationId || ctx?.organizationId;

    if (!orgId) {
      throw new StorageError(
        StorageErrorType.PERMISSION_DENIED,
        'Organization ID is required'
      );
    }

    // Get file record
    const file = await this.getFile(fileId, orgId);

    // Delete from storage provider
    const provider = this.getProvider(file.storageProvider);
    await provider.delete(file.storageKey);

    // Soft delete in database
    await db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(eq(files.id, fileId));

    this.logger.log(`File deleted: ${fileId}`);

    return true;
  }

  /**
   * Get file URL
   */
  async getUrl(
    fileId: string,
    options?: GetUrlOptions,
    organizationId?: string
  ): Promise<string> {
    const ctx = requestContextStorage.getStore();
    const orgId = organizationId || ctx?.organizationId;

    if (!orgId) {
      throw new StorageError(
        StorageErrorType.PERMISSION_DENIED,
        'Organization ID is required'
      );
    }

    // Get file record
    const file = await this.getFile(fileId, orgId);

    // If file is public and has a public URL, return it
    if (file.isPublic && file.publicUrl) {
      return file.publicUrl;
    }

    // Generate URL from storage provider
    const provider = this.getProvider(file.storageProvider);
    return provider.getUrl(file.storageKey, options);
  }

  /**
   * Check if a file exists
   */
  async exists(fileId: string, organizationId?: string): Promise<boolean> {
    const ctx = requestContextStorage.getStore();
    const orgId = organizationId || ctx?.organizationId;

    if (!orgId) {
      return false;
    }

    try {
      await this.getFile(fileId, orgId);
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.type === StorageErrorType.NOT_FOUND) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file record from database
   */
  private async getFile(fileId: string, organizationId: string): Promise<File> {
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!file || file.deletedAt) {
      throw StorageError.notFound(fileId);
    }

    return file;
  }

  /**
   * Get file metadata
   */
  async getMetadata(fileId: string, organizationId?: string): Promise<File> {
    const ctx = requestContextStorage.getStore();
    const orgId = organizationId || ctx?.organizationId;

    if (!orgId) {
      throw new StorageError(
        StorageErrorType.PERMISSION_DENIED,
        'Organization ID is required'
      );
    }

    return this.getFile(fileId, orgId);
  }
}
