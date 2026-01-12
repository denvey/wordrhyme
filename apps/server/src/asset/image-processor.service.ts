import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { eq, and } from 'drizzle-orm';
import { FileService } from '../file-storage/file.service';
import { StorageProviderFactory } from '../file-storage/storage-provider.factory';
import {
  assets,
  AssetVariantInfo,
} from '../db/schema/assets';
import { files, InsertFile } from '../db/schema/files';

/**
 * Variant transform parameters
 */
export interface VariantTransformParams {
  width?: number | undefined;
  height?: number | undefined;
  fit?: 'cover' | 'contain' | 'inside' | 'fill' | undefined;
  format?: string | undefined;
  quality?: number | undefined;
}

// Sharp is optional - only imported if available
let sharp: typeof import('sharp') | null = null;
try {
  sharp = require('sharp');
} catch {
  // Sharp not installed - image processing disabled
}

/**
 * Predefined variant configurations
 */
export const VARIANT_PRESETS: Record<string, VariantTransformParams> = {
  thumbnail: { width: 200, height: 200, fit: 'cover', quality: 80 },
  small: { width: 400, height: 400, fit: 'inside', quality: 85 },
  medium: { width: 800, height: 800, fit: 'inside', quality: 85 },
  large: { width: 1600, height: 1600, fit: 'inside', quality: 90 },
};

/**
 * Image processing limits
 */
export const IMAGE_LIMITS = {
  MAX_PIXELS: 100_000_000, // 100 megapixels
  MAX_DIMENSION: 16384, // Max single dimension
};

/**
 * Image metadata
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

/**
 * Error for image too large
 */
export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

/**
 * Error for invalid asset type
 */
export class InvalidAssetTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssetTypeError';
  }
}

/**
 * Image Processor Service
 *
 * Handles image processing, variant generation, and metadata extraction.
 * Uses Sharp library for image operations.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly defaultFormat: string = 'webp';

  constructor(
    private readonly fileService: FileService,
    private readonly storageFactory: StorageProviderFactory,
    private readonly db: DrizzleDatabase
  ) {
    if (!sharp) {
      this.logger.warn(
        'Sharp is not installed. Image processing features are disabled.'
      );
    }
  }

  /**
   * Check if image processing is available
   */
  isAvailable(): boolean {
    return !!sharp;
  }

  /**
   * Get image metadata
   */
  async getMetadata(fileId: string, tenantId: string): Promise<ImageMetadata> {
    if (!sharp) {
      throw new Error('Sharp is not installed');
    }

    const buffer = await this.fileService.download(fileId, tenantId);
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
    };
  }

  /**
   * Validate image size limits
   */
  private validateImageSize(width: number, height: number): void {
    const pixels = width * height;

    if (pixels > IMAGE_LIMITS.MAX_PIXELS) {
      throw new ImageTooLargeError(
        `Image exceeds maximum pixel count: ${pixels} > ${IMAGE_LIMITS.MAX_PIXELS}`
      );
    }

    if (width > IMAGE_LIMITS.MAX_DIMENSION || height > IMAGE_LIMITS.MAX_DIMENSION) {
      throw new ImageTooLargeError(
        `Image dimension exceeds limit: ${width}x${height} (max: ${IMAGE_LIMITS.MAX_DIMENSION})`
      );
    }
  }

  /**
   * Generate variant storage key
   */
  private generateVariantKey(
    originalKey: string,
    variantName: string,
    outputFormat: string
  ): string {
    const dir = path.dirname(originalKey);
    const name = path.basename(originalKey, path.extname(originalKey));
    const ext = `.${outputFormat}`;

    // Format: tenants/{tenantId}/files/{date}/{uuid}/{variant}.{outputFormat}
    return `${dir}/${name}/${variantName}${ext}`;
  }

  /**
   * Generate a variant for an asset
   */
  async generateVariant(
    assetId: string,
    tenantId: string,
    variantName: string
  ): Promise<{ fileId: string; width: number; height: number; format: string }> {
    if (!sharp) {
      throw new Error('Sharp is not installed');
    }

    // Get asset
    const [asset] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)))
      .limit(1);

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Type guard - only process images
    if ((asset as { type: string }).type !== 'image') {
      throw new InvalidAssetTypeError(
        `Cannot process variants for non-image asset (type: ${(asset as { type: string }).type})`
      );
    }

    // Check if variant already exists in inline JSONB
    const existingVariants = ((asset as { variants?: AssetVariantInfo[] }).variants || []) as AssetVariantInfo[];
    const existing = existingVariants.find((v) => v.name === variantName);

    if (existing) {
      return {
        fileId: existing.fileId,
        width: existing.width,
        height: existing.height,
        format: existing.format,
      };
    }

    // Get variant config
    const config = VARIANT_PRESETS[variantName];
    if (!config) {
      throw new Error(`Unknown variant: ${variantName}`);
    }

    // Get original file
    const originalFile = await this.fileService.getOrThrow((asset as { fileId: string }).fileId, tenantId);
    const originalBuffer = await this.fileService.download((asset as { fileId: string }).fileId, tenantId);

    // Create Sharp instance and get metadata
    const baseImage = sharp(originalBuffer);
    const metadata = await baseImage.metadata();

    // Validate image size
    if (metadata.width && metadata.height) {
      this.validateImageSize(metadata.width, metadata.height);
    }

    // Determine output format
    const outputFormat = config.format || this.defaultFormat;

    // Clone Sharp instance for this variant (important!)
    const image = baseImage.clone();

    // Process image
    const processed = await image
      .resize(config.width, config.height, {
        fit: config.fit as 'cover' | 'contain' | 'inside' | 'fill',
      })
      .toFormat(outputFormat as 'jpeg' | 'png' | 'webp', {
        quality: config.quality || 85,
      })
      .toBuffer({ resolveWithObject: true });

    // Generate variant storage key
    const variantKey = this.generateVariantKey(
      originalFile.storageKey,
      variantName,
      outputFormat
    );

    // Upload to storage
    const provider = await this.storageFactory.getProvider(tenantId);
    await provider.upload({
      key: variantKey,
      body: processed.data,
      contentType: `image/${outputFormat}`,
    });

    // Create file record for variant
    const variantFileName = `${variantName}_${path.basename(originalFile.filename, path.extname(originalFile.filename))}.${outputFormat}`;

    const variantFileData: InsertFile = {
      tenantId,
      filename: variantFileName,
      mimeType: `image/${outputFormat}`,
      size: processed.data.length,
      storageProvider: provider.type,
      storageKey: variantKey,
      uploadedBy: 'system',
      isPublic: originalFile.isPublic,
      metadata: { variant: variantName, source: (asset as { fileId: string }).fileId },
    };

    const [variantFile] = await this.db
      .insert(files)
      .values(variantFileData)
      .returning();

    // Create new variant info
    const newVariant: AssetVariantInfo = {
      name: variantName,
      fileId: (variantFile as { id: string }).id,
      width: processed.info.width,
      height: processed.info.height,
      format: outputFormat,
      createdAt: new Date().toISOString(),
    };

    // Update asset with new variant in inline JSONB
    const updatedVariants = [...existingVariants, newVariant];
    await this.db
      .update(assets)
      .set({ variants: updatedVariants })
      .where(eq(assets.id, assetId))
      .execute();

    this.logger.log(
      `Generated variant: ${variantName} for asset ${assetId} (${processed.info.width}x${processed.info.height})`
    );

    return {
      fileId: newVariant.fileId,
      width: newVariant.width,
      height: newVariant.height,
      format: newVariant.format,
    };
  }

  /**
   * Generate multiple variants for an asset
   */
  async generateVariants(
    assetId: string,
    tenantId: string,
    variantNames: string[] = ['thumbnail', 'medium']
  ): Promise<AssetVariantInfo[]> {
    const results: AssetVariantInfo[] = [];

    for (const variantName of variantNames) {
      try {
        const variant = await this.generateVariant(assetId, tenantId, variantName);
        results.push({
          name: variantName,
          fileId: variant.fileId,
          width: variant.width,
          height: variant.height,
          format: variant.format,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error(
          `Failed to generate variant ${variantName} for asset ${assetId}:`,
          error
        );
      }
    }

    return results;
  }

  /**
   * Delete all variants for an asset
   */
  async deleteVariants(assetId: string, tenantId: string): Promise<void> {
    // Get asset with inline variants
    const [asset] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)))
      .limit(1);

    if (!asset) return;

    const variants = ((asset as { variants?: AssetVariantInfo[] }).variants || []) as AssetVariantInfo[];

    for (const variant of variants) {
      try {
        // Delete variant file
        const file = await this.fileService.get(variant.fileId, tenantId);
        if (file) {
          const provider = await this.storageFactory.getProvider(tenantId);
          await provider.delete(file.storageKey);
          await this.db.delete(files).where(eq(files.id, variant.fileId)).execute();
        }
      } catch (error) {
        this.logger.error(`Failed to delete variant ${variant.name}:`, error);
      }
    }

    // Clear variants from asset's inline JSONB
    await this.db
      .update(assets)
      .set({ variants: [] })
      .where(eq(assets.id, assetId))
      .execute();
  }
}

// Type placeholders
type DrizzleDatabase = {
  insert: <T>(table: T) => {
    values: (data: unknown) => { returning: () => Promise<unknown[]> };
  };
  select: () => {
    from: <T>(table: T) => {
      where: (condition: unknown) => { limit: (n: number) => Promise<unknown[]> };
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
