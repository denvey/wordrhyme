import { Controller, Get, Put, Req, Res, Query, Logger } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { StorageProviderFactory } from './storage-provider.factory';
import { LocalStorageProvider } from './providers/local.provider';
import { media } from '@wordrhyme/db';
import { db } from '../db';

/**
 * File Controller
 *
 * Handles HTTP routes for file upload and download using signed URLs.
 * Works with LocalStorageProvider's token-based authentication.
 */
@Controller('api/files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(private readonly storageFactory: StorageProviderFactory) {}

  /**
   * Handle file upload via signed URL
   * PUT /api/files/upload/*
   */
  @Put('upload/*')
  async upload(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('token') token: string
  ): Promise<void> {
    // Extract key from URL path (everything after /api/files/upload/)
    const urlPath = request.url.split('/api/files/upload/')[1]?.split('?')[0] || '';
    const key = decodeURIComponent(urlPath);

    if (!key) {
      reply.status(400).send({ error: 'Missing file key' });
      return;
    }

    if (!token) {
      reply.status(401).send({ error: 'Missing token' });
      return;
    }

    try {
      const organizationId = this.extractOrganizationId(key);
      if (!organizationId) {
        reply.status(400).send({ error: 'Invalid storage key' });
        return;
      }

      // Get local provider and verify token (this controller only serves local files)
      const provider = await this.storageFactory.getProvider(organizationId, 'local') as LocalStorageProvider;

      if (!(provider instanceof LocalStorageProvider)) {
        reply.status(500).send({ error: 'Local storage provider not available' });
        return;
      }

      const tokenResult = provider.verifyToken(token);

      if (!tokenResult || !tokenResult.valid) {
        this.logger.warn(`Invalid or expired token for key: ${key}`);
        reply.status(401).send({ error: 'Invalid or expired token' });
        return;
      }

      if (tokenResult.operation !== 'put') {
        reply.status(403).send({ error: 'Token not valid for upload' });
        return;
      }

      if (tokenResult.key !== key) {
        reply.status(403).send({ error: 'Token key mismatch' });
        return;
      }

      // Get file content from request body
      let buffer: Buffer;

      if (typeof request.isMultipart === 'function' && request.isMultipart()) {
        const data = await request.file();
        if (!data) {
          reply.status(400).send({ error: 'Missing multipart file' });
          return;
        }
        buffer = await data.toBuffer();
      } else if (Buffer.isBuffer(request.body)) {
        buffer = request.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of request.raw) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }

      if (buffer.length === 0) {
        reply.status(400).send({ error: 'Empty file' });
        return;
      }

      // Upload to storage
      const contentType = request.headers['content-type'] || 'application/octet-stream';
      const result = await provider.upload({
        key,
        body: buffer,
        contentType,
      });

      // Update database record with actual size
      const [file] = await db
        .select()
        .from(media)
        .where(and(eq(media.storageKey, key), eq(media.organizationId, organizationId)))
        .limit(1);

      if (!file) {
        reply.status(404).send({ error: 'File record not found' });
        return;
      }

      await db
        .update(media)
        .set({
          size: result.size,
          metadata: { ...(file.metadata ?? {}), status: 'uploaded' },
          updatedAt: new Date(),
        })
        .where(eq(media.id, file.id));

      this.logger.log(`File uploaded: ${key} (${result.size} bytes)`);

      reply.status(200).send({
        success: true,
        key: result.key,
        size: result.size,
      });
    } catch (error) {
      this.logger.error(`Upload failed for key ${key}:`, error);
      reply.status(500).send({ error: 'Upload failed' });
    }
  }

  /**
   * Handle file download via signed URL
   * GET /api/files/*
   */
  @Get('*')
  async download(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('token') token: string
  ): Promise<void> {
    // Extract key from URL path (everything after /api/files/)
    const urlPath = request.url.split('/api/files/')[1]?.split('?')[0] || '';
    const key = decodeURIComponent(urlPath);

    // Skip upload paths - they're handled by the upload method
    if (key.startsWith('upload/')) {
      reply.status(400).send({ error: 'Invalid file path' });
      return;
    }

    if (!key) {
      reply.status(400).send({ error: 'Invalid file path' });
      return;
    }

    if (!token) {
      reply.status(401).send({ error: 'Missing token' });
      return;
    }

    try {
      const organizationId = this.extractOrganizationId(key);
      if (!organizationId) {
        reply.status(400).send({ error: 'Invalid storage key' });
        return;
      }

      // Get local provider and verify token (this controller only serves local files)
      const provider = await this.storageFactory.getProvider(organizationId, 'local') as LocalStorageProvider;

      if (!(provider instanceof LocalStorageProvider)) {
        reply.status(500).send({ error: 'Local storage provider not available' });
        return;
      }

      const tokenResult = provider.verifyToken(token);

      if (!tokenResult || !tokenResult.valid) {
        this.logger.warn(`Invalid or expired token for key: ${key}`);
        reply.status(401).send({ error: 'Invalid or expired token' });
        return;
      }

      if (tokenResult.operation !== 'get') {
        reply.status(403).send({ error: 'Token not valid for download' });
        return;
      }

      if (tokenResult.key !== key) {
        reply.status(403).send({ error: 'Token key mismatch' });
        return;
      }

      // Get file metadata from database
      const [file] = await db
        .select()
        .from(media)
        .where(and(eq(media.storageKey, key), eq(media.organizationId, organizationId)))
        .limit(1);

      if (!file) {
        reply.status(404).send({ error: 'File not found' });
        return;
      }

      // Download from storage
      const buffer = await provider.download(key);

      // Set response headers
      reply.header('Content-Type', file.mimeType);
      reply.header('Content-Length', buffer.length);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
      reply.header('Cache-Control', 'private, max-age=3600');

      reply.send(buffer);
    } catch (error) {
      this.logger.error(`Download failed for key ${key}:`, error);

      if ((error as Error).message?.includes('not found')) {
        reply.status(404).send({ error: 'File not found' });
      } else {
        reply.status(500).send({ error: 'Download failed' });
      }
    }
  }

  private extractOrganizationId(key: string): string | null {
    const match = key.match(/^org\/([^/]+)\//);
    return match?.[1] ?? null;
  }
}
