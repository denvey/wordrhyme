import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import {
  MediaService,
  MediaNotFoundError,
  MediaValidationError,
  InvalidVariantError,
} from '../../media/media.service';
import {
  MultipartUploadService,
  InvalidPartNumberError,
  IncompleteUploadError,
} from '../../file-storage/multipart-upload.service';
import { VARIANT_PRESETS } from '../../media/image-processor.service';
import type { UploadOptions, MimeCategory } from '../../media/media.service';

// ============================================================
// Service Instance Management (pre-DI pattern)
// ============================================================

let mediaServiceInstance: MediaService | null = null;
let multipartServiceInstance: MultipartUploadService | null = null;

export function setMediaService(service: MediaService): void {
  mediaServiceInstance = service;
}

export function setMultipartService(service: MultipartUploadService): void {
  multipartServiceInstance = service;
}

function getMediaService(): MediaService {
  if (!mediaServiceInstance) {
    throw new Error('MediaService not initialized. Call setMediaService() first.');
  }
  return mediaServiceInstance;
}

function getMultipartService(): MultipartUploadService {
  if (!multipartServiceInstance) {
    throw new Error('MultipartUploadService not initialized. Call setMultipartService() first.');
  }
  return multipartServiceInstance;
}

// ============================================================
// Input Schemas
// ============================================================

const mimeCategoryEnum = z.enum(['image', 'video', 'audio', 'document', 'archive']);

const uploadInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  content: z.string(), // Base64 encoded
  isPublic: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
  alt: z.string().max(500).optional(),
  title: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().max(500).optional(),
});

const getMediaInput = z.object({
  mediaId: z.string(),
});

const updateMediaInput = z.object({
  mediaId: z.string(),
  alt: z.string().max(500).optional(),
  title: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().max(500).optional(),
});

const deleteMediaInput = z.object({
  mediaId: z.string(),
});

const restoreMediaInput = z.object({
  mediaId: z.string(),
});

const getSignedUrlInput = z.object({
  mediaId: z.string(),
  expiresIn: z.number().min(60).max(86400).optional().default(3600),
});

const getUploadUrlInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  providerId: z.string().optional(),
});

const confirmUploadInput = z.object({
  mediaId: z.string(),
  fileSize: z.number().min(1),
});

const listMediaInput = z.object({
  category: mimeCategoryEnum.optional(),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  folderPath: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'filename']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(100).optional().default(20),
});

const getVariantUrlInput = z.object({
  mediaId: z.string(),
  variant: z.string().min(1),
});

const getVariantsInput = z.object({
  mediaId: z.string(),
});

// Multipart upload schemas
const initiateMultipartInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  totalSize: z.number().min(1),
});

const uploadPartInput = z.object({
  uploadId: z.string(),
  partNumber: z.number().min(1),
  content: z.string(), // Base64 encoded
});

const completeMultipartInput = z.object({
  uploadId: z.string(),
});

const abortMultipartInput = z.object({
  uploadId: z.string(),
});

// Bulk operation schemas
const bulkDeleteInput = z.object({
  mediaIds: z.array(z.string()).min(1).max(100),
});

const moveToFolderInput = z.object({
  mediaIds: z.array(z.string()).min(1).max(100),
  folderPath: z.string().max(500),
});

const addTagsInput = z.object({
  mediaIds: z.array(z.string()).min(1).max(100),
  tags: z.array(z.string()).min(1),
});

// ============================================================
// Media Router
// ============================================================

export const mediaRouter = router({
  /**
   * Upload a file (direct upload, base64 encoded)
   */
  upload: protectedProcedure
    .input(uploadInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      try {
        const ms = getMediaService();
        const content = Buffer.from(input.content, 'base64');

        const uploadOptions: UploadOptions = {
          filename: input.filename,
          contentType: input.contentType,
          organizationId: ctx.organizationId,
          createdBy: ctx.userId,
          isPublic: input.isPublic,
        };
        if (input.metadata) uploadOptions.metadata = input.metadata as Record<string, unknown>;
        if (input.alt) uploadOptions.alt = input.alt;
        if (input.title) uploadOptions.title = input.title;
        if (input.tags) uploadOptions.tags = input.tags;
        if (input.folderPath) uploadOptions.folderPath = input.folderPath;

        const result = await ms.upload(content, uploadOptions);

        return {
          id: result.id,
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          createdAt: result.createdAt,
        };
      } catch (error) {
        if (error instanceof MediaValidationError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

  /**
   * Get media by ID
   */
  get: protectedProcedure
    .input(getMediaInput)
    .use(requirePermission('media:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      const item = await ms.get(input.mediaId, ctx.organizationId);

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Media not found',
        });
      }

      return item;
    }),

  /**
   * Update media metadata
   */
  update: protectedProcedure
    .input(updateMediaInput)
    .use(requirePermission('media:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        const updateData: Record<string, unknown> = {};
        if (input.alt !== undefined) updateData['alt'] = input.alt;
        if (input.title !== undefined) updateData['title'] = input.title;
        if (input.tags !== undefined) updateData['tags'] = input.tags;
        if (input.folderPath !== undefined) updateData['folderPath'] = input.folderPath;

        const result = await ms.update(input.mediaId, ctx.organizationId, updateData as import('../../media/media.service').UpdateMediaData);

        return result;
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Soft delete media (cascades to variants)
   */
  delete: protectedProcedure
    .input(deleteMediaInput)
    .use(requirePermission('media:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        await ms.delete(input.mediaId, ctx.organizationId);
        return { success: true };
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Restore a soft-deleted media (cascades to variants)
   */
  restore: protectedProcedure
    .input(restoreMediaInput)
    .use(requirePermission('media:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        const result = await ms.restore(input.mediaId, ctx.organizationId);
        return result;
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Get signed URL for download
   */
  getSignedUrl: protectedProcedure
    .input(getSignedUrlInput)
    .use(requirePermission('media:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        const url = await ms.getSignedUrl(input.mediaId, ctx.organizationId, {
          expiresIn: input.expiresIn,
        });

        return { url, expiresIn: input.expiresIn };
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Get pre-signed upload URL for direct browser upload
   */
  getUploadUrl: protectedProcedure
    .input(getUploadUrlInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      try {
        const ms = getMediaService();
        const result = await ms.getUploadUrl(
          input.filename,
          input.contentType,
          ctx.organizationId,
          ctx.userId,
          input.providerId,
        );

        return result;
      } catch (error) {
        if (error instanceof MediaValidationError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Confirm a pre-signed URL upload completed
   */
  confirmUpload: protectedProcedure
    .input(confirmUploadInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      await ms.confirmUpload(input.mediaId, ctx.organizationId, input.fileSize);
      return { success: true };
    }),

  /**
   * List media with filtering and pagination
   */
  list: protectedProcedure
    .input(listMediaInput)
    .use(requirePermission('media:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      const query: import('../../media/media.service').MediaQuery = {
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        page: input.page,
        pageSize: input.pageSize,
      };
      if (input.category) query.mimeCategory = input.category as MimeCategory;
      if (input.mimeType) query.mimeType = input.mimeType;
      if (input.tags) query.tags = input.tags;
      if (input.folderPath) query.folderPath = input.folderPath;
      if (input.search) query.search = input.search;

      const result = await ms.list(ctx.organizationId, query);

      return result;
    }),

  /**
   * Get URL for a variant
   */
  getVariantUrl: protectedProcedure
    .input(getVariantUrlInput)
    .use(requirePermission('media:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        const url = await ms.getVariantUrl(input.mediaId, ctx.organizationId, input.variant);
        return { url, variant: input.variant };
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
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
   * Get all variants for a media item
   */
  getVariants: protectedProcedure
    .input(getVariantsInput)
    .use(requirePermission('media:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMediaService();
        const variants = await ms.getVariants(input.mediaId, ctx.organizationId);
        return { variants };
      } catch (error) {
        if (error instanceof MediaNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
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

  // ============================================================
  // Bulk Operations
  // ============================================================

  /**
   * Bulk delete media items
   */
  bulkDelete: protectedProcedure
    .input(bulkDeleteInput)
    .use(requirePermission('media:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      const results: Array<{ mediaId: string; success: boolean; error?: string }> = [];

      for (const mediaId of input.mediaIds) {
        try {
          await ms.delete(mediaId, ctx.organizationId);
          results.push({ mediaId, success: true });
        } catch (error) {
          results.push({
            mediaId,
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
   * Move media items to a folder
   */
  moveToFolder: protectedProcedure
    .input(moveToFolderInput)
    .use(requirePermission('media:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      const results: Array<{ mediaId: string; success: boolean; error?: string }> = [];

      for (const mediaId of input.mediaIds) {
        try {
          await ms.update(mediaId, ctx.organizationId, { folderPath: input.folderPath });
          results.push({ mediaId, success: true });
        } catch (error) {
          results.push({
            mediaId,
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
   * Add tags to media items
   */
  addTags: protectedProcedure
    .input(addTagsInput)
    .use(requirePermission('media:update'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const ms = getMediaService();
      let successCount = 0;

      for (const mediaId of input.mediaIds) {
        try {
          const item = await ms.get(mediaId, ctx.organizationId);
          if (item) {
            const existingTags = item.tags || [];
            const newTags = [...new Set([...existingTags, ...input.tags])];
            await ms.update(mediaId, ctx.organizationId, { tags: newTags });
            successCount++;
          }
        } catch {
          // Skip failed updates
        }
      }

      return { successful: successCount, total: input.mediaIds.length };
    }),

  // ============================================================
  // Multipart Upload
  // ============================================================

  /**
   * Initiate multipart upload for large files
   */
  initiateMultipart: protectedProcedure
    .input(initiateMultipartInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const mps = getMultipartService();
        const result = await mps.initiate({
          organizationId: ctx.organizationId,
          filename: input.filename,
          mimeType: input.mimeType,
          totalSize: input.totalSize,
        });

        return result;
      } catch (error) {
        if (error instanceof MediaValidationError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Upload a part of multipart upload
   */
  uploadPart: protectedProcedure
    .input(uploadPartInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const content = Buffer.from(input.content, 'base64');
        const mps = getMultipartService();

        const result = await mps.uploadPart({
          uploadId: input.uploadId,
          partNumber: input.partNumber,
          body: content,
          organizationId: ctx.organizationId,
        });

        return result;
      } catch (error) {
        if (error instanceof InvalidPartNumberError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Complete multipart upload
   */
  completeMultipart: protectedProcedure
    .input(completeMultipartInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId || !ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing user or tenant context',
        });
      }

      try {
        const mps = getMultipartService();
        const result = await mps.complete(input.uploadId, ctx.userId, ctx.organizationId);
        return result;
      } catch (error) {
        if (error instanceof IncompleteUploadError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Abort multipart upload
   */
  abortMultipart: protectedProcedure
    .input(abortMultipartInput)
    .use(requirePermission('media:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const mps = getMultipartService();
      await mps.abort(input.uploadId, ctx.organizationId);
      return { success: true };
    }),
});
