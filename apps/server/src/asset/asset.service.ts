import { Injectable, Logger } from '@nestjs/common';
import { eq, and, isNull, sql, ilike, arrayContains, desc, asc } from 'drizzle-orm';
import { FileService } from '../file-storage/file.service';
import { StorageProviderFactory } from '../file-storage/storage-provider.factory';
import {
  assets,
  Asset,
  InsertAsset,
  AssetType,
  AssetVariantInfo,
} from '../db/schema/assets';

/**
 * Asset creation options
 */
export interface CreateAssetOptions {
  /** Optional asset type override */
  type?: AssetType | undefined;
  /** Alt text for accessibility */
  alt?: string | undefined;
  /** Title */
  title?: string | undefined;
  /** Tags for organization */
  tags?: string[] | undefined;
  /** Folder path for organization */
  folderPath?: string | undefined;
}

/**
 * Asset update data
 */
export interface UpdateAssetData {
  alt?: string | undefined;
  title?: string | undefined;
  tags?: string[] | undefined;
  folderPath?: string | undefined;
}

/**
 * Asset query parameters
 */
export interface AssetQuery {
  /** Asset type filter */
  type?: AssetType | undefined;
  /** Tag filter */
  tags?: string[] | undefined;
  /** Folder path filter (prefix match) */
  folderPath?: string | undefined;
  /** Search in alt/title */
  search?: string | undefined;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Page number (1-indexed) */
  page?: number;
  /** Page size */
  pageSize?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Asset not found error
 */
export class AssetNotFoundError extends Error {
  constructor(assetId: string) {
    super(`Asset not found: ${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

/**
 * Invalid variant error
 */
export class InvalidVariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVariantError';
  }
}

/**
 * Asset Service
 *
 * Manages assets (files with CMS semantics).
 * Variants are stored inline as JSONB for simplicity.
 */
@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    private readonly fileService: FileService,
    private readonly storageFactory: StorageProviderFactory,
    private readonly db: DrizzleDatabase,
    private readonly imageProcessor?: ImageProcessorService,
    private readonly auditService?: AuditService
  ) {}

  /**
   * Detect asset type from MIME type
   */
  private detectAssetType(mimeType: string): AssetType {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    if (
      mimeType.startsWith('application/pdf') ||
      mimeType.startsWith('application/msword') ||
      mimeType.startsWith('application/vnd.') ||
      mimeType.startsWith('text/')
    ) {
      return 'document';
    }
    return 'other';
  }

  /**
   * Create an asset from a file
   */
  async create(
    fileId: string,
    organizationId: string,
    createdBy: string,
    options: CreateAssetOptions = {}
  ): Promise<Asset> {
    // Get the file
    const file = await this.fileService.getOrThrow(fileId, organizationId);

    // Detect or use provided type
    const type = options.type || this.detectAssetType(file.mimeType);

    // Create asset record
    const assetData: InsertAsset = {
      organizationId,
      fileId,
      type,
      alt: options.alt,
      title: options.title || file.filename,
      tags: options.tags || [],
      folderPath: options.folderPath,
      createdBy,
      variants: [],
    };

    const [insertedAsset] = await this.db.insert(assets).values(assetData).returning();
    const asset = insertedAsset as Asset;

    // For images, extract metadata
    if (type === 'image' && this.imageProcessor) {
      try {
        const metadata = await this.imageProcessor.getMetadata(fileId, organizationId);
        await this.db
          .update(assets)
          .set({
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
          })
          .where(eq(assets.id, asset.id))
          .execute();

        // Update the returned asset
        asset.width = metadata.width;
        asset.height = metadata.height;
        asset.format = metadata.format;
      } catch (error) {
        this.logger.warn(`Failed to extract image metadata: ${error}`);
      }
    }

    // Audit log
    await this.auditService?.log({
      entityType: 'asset',
      entityId: asset.id,
      organizationId,
      action: 'create',
      metadata: { fileId, type },
    });

    this.logger.log(`Asset created: ${asset.id} (${type})`);

    return asset;
  }

  /**
   * Get an asset by ID
   */
  async get(assetId: string, organizationId: string): Promise<Asset | null> {
    const [result] = await this.db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.organizationId, organizationId),
          isNull(assets.deletedAt)
        )
      )
      .limit(1);

    return (result as Asset) || null;
  }

  /**
   * Get an asset by ID (throws if not found)
   */
  async getOrThrow(assetId: string, organizationId: string): Promise<Asset> {
    const asset = await this.get(assetId, organizationId);
    if (!asset) {
      throw new AssetNotFoundError(assetId);
    }
    return asset;
  }

  /**
   * Update an asset
   */
  async update(
    assetId: string,
    organizationId: string,
    data: UpdateAssetData
  ): Promise<Asset> {
    const asset = await this.getOrThrow(assetId, organizationId);

    // Filter out undefined values
    const updateData: Partial<Asset> = {};
    if (data.alt !== undefined) updateData.alt = data.alt;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.folderPath !== undefined) updateData.folderPath = data.folderPath;

    await this.db
      .update(assets)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .execute();

    // Audit log
    await this.auditService?.log({
      entityType: 'asset',
      entityId: assetId,
      organizationId,
      action: 'update',
      changes: { old: asset, new: data },
    });

    return { ...asset, ...updateData } as Asset;
  }

  /**
   * Delete an asset (soft delete)
   */
  async delete(assetId: string, organizationId: string): Promise<void> {
    const asset = await this.getOrThrow(assetId, organizationId);

    await this.db
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(eq(assets.id, assetId))
      .execute();

    // Audit log
    await this.auditService?.log({
      entityType: 'asset',
      entityId: assetId,
      organizationId,
      action: 'delete',
      changes: { old: asset, new: null },
    });

    this.logger.log(`Asset deleted: ${assetId}`);
  }

  /**
   * List assets with filtering and pagination
   */
  async list(
    organizationId: string,
    query: AssetQuery = {}
  ): Promise<PaginatedResult<Asset>> {
    const {
      type,
      tags,
      folderPath,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
    } = query;

    // Build conditions
    const conditions = [
      eq(assets.organizationId, organizationId),
      isNull(assets.deletedAt),
    ];

    if (type) {
      conditions.push(eq(assets.type, type));
    }

    if (tags && tags.length > 0) {
      conditions.push(arrayContains(assets.tags, tags));
    }

    if (folderPath) {
      conditions.push(ilike(assets.folderPath, `${folderPath}%`));
    }

    if (search) {
      conditions.push(
        sql`(${assets.alt} ILIKE ${'%' + search + '%'} OR ${assets.title} ILIKE ${'%' + search + '%'})`
      );
    }

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assets)
      .where(and(...conditions)) as unknown as { count: number }[];

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Get items with sorting
    const orderBy =
      sortOrder === 'desc' ? desc(assets[sortBy]) : asc(assets[sortBy]);

    const items = await this.db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Get URL for an asset variant
   */
  async getVariantUrl(
    assetId: string,
    organizationId: string,
    variantName: string
  ): Promise<string> {
    const asset = await this.getOrThrow(assetId, organizationId);

    // Non-image assets only support 'original' variant
    if (asset.type !== 'image') {
      if (variantName !== 'original') {
        throw new InvalidVariantError(
          'Variants are only available for image assets'
        );
      }
      return this.fileService.getSignedUrl(asset.fileId, organizationId);
    }

    // For 'original', return the source file URL
    if (variantName === 'original') {
      return this.fileService.getSignedUrl(asset.fileId, organizationId);
    }

    // Check if variant exists in inline JSONB
    const variants = (asset.variants || []) as AssetVariantInfo[];
    const variant = variants.find((v) => v.name === variantName);

    if (variant) {
      return this.fileService.getSignedUrl(variant.fileId, organizationId);
    }

    // Generate variant on demand if image processor is available
    if (this.imageProcessor) {
      const newVariant = await this.imageProcessor.generateVariant(
        assetId,
        organizationId,
        variantName
      );

      // Save new variant to inline JSONB
      const updatedVariants = [
        ...variants,
        {
          name: variantName,
          fileId: newVariant.fileId,
          width: newVariant.width,
          height: newVariant.height,
          format: newVariant.format,
          createdAt: new Date().toISOString(),
        },
      ];

      await this.db
        .update(assets)
        .set({ variants: updatedVariants })
        .where(eq(assets.id, assetId))
        .execute();

      return this.fileService.getSignedUrl(newVariant.fileId, organizationId);
    }

    throw new InvalidVariantError(`Variant '${variantName}' not found`);
  }

  /**
   * Get all variants for an asset
   */
  async getVariants(assetId: string, organizationId: string): Promise<AssetVariantInfo[]> {
    const asset = await this.getOrThrow(assetId, organizationId);
    return (asset.variants || []) as AssetVariantInfo[];
  }
}

// Type placeholders - these would be imported from actual implementations
type DrizzleDatabase = {
  insert: <T>(table: T) => {
    values: (data: unknown) => { returning: () => Promise<unknown[]> };
  };
  select: <T = Record<string, unknown>>(fields?: T) => {
    from: <U>(table: U) => {
      where: (condition: unknown) => QueryResult;
    };
  };
  update: <T>(table: T) => {
    set: (data: unknown) => {
      where: (condition: unknown) => { execute: () => Promise<void> };
    };
  };
  delete: <T>(table: T) => {
    where: (condition: unknown) => { execute: () => Promise<void> };
  };
};

type QueryResult = Promise<unknown[]> & {
  limit: (n: number) => Promise<unknown[]>;
  orderBy: (order: unknown) => {
    limit: (n: number) => {
      offset: (n: number) => Promise<Asset[]>;
    };
  };
};

interface ImageProcessorService {
  getMetadata: (
    fileId: string,
    organizationId: string
  ) => Promise<{ width: number; height: number; format: string }>;
  generateVariant: (
    assetId: string,
    organizationId: string,
    variantName: string
  ) => Promise<{ fileId: string; width: number; height: number; format: string }>;
}

interface AuditService {
  log: (event: {
    entityType: string;
    entityId: string;
    organizationId: string;
    action: string;
    changes?: unknown;
    metadata?: unknown;
  }) => Promise<void>;
}
