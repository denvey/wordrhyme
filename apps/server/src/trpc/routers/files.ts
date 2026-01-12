import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { db } from '../../db';
import { files } from '../../db/schema/definitions';
import { eq, and, isNull, desc, ilike, sql } from 'drizzle-orm';
import {
  FileService,
  FileValidationError,
  FileNotFoundError,
} from '../../file-storage/file.service';
import { StorageProviderFactory } from '../../file-storage/storage-provider.factory';
import {
  MultipartUploadService,
  InvalidPartNumberError,
  IncompleteUploadError,
} from '../../file-storage/multipart-upload.service';

/**
 * File Service instance
 * In production, these would be injected via DI.
 * Here we use factory functions that can be overridden for testing.
 */
let fileServiceInstance: FileService | null = null;
let multipartServiceInstance: MultipartUploadService | null = null;
let storageFactoryInstance: StorageProviderFactory | null = null;

/**
 * Set file service instance (for DI/testing)
 */
export function setFileService(service: FileService): void {
  fileServiceInstance = service;
}

/**
 * Set multipart service instance (for DI/testing)
 */
export function setMultipartService(service: MultipartUploadService): void {
  multipartServiceInstance = service;
}

/**
 * Set storage factory instance (for DI/testing)
 */
export function setStorageFactory(factory: StorageProviderFactory): void {
  storageFactoryInstance = factory;
}

function getFileService(): FileService {
  if (!fileServiceInstance) {
    throw new Error('FileService not initialized. Call setFileService() first.');
  }
  return fileServiceInstance;
}

function getMultipartService(): MultipartUploadService {
  if (!multipartServiceInstance) {
    throw new Error('MultipartUploadService not initialized. Call setMultipartService() first.');
  }
  return multipartServiceInstance;
}

/**
 * Input schemas for file operations
 */
const uploadInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  content: z.string(), // Base64 encoded content
  isPublic: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional(),
});

const getFileInput = z.object({
  fileId: z.string(),
});

const getSignedUrlInput = z.object({
  fileId: z.string(),
  expiresIn: z.number().min(60).max(86400).optional().default(3600),
});

const getUploadUrlInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

const listFilesInput = z.object({
  search: z.string().optional(),
  mimeType: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(100).optional().default(20),
});

const deleteFileInput = z.object({
  fileId: z.string(),
});

const restoreFileInput = z.object({
  fileId: z.string(),
});

/**
 * Multipart upload schemas
 */
const initiateMultipartInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  totalSize: z.number().min(1),
});

const uploadPartInput = z.object({
  uploadId: z.string(),
  partNumber: z.number().min(1),
  content: z.string(), // Base64 encoded part content
});

const completeMultipartInput = z.object({
  uploadId: z.string(),
});

const abortMultipartInput = z.object({
  uploadId: z.string(),
});

/**
 * Files Router
 *
 * Provides file upload, download, and management operations.
 */
export const filesRouter = router({
  /**
   * Upload a file (direct upload, base64 encoded)
   * For large files, use multipart upload instead.
   */
  upload: protectedProcedure
    .input(uploadInput)
    .use(requirePermission('file:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      try {
        const content = Buffer.from(input.content, 'base64');
        const fs = getFileService();

        const file = await fs.upload(content, {
          filename: input.filename,
          contentType: input.contentType,
          tenantId: ctx.tenantId,
          uploadedBy: ctx.userId,
          isPublic: input.isPublic,
          metadata: input.metadata as Record<string, unknown>,
        });

        return {
          id: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          createdAt: file.createdAt,
        };
      } catch (error) {
        if (error instanceof FileValidationError) {
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
   * Get file metadata by ID
   */
  get: protectedProcedure
    .input(getFileInput)
    .use(requirePermission('file:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const fs = getFileService();
      const file = await fs.get(input.fileId, ctx.tenantId);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      return file;
    }),

  /**
   * Get signed URL for file download
   */
  getSignedUrl: protectedProcedure
    .input(getSignedUrlInput)
    .use(requirePermission('file:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const fs = getFileService();
        const url = await fs.getSignedUrl(input.fileId, ctx.tenantId, {
          expiresIn: input.expiresIn,
        });

        return { url, expiresIn: input.expiresIn };
      } catch (error) {
        if (error instanceof FileNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found',
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
    .use(requirePermission('file:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId || !ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant or user context',
        });
      }

      try {
        const fs = getFileService();
        const result = await fs.getUploadUrl(
          input.filename,
          input.contentType,
          ctx.tenantId,
          ctx.userId
        );

        return result;
      } catch (error) {
        if (error instanceof FileValidationError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * List files with pagination and filtering
   */
  list: protectedProcedure
    .input(listFilesInput)
    .use(requirePermission('file:read'))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      const conditions = [
        eq(files.tenantId, ctx.tenantId),
        isNull(files.deletedAt),
      ];

      if (input.search) {
        conditions.push(ilike(files.filename, `%${input.search}%`));
      }

      if (input.mimeType) {
        if (input.mimeType.endsWith('/*')) {
          const category = input.mimeType.slice(0, -2);
          conditions.push(ilike(files.mimeType, `${category}/%`));
        } else {
          conditions.push(eq(files.mimeType, input.mimeType));
        }
      }

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(files)
        .where(and(...conditions));

      const total = Number(countResult[0]?.count ?? 0);
      const totalPages = Math.ceil(total / input.pageSize);
      const offset = (input.page - 1) * input.pageSize;

      // Get items
      const items = await db
        .select()
        .from(files)
        .where(and(...conditions))
        .orderBy(desc(files.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages,
      };
    }),

  /**
   * Soft delete a file
   */
  delete: protectedProcedure
    .input(deleteFileInput)
    .use(requirePermission('file:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const fs = getFileService();
        await fs.delete(input.fileId, ctx.tenantId);
        return { success: true };
      } catch (error) {
        if (error instanceof FileNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Restore a soft-deleted file
   */
  restore: protectedProcedure
    .input(restoreFileInput)
    .use(requirePermission('file:delete'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const fs = getFileService();
        const file = await fs.restore(input.fileId, ctx.tenantId);
        return file;
      } catch (error) {
        if (error instanceof FileNotFoundError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'File not found',
          });
        }
        throw error;
      }
    }),

  /**
   * Initiate multipart upload for large files
   */
  initiateMultipart: protectedProcedure
    .input(initiateMultipartInput)
    .use(requirePermission('file:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing tenant context',
        });
      }

      try {
        const ms = getMultipartService();
        const result = await ms.initiate({
          tenantId: ctx.tenantId,
          filename: input.filename,
          mimeType: input.mimeType,
          totalSize: input.totalSize,
        });

        return result;
      } catch (error) {
        if (error instanceof FileValidationError) {
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
    .use(requirePermission('file:create'))
    .mutation(async ({ ctx, input }) => {
      try {
        const content = Buffer.from(input.content, 'base64');
        const ms = getMultipartService();

        const result = await ms.uploadPart({
          uploadId: input.uploadId,
          partNumber: input.partNumber,
          body: content,
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
    .use(requirePermission('file:create'))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing user context',
        });
      }

      try {
        const ms = getMultipartService();
        const result = await ms.complete(input.uploadId, ctx.userId);
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
    .use(requirePermission('file:create'))
    .mutation(async ({ input }) => {
      const ms = getMultipartService();
      await ms.abort(input.uploadId);
      return { success: true };
    }),
});
