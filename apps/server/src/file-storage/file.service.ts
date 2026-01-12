import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { StorageProviderFactory } from './storage-provider.factory';
import { files, File, InsertFile } from '../db/schema/files';
import type { SignedUrlOptions } from './storage-provider.interface';

/**
 * File upload options
 */
export interface UploadOptions {
  /** Original filename */
  filename: string;
  /** MIME type */
  contentType: string;
  /** Tenant ID */
  tenantId: string;
  /** User ID who uploaded */
  uploadedBy: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Is public file */
  isPublic?: boolean;
}

/**
 * File validation error
 */
export class FileValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * File not found error
 */
export class FileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`File not found: ${fileId}`);
    this.name = 'FileNotFoundError';
  }
}

/**
 * File Service
 *
 * Manages file upload, retrieval, and deletion.
 * Integrates with storage providers and audit service.
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly storageFactory: StorageProviderFactory,
    private readonly db: DrizzleDatabase,
    private readonly auditService?: AuditService
  ) {}

  /**
   * Generate storage key for a file
   * Format: tenants/{tenantId}/files/{year}/{month}/{day}/{uuid}.{ext}
   */
  private generateStorageKey(tenantId: string, filename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const ext = path.extname(filename) || '';

    return `tenants/${tenantId}/files/${year}/${month}/${day}/${uuid}${ext}`;
  }

  /**
   * Validate file before upload
   */
  async validateFile(
    file: { size: number; mimeType: string; filename: string },
    tenantId: string
  ): Promise<void> {
    const config = await this.storageFactory.getUploadConfig(tenantId);

    // Check file size
    if (file.size > config.maxSize) {
      throw new FileValidationError(
        `File size ${file.size} exceeds maximum ${config.maxSize} bytes`,
        'FILE_TOO_LARGE'
      );
    }

    // Check file type
    const isAllowed = config.allowedTypes.some((pattern) => {
      if (pattern.endsWith('/*')) {
        const category = pattern.slice(0, -2);
        return file.mimeType.startsWith(category + '/');
      }
      return file.mimeType === pattern;
    });

    if (!isAllowed) {
      throw new FileValidationError(
        `File type ${file.mimeType} is not allowed. Allowed: ${config.allowedTypes.join(', ')}`,
        'INVALID_FILE_TYPE'
      );
    }

    // Check filename for security issues
    if (!this.isValidFilename(file.filename)) {
      throw new FileValidationError(
        'Filename contains invalid characters',
        'INVALID_FILENAME'
      );
    }
  }

  /**
   * Validate filename for security
   */
  private isValidFilename(filename: string): boolean {
    // Disallow path traversal and special characters
    const invalidPatterns = [/\.\./, /[<>:"|?*\x00-\x1f]/];
    return !invalidPatterns.some((p) => p.test(filename));
  }

  /**
   * Upload a file
   */
  async upload(
    content: Buffer,
    options: UploadOptions
  ): Promise<File> {
    // Validate file
    await this.validateFile(
      {
        size: content.length,
        mimeType: options.contentType,
        filename: options.filename,
      },
      options.tenantId
    );

    // Get storage provider
    const provider = await this.storageFactory.getProvider(options.tenantId);

    // Generate storage key
    const storageKey = this.generateStorageKey(
      options.tenantId,
      options.filename
    );

    // Upload to storage
    const result = await provider.upload({
      key: storageKey,
      body: content,
      contentType: options.contentType,
      metadata: options.metadata as Record<string, string> | undefined,
    });

    // Create database record
    const fileRecord: InsertFile = {
      tenantId: options.tenantId,
      filename: options.filename,
      mimeType: options.contentType,
      size: result.size,
      storageProvider: provider.type,
      storageKey: result.key,
      uploadedBy: options.uploadedBy,
      isPublic: options.isPublic || false,
      metadata: options.metadata || {},
    };

    const [file] = await this.db.insert(files).values(fileRecord).returning();

    // Audit log
    await this.auditService?.log({
      entityType: 'file',
      entityId: file.id,
      tenantId: options.tenantId,
      action: 'create',
      metadata: {
        filename: options.filename,
        mimeType: options.contentType,
        size: result.size,
        storageProvider: provider.type,
      },
    });

    this.logger.log(`File uploaded: ${file.id} (${options.filename})`);

    return file;
  }

  /**
   * Get a file by ID
   */
  async get(fileId: string, tenantId: string): Promise<File | null> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.tenantId, tenantId),
          isNull(files.deletedAt)
        )
      )
      .limit(1);

    return file || null;
  }

  /**
   * Get a file by ID (throws if not found)
   */
  async getOrThrow(fileId: string, tenantId: string): Promise<File> {
    const file = await this.get(fileId, tenantId);
    if (!file) {
      throw new FileNotFoundError(fileId);
    }
    return file;
  }

  /**
   * Download file content
   */
  async download(fileId: string, tenantId: string): Promise<Buffer> {
    const file = await this.getOrThrow(fileId, tenantId);

    const provider = await this.storageFactory.getProvider(tenantId);
    return provider.download(file.storageKey);
  }

  /**
   * Get signed URL for file access
   */
  async getSignedUrl(
    fileId: string,
    tenantId: string,
    options?: Partial<SignedUrlOptions>
  ): Promise<string> {
    const file = await this.getOrThrow(fileId, tenantId);

    const provider = await this.storageFactory.getProvider(tenantId);

    // Audit access
    await this.auditService?.log({
      entityType: 'file',
      entityId: fileId,
      tenantId,
      action: 'access',
      metadata: { method: 'signed_url' },
    });

    return provider.getSignedUrl(file.storageKey, {
      expiresIn: options?.expiresIn || 3600,
      operation: options?.operation || 'get',
      contentType: options?.contentType,
    });
  }

  /**
   * Get a signed upload URL for direct upload
   */
  async getUploadUrl(
    filename: string,
    contentType: string,
    tenantId: string,
    uploadedBy: string
  ): Promise<{ uploadUrl: string; fileId: string; storageKey: string }> {
    // Validate file type
    await this.validateFile(
      { size: 0, mimeType: contentType, filename },
      tenantId
    );

    // Generate storage key
    const storageKey = this.generateStorageKey(tenantId, filename);

    // Get provider and generate PUT URL
    const provider = await this.storageFactory.getProvider(tenantId);
    const uploadUrl = await provider.getSignedUrl(storageKey, {
      expiresIn: 3600,
      operation: 'put',
      contentType,
    });

    // Pre-create file record (will be updated after upload completes)
    const fileRecord: InsertFile = {
      tenantId,
      filename,
      mimeType: contentType,
      size: 0, // Will be updated after upload
      storageProvider: provider.type,
      storageKey,
      uploadedBy,
      isPublic: false,
      metadata: { status: 'pending' },
    };

    const [file] = await this.db.insert(files).values(fileRecord).returning();

    return {
      uploadUrl,
      fileId: file.id,
      storageKey,
    };
  }

  /**
   * Soft delete a file
   */
  async delete(fileId: string, tenantId: string): Promise<void> {
    const file = await this.getOrThrow(fileId, tenantId);

    // Soft delete - set deleted_at
    await this.db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(eq(files.id, fileId));

    // Audit log
    await this.auditService?.log({
      entityType: 'file',
      entityId: fileId,
      tenantId,
      action: 'delete',
      changes: { old: file, new: null },
      metadata: { type: 'soft_delete' },
    });

    this.logger.log(`File soft deleted: ${fileId}`);
  }

  /**
   * Restore a soft-deleted file
   */
  async restore(fileId: string, tenantId: string): Promise<File> {
    // Find the file including deleted ones
    const [file] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.tenantId, tenantId)))
      .limit(1);

    if (!file) {
      throw new FileNotFoundError(fileId);
    }

    if (!file.deletedAt) {
      throw new Error('File is not deleted');
    }

    // Check if the actual file still exists in storage
    const provider = await this.storageFactory.getProvider(tenantId);
    const exists = await provider.exists(file.storageKey);

    if (!exists) {
      throw new Error('File has been permanently deleted from storage');
    }

    // Restore
    await this.db
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(files.id, fileId));

    // Audit log
    await this.auditService?.log({
      entityType: 'file',
      entityId: fileId,
      tenantId,
      action: 'restore',
    });

    const restored = await this.get(fileId, tenantId);
    return restored!;
  }

  /**
   * Permanently delete files that have been soft deleted for longer than retention period
   */
  async cleanupExpiredFiles(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Find expired files
    const expiredFiles = await this.db
      .select()
      .from(files)
      .where(
        and(
          sql`${files.deletedAt} IS NOT NULL`,
          sql`${files.deletedAt} < ${cutoffDate}`
        )
      )
      .limit(100); // Process in batches

    let deletedCount = 0;

    for (const file of expiredFiles) {
      try {
        // Delete from storage
        const provider = await this.storageFactory.getProvider(file.tenantId);
        await provider.delete(file.storageKey);

        // Delete from database
        await this.db.delete(files).where(eq(files.id, file.id));

        // Audit log
        await this.auditService?.log({
          entityType: 'file',
          entityId: file.id,
          tenantId: file.tenantId,
          action: 'permanent_delete',
          metadata: {
            deletedAt: file.deletedAt,
            storageKey: file.storageKey,
          },
        });

        deletedCount++;
        this.logger.log(`Permanently deleted file: ${file.id}`);
      } catch (error) {
        this.logger.error(`Failed to delete file ${file.id}:`, error);
      }
    }

    return deletedCount;
  }
}

// Type placeholders - these would be imported from actual implementations
type DrizzleDatabase = {
  insert: (table: typeof files) => {
    values: (data: InsertFile) => { returning: () => Promise<File[]> };
  };
  select: () => {
    from: (table: typeof files) => {
      where: (condition: unknown) => { limit: (n: number) => Promise<File[]> };
    };
  };
  update: (table: typeof files) => {
    set: (data: Partial<File>) => {
      where: (condition: unknown) => Promise<void>;
    };
  };
  delete: (table: typeof files) => {
    where: (condition: unknown) => Promise<void>;
  };
};

interface AuditService {
  log: (event: {
    entityType: string;
    entityId: string;
    tenantId: string;
    action: string;
    changes?: unknown;
    metadata?: unknown;
  }) => Promise<void>;
}
