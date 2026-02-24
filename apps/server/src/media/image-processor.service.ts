import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { MediaService } from './media.service';
import { StorageProviderFactory } from '../file-storage/storage-provider.factory';
import { media } from '@wordrhyme/db';
import type { Database } from '../db/client';

export interface VariantTransformParams {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'inside' | 'fill';
  format?: string;
  quality?: number;
}

let sharp: typeof import('sharp') | null = null;
try {
  sharp = require('sharp');
} catch {
  // Sharp not installed - image processing disabled
}

export const VARIANT_PRESETS: Record<string, VariantTransformParams> = {
  thumbnail: { width: 200, height: 200, fit: 'cover', quality: 80 },
  small: { width: 400, height: 400, fit: 'inside', quality: 85 },
  medium: { width: 800, height: 800, fit: 'inside', quality: 85 },
  large: { width: 1600, height: 1600, fit: 'inside', quality: 90 },
};

export const IMAGE_LIMITS = {
  MAX_PIXELS: 100_000_000,
  MAX_DIMENSION: 16384,
};

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly defaultFormat: string = 'webp';

  constructor(
    private readonly mediaService: MediaService,
    private readonly storageFactory: StorageProviderFactory,
    @Inject('DATABASE') private readonly db: Database,
  ) {
    if (!sharp) {
      this.logger.warn('Sharp is not installed. Image processing features are disabled.');
    }
  }

  isAvailable(): boolean {
    return !!sharp;
  }

  async getMetadata(mediaId: string, organizationId: string): Promise<ImageMetadata> {
    if (!sharp) throw new Error('Sharp is not installed');

    const buffer = await this.mediaService.download(mediaId, organizationId);
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
    };
  }

  private validateImageSize(width: number, height: number): void {
    const pixels = width * height;

    if (pixels > IMAGE_LIMITS.MAX_PIXELS) {
      throw new ImageTooLargeError(
        `Image exceeds maximum pixel count: ${pixels} > ${IMAGE_LIMITS.MAX_PIXELS}`,
      );
    }

    if (width > IMAGE_LIMITS.MAX_DIMENSION || height > IMAGE_LIMITS.MAX_DIMENSION) {
      throw new ImageTooLargeError(
        `Image dimension exceeds limit: ${width}x${height} (max: ${IMAGE_LIMITS.MAX_DIMENSION})`,
      );
    }
  }

  async generateVariant(
    mediaId: string,
    organizationId: string,
    variantName: string,
  ): Promise<{ mediaId: string; width: number; height: number; format: string }> {
    if (!sharp) throw new Error('Sharp is not installed');

    // Check if variant already exists
    const existingVariants = await this.mediaService.getVariants(mediaId, organizationId);
    const existing = existingVariants.find((v) => v.variantName === variantName);

    if (existing) {
      return {
        mediaId: existing.id,
        width: existing.width || 0,
        height: existing.height || 0,
        format: existing.format || 'unknown',
      };
    }

    const config = VARIANT_PRESETS[variantName];
    if (!config) {
      throw new Error(`Unknown variant: ${variantName}`);
    }

    // Get parent media and download original
    const parent = await this.mediaService.getOrThrow(mediaId, organizationId);

    if (!parent.mimeType.startsWith('image/')) {
      throw new Error(`Cannot process variants for non-image media (type: ${parent.mimeType})`);
    }

    const originalBuffer = await this.mediaService.download(mediaId, organizationId);
    const baseImage = sharp(originalBuffer);
    const metadata = await baseImage.metadata();

    if (metadata.width && metadata.height) {
      this.validateImageSize(metadata.width, metadata.height);
    }

    const outputFormat = config.format || this.defaultFormat;
    const image = baseImage.clone();

    const processed = await image
      .resize(config.width, config.height, {
        fit: config.fit as 'cover' | 'contain' | 'inside' | 'fill',
      })
      .toFormat(outputFormat as 'jpeg' | 'png' | 'webp', {
        quality: config.quality || 85,
      })
      .toBuffer({ resolveWithObject: true });

    // Create variant via MediaService (enforces org_id inheritance)
    const variant = await this.mediaService.createVariant(mediaId, organizationId, {
      variantName,
      content: processed.data,
      mimeType: `image/${outputFormat}`,
      width: processed.info.width,
      height: processed.info.height,
      format: outputFormat,
      createdBy: 'system',
    });

    this.logger.log(
      `Generated variant: ${variantName} for media ${mediaId} (${processed.info.width}x${processed.info.height})`,
    );

    return {
      mediaId: variant.id,
      width: processed.info.width,
      height: processed.info.height,
      format: outputFormat,
    };
  }

  async generateVariants(
    mediaId: string,
    organizationId: string,
    variantNames: string[] = ['thumbnail', 'medium'],
  ): Promise<{ mediaId: string; name: string; width: number; height: number; format: string }[]> {
    const results: { mediaId: string; name: string; width: number; height: number; format: string }[] = [];

    for (const variantName of variantNames) {
      try {
        const variant = await this.generateVariant(mediaId, organizationId, variantName);
        results.push({ ...variant, name: variantName });
      } catch (error) {
        this.logger.error(`Failed to generate variant ${variantName} for media ${mediaId}:`, error);
      }
    }

    return results;
  }

  async deleteVariants(mediaId: string, organizationId: string): Promise<void> {
    const variants = await this.mediaService.getVariants(mediaId, organizationId);

    for (const variant of variants) {
      try {
        const provider = await this.storageFactory.getProvider(organizationId, variant.storageProvider);
        await provider.delete(variant.storageKey);
        await this.db.delete(media).where(eq(media.id, variant.id));
      } catch (error) {
        this.logger.error(`Failed to delete variant ${variant.variantName}:`, error);
      }
    }
  }
}
