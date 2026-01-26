import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { AssetType } from '../../db/schema/definitions';
import {
  AssetService,
  AssetNotFoundError,
  InvalidVariantError,
} from '../../asset/asset.service';
import { VARIANT_PRESETS } from '../../asset/image-processor.service';

/**
 * Service instances
 * In production, these would be injected via DI.
 * Here we use setter functions for initialization.
 */
let assetServiceInstance: AssetService | null = null;

/**
 * Set asset service instance (for DI/testing)
 */
export function setAssetService(service: AssetService): void {
  assetServiceInstance = service;
}

function getAssetService(): AssetService {
  if (!assetServiceInstance) {
    throw new Error('AssetService not initialized. Call setAssetService() first.');
  }
  return assetServiceInstance;
}

/**
 * Asset type enum for validation
 */
const assetTypeEnum = z.enum(['image', 'video', 'document', 'other']);

/**
 * Input schemas for asset operations
 */
const createAssetInput = z.object({
  fileId: z.string(),
  type: assetTypeEnum.optional(),
  alt: z.string().max(500).optional(),
  title: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().max(500).optional(),
});

const getAssetInput = z.object({
  assetId: z.string(),
});

const updateAssetInput = z.object({
  assetId: z.string(),
  alt: z.string().max(500).optional(),
  title: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().max(500).optional(),
});

const deleteAssetInput = z.object({
  assetId: z.string(),
});

const listAssetsInput = z.object({
  type: assetTypeEnum.optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(100).optional().default(20),
});

const getVariantUrlInput = z.object({
  assetId: z.string(),
  variant: z.string().min(1),
});

const getVariantsInput = z.object({
  assetId: z.string(),
});

/**
 * Assets Router
 *
 * Provides asset management operations with CMS semantics.
 */
export const assetsRouter = router({
  /**
   * Create an asset from an uploaded file
   */
  create: protectedProcedure
    .input(createAssetInput)
    .use(requirePermission('asset:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      try {
        const as = getAssetService();
        const asset = await as.create(input.fileId, ctx.organizationId, ctx.userId, {
          type: input.type as AssetType | undefined,
          alt: input.alt,
          title: input.title,
          tags: input.tags,
          folderPath: input.folderPath,
        });

        return asset;
      } catch (error) {
        if (error instanceof Error && error.name === 'FileNotFoundError') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Source file not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Get asset by ID
   */
  get: protectedProcedure
    .input(getAssetInput)
    .use(requirePermission('asset:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const as = getAssetService();
      const asset = await as.get(input.assetId, ctx.organizationId);

      if (!asset) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Asset not found',
        });
      }

      return asset;
    }),

  /**
   * Update asset metadata
   */
  update: protectedProcedure
    .input(updateAssetInput)
    .use(requirePermission('asset:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const as = getAssetService();
        const asset = await as.update(input.assetId, ctx.organizationId, {
          alt: input.alt,
          title: input.title,
          tags: input.tags,
          folderPath: input.folderPath,
        });

        return asset;
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Delete asset (soft delete)
   */
  delete: protectedProcedure
    .input(deleteAssetInput)
    .use(requirePermission('asset:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const as = getAssetService();
        await as.delete(input.assetId, ctx.organizationId);
        return { success: true };
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        throw error;
      }
    }),

  /**
   * List assets with filtering and pagination
   */
  list: protectedProcedure
    .input(listAssetsInput)
    .use(requirePermission('asset:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const as = getAssetService();
      const result = await as.list(ctx.organizationId, {
        type: input.type as AssetType | undefined,
        tags: input.tags,
        folderPath: input.folderPath,
        search: input.search,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        page: input.page,
        pageSize: input.pageSize,
      });

      return result;
    }),

  /**
   * Get URL for asset variant
   * Supports: 'original', 'thumbnail', 'small', 'medium', 'large'
   */
  getVariantUrl: protectedProcedure
    .input(getVariantUrlInput)
    .use(requirePermission('asset:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const as = getAssetService();
        const url = await as.getVariantUrl(input.assetId, ctx.organizationId, input.variant);
        return { url, variant: input.variant };
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        if (error instanceof InvalidVariantError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Get all variants for an asset
   */
  getVariants: protectedProcedure
    .input(getVariantsInput)
    .use(requirePermission('asset:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const as = getAssetService();
        const variants = await as.getVariants(input.assetId, ctx.organizationId);
        return { variants };
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Get available variant presets
   */
  getVariantPresets: protectedProcedure.query(() => {
    return {
      presets: Object.entries(VARIANT_PRESETS).map(([name, config]) => ({
        name,
        width: config.width,
        height: config.height,
        fit: config.fit,
        quality: config.quality,
      })),
    };
  }),

  /**
   * Bulk create assets from multiple files
   */
  bulkCreate: protectedProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            fileId: z.string(),
            alt: z.string().optional(),
            title: z.string().optional(),
            tags: z.array(z.string()).optional(),
          })
        ),
        folderPath: z.string().optional(),
      })
    )
    .use(requirePermission('asset:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      const as = getAssetService();
      const results: Array<{ fileId: string; assetId?: string; error?: string }> = [];

      for (const file of input.files) {
        try {
          const asset = await as.create(file.fileId, ctx.organizationId, ctx.userId, {
            alt: file.alt,
            title: file.title,
            tags: file.tags,
            folderPath: input.folderPath,
          });
          results.push({ fileId: file.fileId, assetId: asset.id });
        } catch (error) {
          results.push({
            fileId: file.fileId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        results,
        successful: results.filter((r) => r.assetId).length,
        failed: results.filter((r) => r.error).length,
      };
    }),

  /**
   * Bulk delete assets
   */
  bulkDelete: protectedProcedure
    .input(
      z.object({
        assetIds: z.array(z.string()).min(1).max(100),
      })
    )
    .use(requirePermission('asset:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const as = getAssetService();
      const results: Array<{ assetId: string; success: boolean; error?: string }> = [];

      for (const assetId of input.assetIds) {
        try {
          await as.delete(assetId, ctx.organizationId);
          results.push({ assetId, success: true });
        } catch (error) {
          results.push({
            assetId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        results,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      };
    }),

  /**
   * Move assets to a different folder
   */
  moveToFolder: protectedProcedure
    .input(
      z.object({
        assetIds: z.array(z.string()).min(1).max(100),
        folderPath: z.string().max(500),
      })
    )
    .use(requirePermission('asset:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const as = getAssetService();
      const results: Array<{ assetId: string; success: boolean; error?: string }> = [];

      for (const assetId of input.assetIds) {
        try {
          await as.update(assetId, ctx.organizationId, { folderPath: input.folderPath });
          results.push({ assetId, success: true });
        } catch (error) {
          results.push({
            assetId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        results,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      };
    }),

  /**
   * Add tags to assets
   */
  addTags: protectedProcedure
    .input(
      z.object({
        assetIds: z.array(z.string()).min(1).max(100),
        tags: z.array(z.string()).min(1),
      })
    )
    .use(requirePermission('asset:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const as = getAssetService();
      let successCount = 0;

      for (const assetId of input.assetIds) {
        try {
          const asset = await as.get(assetId, ctx.organizationId);
          if (asset) {
            const existingTags = asset.tags || [];
            const newTags = [...new Set([...existingTags, ...input.tags])];
            await as.update(assetId, ctx.organizationId, { tags: newTags });
            successCount++;
          }
        } catch {
          // Skip failed updates
        }
      }

      return { successful: successCount, total: input.assetIds.length };
    }),
});
