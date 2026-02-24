import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import * as path from 'path';
import { eq, and, isNull, isNotNull, sql, ilike, arrayContains, desc, asc } from 'drizzle-orm';
import { StorageProviderFactory } from '../file-storage/storage-provider.factory';
import { media, type Media, type InsertMedia } from '@wordrhyme/db';
import type { SignedUrlOptions } from '../file-storage/storage-provider.interface';
import type { Database } from '../db/client';
import { AuditService } from '../audit/audit.service';

// ============================================================
// Error Classes
// ============================================================

export class MediaNotFoundError extends Error {
  constructor(mediaId: string) {
    super(`Media not found: ${mediaId}`);
    this.name = 'MediaNotFoundError';
  }
}

export class MediaValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export class InvalidVariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVariantError';
  }
}

// ============================================================
// Interfaces
// ============================================================

export interface UploadOptions {
  filename: string;
  contentType: string;
  organizationId: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
  isPublic?: boolean;
  alt?: string;
  title?: string;
  tags?: string[];
  folderPath?: string;
}

export interface UpdateMediaData {
  alt?: string;
  title?: string;
  tags?: string[];
  folderPath?: string;
  metadata?: Record<string, unknown>;
}

export type MimeCategory = 'image' | 'video' | 'audio' | 'document' | 'archive';

export interface MediaQuery {
  mimeCategory?: MimeCategory;
  mimeType?: string;
  tags?: string[];
  folderPath?: string;
  search?: string;
  storageProvider?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'filename';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  includeVariants?: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateVariantData {
  variantName: string;
  content: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  format?: string;
  createdBy: string;
}

// ============================================================
// MIME category → SQL condition mapping
// ============================================================

const MIME_CATEGORY_PATTERNS: Record<MimeCategory, string[]> = {
  image: ['image/%'],
  video: ['video/%'],
  audio: ['audio/%'],
  document: ['application/pdf', 'application/msword%', 'application/vnd.%', 'text/%'],
  archive: ['application/zip', 'application/x-rar%', 'application/gzip', 'application/x-7z%', 'application/x-tar'],
};

// ============================================================
// Service
// ============================================================

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly storageFactory: StorageProviderFactory,
    @Inject('DATABASE') private readonly db: Database,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  // ============================================================
  // Validation
  // ============================================================

  async validateFile(
    file: { size: number; mimeType: string; filename: string },
    organizationId: string,
  ): Promise<void> {
    const config = await this.storageFactory.getUploadConfig(organizationId);

    if (file.size > config.maxSize) {
      throw new MediaValidationError(
        `File size ${file.size} exceeds maximum ${config.maxSize} bytes`,
        'FILE_TOO_LARGE',
      );
    }

    const isAllowed = config.allowedTypes.some((pattern) => {
      if (pattern.endsWith('/*')) {
        return file.mimeType.startsWith(pattern.slice(0, -2) + '/');
      }
      return file.mimeType === pattern;
    });

    if (!isAllowed) {
      throw new MediaValidationError(
        `File type ${file.mimeType} is not allowed. Allowed: ${config.allowedTypes.join(', ')}`,
        'INVALID_FILE_TYPE',
      );
    }

    if (!this.isValidFilename(file.filename)) {
      throw new MediaValidationError(
        'Filename contains invalid characters',
        'INVALID_FILENAME',
      );
    }
  }

  private isValidFilename(filename: string): boolean {
    const invalidPatterns = [/\.\./, /[<>:"|?*\x00-\x1f]/];
    return !invalidPatterns.some((p) => p.test(filename));
  }

  // ============================================================
  // Storage Key Generation
  // ============================================================

  private generateStorageKey(organizationId: string, filename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const ext = path.extname(filename) || '';

    return `org/${organizationId}/files/${year}/${month}/${day}/${uuid}${ext}`;
  }

  // ============================================================
  // Core Operations
  // ============================================================

  async upload(content: Buffer, options: UploadOptions): Promise<Media> {
    await this.validateFile(
      { size: content.length, mimeType: options.contentType, filename: options.filename },
      options.organizationId,
    );

    const provider = await this.storageFactory.getProvider(options.organizationId);
    const storageKey = this.generateStorageKey(options.organizationId, options.filename);

    const uploadInput: { key: string; body: Buffer; contentType: string; metadata?: Record<string, string> } = {
      key: storageKey,
      body: content,
      contentType: options.contentType,
    };
    if (options.metadata) {
      uploadInput.metadata = options.metadata as Record<string, string>;
    }
    const result = await provider.upload(uploadInput);

    const record: InsertMedia = {
      organizationId: options.organizationId,
      filename: options.filename,
      mimeType: options.contentType,
      size: result.size,
      storageProvider: provider.type,
      storageKey: result.key,
      createdBy: options.createdBy,
      isPublic: options.isPublic || false,
      metadata: options.metadata || {},
      alt: options.alt,
      title: options.title || options.filename,
      tags: options.tags || [],
      folderPath: options.folderPath,
    };

    const [inserted] = await this.db.insert(media).values(record).returning();

    await this.auditService?.log({
      entityType: 'media',
      entityId: inserted.id,
      organizationId: options.organizationId,
      action: 'create',
      metadata: {
        filename: options.filename,
        mimeType: options.contentType,
        size: result.size,
        storageProvider: provider.type,
      },
    });

    this.logger.log(`Media uploaded: ${inserted.id} (${options.filename})`);
    return inserted;
  }

  async get(mediaId: string, organizationId: string): Promise<Media | null> {
    const [result] = await this.db
      .select()
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.organizationId, organizationId), isNull(media.deletedAt)))
      .limit(1);

    return result || null;
  }

  async getOrThrow(mediaId: string, organizationId: string): Promise<Media> {
    const result = await this.get(mediaId, organizationId);
    if (!result) {
      throw new MediaNotFoundError(mediaId);
    }
    return result;
  }

  async update(mediaId: string, organizationId: string, data: UpdateMediaData): Promise<Media> {
    const existing = await this.getOrThrow(mediaId, organizationId);

    const updateData: Record<string, unknown> = {};
    if (data.alt !== undefined) updateData['alt'] = data.alt;
    if (data.title !== undefined) updateData['title'] = data.title;
    if (data.tags !== undefined) updateData['tags'] = data.tags;
    if (data.folderPath !== undefined) updateData['folderPath'] = data.folderPath;
    if (data.metadata !== undefined) updateData['metadata'] = data.metadata;

    await this.db
      .update(media)
      .set(updateData)
      .where(eq(media.id, mediaId));

    await this.auditService?.log({
      entityType: 'media',
      entityId: mediaId,
      organizationId,
      action: 'update',
      changes: { old: existing, new: data },
    });

    return { ...existing, ...updateData } as Media;
  }

  async delete(mediaId: string, organizationId: string): Promise<void> {
    const existing = await this.getOrThrow(mediaId, organizationId);
    const now = new Date();

    // Soft delete the media and all its variants
    await this.db
      .update(media)
      .set({ deletedAt: now })
      .where(
        and(
          eq(media.organizationId, organizationId),
          sql`(${media.id} = ${mediaId} OR ${media.parentId} = ${mediaId})`,
        ),
      );

    await this.auditService?.log({
      entityType: 'media',
      entityId: mediaId,
      organizationId,
      action: 'delete',
      changes: { old: existing, new: null },
      metadata: { type: 'soft_delete', cascadeVariants: true },
    });

    this.logger.log(`Media soft deleted (with variants): ${mediaId}`);
  }

  async restore(mediaId: string, organizationId: string): Promise<Media> {
    const [existing] = await this.db
      .select()
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new MediaNotFoundError(mediaId);
    }

    if (!existing.deletedAt) {
      throw new Error('Media is not deleted');
    }

    const provider = await this.storageFactory.getProvider(organizationId, existing.storageProvider);
    const exists = await provider.exists(existing.storageKey);

    if (!exists) {
      throw new Error('Media has been permanently deleted from storage');
    }

    // Restore media and all its variants
    await this.db
      .update(media)
      .set({ deletedAt: null })
      .where(
        and(
          eq(media.organizationId, organizationId),
          sql`(${media.id} = ${mediaId} OR ${media.parentId} = ${mediaId})`,
        ),
      );

    await this.auditService?.log({
      entityType: 'media',
      entityId: mediaId,
      organizationId,
      action: 'restore',
    });

    const restored = await this.get(mediaId, organizationId);
    return restored!;
  }

  async list(organizationId: string, query: MediaQuery = {}): Promise<PaginatedResult<Media>> {
    const {
      mimeCategory,
      mimeType,
      tags,
      folderPath,
      search,
      storageProvider,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
      includeVariants = false,
    } = query;

    const conditions = [
      eq(media.organizationId, organizationId),
      isNull(media.deletedAt),
    ];

    // Exclude variants by default (only show originals)
    if (!includeVariants) {
      conditions.push(isNull(media.parentId));
    }

    if (mimeType) {
      conditions.push(eq(media.mimeType, mimeType));
    }

    if (mimeCategory) {
      const patterns = MIME_CATEGORY_PATTERNS[mimeCategory];
      if (patterns.length === 1) {
        conditions.push(ilike(media.mimeType, patterns[0]!));
      } else {
        conditions.push(
          sql`(${sql.join(
            patterns.map((p) => sql`${media.mimeType} ILIKE ${p}`),
            sql` OR `,
          )})`,
        );
      }
    }

    if (tags && tags.length > 0) {
      conditions.push(arrayContains(media.tags, tags));
    }

    if (folderPath) {
      conditions.push(ilike(media.folderPath, `${folderPath}%`));
    }

    if (search) {
      conditions.push(ilike(media.filename, `%${search}%`));
    }

    if (storageProvider) {
      conditions.push(eq(media.storageProvider, storageProvider));
    }

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(media)
      .where(and(...conditions));

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Query with sort
    const sortColumn = media[sortBy];
    const orderBy = sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn);

    const items = await this.db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    return { items, total, page, pageSize, totalPages };
  }

  // ============================================================
  // Storage Operations
  // ============================================================

  async download(mediaId: string, organizationId: string): Promise<Buffer> {
    const item = await this.getOrThrow(mediaId, organizationId);
    const provider = await this.storageFactory.getProvider(organizationId, item.storageProvider);
    return provider.download(item.storageKey);
  }

  async getSignedUrl(
    mediaId: string,
    organizationId: string,
    options?: Partial<SignedUrlOptions>,
  ): Promise<string> {
    const item = await this.getOrThrow(mediaId, organizationId);
    const provider = await this.storageFactory.getProvider(organizationId, item.storageProvider);

    await this.auditService?.log({
      entityType: 'media',
      entityId: mediaId,
      organizationId,
      action: 'access',
      metadata: { method: 'signed_url' },
    });

    const signedUrlOptions: SignedUrlOptions = {
      expiresIn: options?.expiresIn || 3600,
      operation: options?.operation || 'get',
    };
    if (options?.contentType) {
      signedUrlOptions.contentType = options.contentType;
    }

    return provider.getSignedUrl(item.storageKey, signedUrlOptions);
  }

  async getUploadUrl(
    filename: string,
    contentType: string,
    organizationId: string,
    createdBy: string,
    providerId?: string,
  ): Promise<{ uploadUrl: string; mediaId: string; storageKey: string }> {
    await this.validateFile(
      { size: 0, mimeType: contentType, filename },
      organizationId,
    );

    const storageKey = this.generateStorageKey(organizationId, filename);
    const provider = await this.storageFactory.getProvider(organizationId, providerId);

    const uploadUrl = await provider.getSignedUrl(storageKey, {
      expiresIn: 3600,
      operation: 'put',
      contentType,
    });

    const record: InsertMedia = {
      organizationId,
      filename,
      mimeType: contentType,
      size: 0,
      storageProvider: provider.type,
      storageKey,
      createdBy,
      isPublic: false,
      metadata: { status: 'pending' },
    };

    const [inserted] = await this.db.insert(media).values(record).returning();

    return { uploadUrl, mediaId: inserted.id, storageKey };
  }

  async confirmUpload(
    mediaId: string,
    organizationId: string,
    fileSize: number,
  ): Promise<void> {
    const item = await this.getOrThrow(mediaId, organizationId);

    if ((item.metadata as Record<string, unknown>)?.['status'] !== 'pending') {
      return;
    }

    await this.db
      .update(media)
      .set({ size: fileSize, metadata: { status: 'completed' } })
      .where(eq(media.id, mediaId));
  }

  // ============================================================
  // Variant Operations
  // ============================================================

  async createVariant(
    parentId: string,
    organizationId: string,
    data: CreateVariantData,
  ): Promise<Media> {
    // Validate parent exists and belongs to the same org
    const parent = await this.getOrThrow(parentId, organizationId);

    // Prevent creating variants of variants
    if (parent.parentId) {
      throw new InvalidVariantError('Cannot create a variant of a variant');
    }

    // Upload variant to storage
    const variantKey = this.generateVariantStorageKey(
      parent.storageKey,
      data.variantName,
      data.format || path.extname(parent.filename).slice(1),
    );

    const provider = await this.storageFactory.getProvider(organizationId, parent.storageProvider);
    const result = await provider.upload({
      key: variantKey,
      body: data.content,
      contentType: data.mimeType,
    });

    // Create variant row - organization_id inherited from parent (MUST)
    const variantRecord: InsertMedia = {
      organizationId: parent.organizationId,
      parentId,
      variantName: data.variantName,
      filename: `${data.variantName}_${path.basename(parent.filename, path.extname(parent.filename))}.${data.format || path.extname(parent.filename).slice(1)}`,
      mimeType: data.mimeType,
      size: result.size,
      storageProvider: provider.type,
      storageKey: variantKey,
      isPublic: parent.isPublic,
      width: data.width,
      height: data.height,
      format: data.format,
      createdBy: data.createdBy,
    };

    const [inserted] = await this.db.insert(media).values(variantRecord).returning();

    this.logger.log(`Variant created: ${data.variantName} for media ${parentId}`);
    return inserted;
  }

  async getVariants(mediaId: string, organizationId: string): Promise<Media[]> {
    return this.db
      .select()
      .from(media)
      .where(
        and(
          eq(media.parentId, mediaId),
          eq(media.organizationId, organizationId),
          isNull(media.deletedAt),
        ),
      );
  }

  async getVariantUrl(
    mediaId: string,
    organizationId: string,
    variantName: string,
  ): Promise<string> {
    const item = await this.getOrThrow(mediaId, organizationId);

    // For 'original', return the source media URL
    if (variantName === 'original') {
      return this.getSignedUrl(mediaId, organizationId);
    }

    // Non-image media only supports 'original'
    if (!item.mimeType.startsWith('image/')) {
      throw new InvalidVariantError('Variants are only available for image media');
    }

    // Look for existing variant row
    const [variant] = await this.db
      .select()
      .from(media)
      .where(
        and(
          eq(media.parentId, mediaId),
          eq(media.variantName, variantName),
          eq(media.organizationId, organizationId),
          isNull(media.deletedAt),
        ),
      )
      .limit(1);

    if (variant) {
      const provider = await this.storageFactory.getProvider(organizationId, variant.storageProvider);
      return provider.getSignedUrl(variant.storageKey, {
        expiresIn: 3600,
        operation: 'get',
      });
    }

    throw new InvalidVariantError(`Variant '${variantName}' not found for media ${mediaId}`);
  }

  private generateVariantStorageKey(
    originalKey: string,
    variantName: string,
    outputFormat: string,
  ): string {
    const dir = path.dirname(originalKey);
    const name = path.basename(originalKey, path.extname(originalKey));
    return `${dir}/${name}/${variantName}.${outputFormat}`;
  }

  // ============================================================
  // Maintenance
  // ============================================================

  async cleanupExpiredMedia(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredItems = await this.db
      .select()
      .from(media)
      .where(
        and(
          isNotNull(media.deletedAt),
          sql`${media.deletedAt} < ${cutoffDate}`,
        ),
      )
      .limit(100);

    let deletedCount = 0;

    for (const item of expiredItems) {
      try {
        const provider = await this.storageFactory.getProvider(item.organizationId, item.storageProvider);
        await provider.delete(item.storageKey);
        await this.db.delete(media).where(eq(media.id, item.id));

        await this.auditService?.log({
          entityType: 'media',
          entityId: item.id,
          organizationId: item.organizationId,
          action: 'permanent_delete',
          metadata: { deletedAt: item.deletedAt, storageKey: item.storageKey },
        });

        deletedCount++;
        this.logger.log(`Permanently deleted media: ${item.id}`);
      } catch (error) {
        this.logger.error(`Failed to delete media ${item.id}:`, error);
      }
    }

    return deletedCount;
  }
}
