import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { StorageProviderFactory } from './storage-provider.factory';
import { FileService } from './file.service';
import { files } from '../db/schema/files';
import type { PartResult } from './storage-provider.interface';
import type { Database } from '../db/client';
import { FILE_STORAGE_REDIS } from './file-storage.constants';

/**
 * Multipart upload configuration
 */
export const MULTIPART_CONFIG = {
  /** Threshold for using multipart upload (5MB) */
  THRESHOLD: 5 * 1024 * 1024,
  /** Part size (5MB) */
  PART_SIZE: 5 * 1024 * 1024,
  /** Expiration time in seconds (24 hours) */
  EXPIRY_SECONDS: 24 * 60 * 60,
};

/**
 * Multipart upload state stored in Redis
 */
interface MultipartUploadState {
  organizationId: string;
  uploadId: string;
  storageProvider: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  totalParts: number;
  parts: Record<string, { etag: string }>;
  createdAt: string;
}

/**
 * Initiate upload response
 */
export interface InitiateUploadResult {
  uploadId: string;
  key: string;
  partSize: number;
  totalParts: number;
}

/**
 * Error for invalid part number
 */
export class InvalidPartNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPartNumberError';
  }
}

/**
 * Error for incomplete upload
 */
export class IncompleteUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncompleteUploadError';
  }
}

/**
 * Error for missing part
 */
export class MissingPartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingPartError';
  }
}

/**
 * Error for upload not found
 */
export class UploadNotFoundError extends Error {
  constructor(uploadId: string) {
    super(`Multipart upload not found: ${uploadId}`);
    this.name = 'UploadNotFoundError';
  }
}

/**
 * Redis key prefix for multipart uploads
 */
const REDIS_KEY_PREFIX = 'multipart:';

/**
 * Multipart Upload Service
 *
 * Handles large file uploads using multipart upload protocol.
 * Uses Redis for temporary state storage (auto-expires after 24 hours).
 */
@Injectable()
export class MultipartUploadService {
  private readonly logger = new Logger(MultipartUploadService.name);

  constructor(
    private readonly storageFactory: StorageProviderFactory,
    private readonly fileService: FileService,
    @Inject(FILE_STORAGE_REDIS) private readonly redis: Redis,
    @Inject('DATABASE') private readonly db: Database
  ) {}

  /**
   * Generate storage key for a file
   */
  private generateStorageKey(organizationId: string, filename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const ext = path.extname(filename) || '';

    return `org/${organizationId}/files/${year}/${month}/${day}/${uuid}${ext}`;
  }

  /**
   * Get Redis key for an upload
   */
  private getRedisKey(uploadId: string): string {
    return `${REDIS_KEY_PREFIX}${uploadId}`;
  }

  /**
   * Initiate a multipart upload
   */
  async initiate(input: {
    organizationId: string;
    filename: string;
    mimeType: string;
    totalSize: number;
  }): Promise<InitiateUploadResult> {
    // Validate file type
    await this.fileService.validateFile(
      {
        size: input.totalSize,
        mimeType: input.mimeType,
        filename: input.filename,
      },
      input.organizationId
    );

    const provider = await this.storageFactory.getProvider(input.organizationId);
    const key = this.generateStorageKey(input.organizationId, input.filename);

    // Initiate with provider
    const uploadId = await provider.initiateMultipartUpload(key);

    // Calculate parts
    const totalParts = Math.ceil(input.totalSize / MULTIPART_CONFIG.PART_SIZE);

    // Store state in Redis with TTL
    const state: MultipartUploadState = {
      organizationId: input.organizationId,
      uploadId,
      storageProvider: provider.type,
      storageKey: key,
      filename: input.filename,
      mimeType: input.mimeType,
      totalSize: input.totalSize,
      totalParts,
      parts: {},
      createdAt: new Date().toISOString(),
    };

    await this.redis.setex(
      this.getRedisKey(uploadId),
      MULTIPART_CONFIG.EXPIRY_SECONDS,
      JSON.stringify(state)
    );

    this.logger.log(
      `Initiated multipart upload: ${uploadId} (${totalParts} parts)`
    );

    return {
      uploadId,
      key,
      partSize: MULTIPART_CONFIG.PART_SIZE,
      totalParts,
    };
  }

  /**
   * Upload a part of a multipart upload
   */
  async uploadPart(input: {
    uploadId: string;
    partNumber: number;
    body: Buffer;
  }): Promise<PartResult> {
    // Get upload state
    const state = await this.getUploadState(input.uploadId);

    // Validate part number
    if (input.partNumber < 1 || input.partNumber > state.totalParts) {
      throw new InvalidPartNumberError(
        `Part number must be between 1 and ${state.totalParts}`
      );
    }

    // Upload to provider
    const provider = await this.storageFactory.getProvider(state.organizationId);
    const result = await provider.uploadPart(
      state.uploadId,
      input.partNumber,
      input.body
    );

    // Update parts map in Redis
    state.parts[String(input.partNumber)] = { etag: result.etag };

    // Refresh TTL and save updated state
    await this.redis.setex(
      this.getRedisKey(input.uploadId),
      MULTIPART_CONFIG.EXPIRY_SECONDS,
      JSON.stringify(state)
    );

    this.logger.debug(
      `Uploaded part ${input.partNumber}/${state.totalParts} for ${input.uploadId}`
    );

    return result;
  }

  /**
   * Complete a multipart upload
   */
  async complete(
    uploadId: string,
    uploadedBy: string
  ): Promise<{ fileId: string }> {
    const state = await this.getUploadState(uploadId);

    // Validate all parts are uploaded
    const uploadedCount = Object.keys(state.parts).length;
    if (uploadedCount !== state.totalParts) {
      throw new IncompleteUploadError(
        `Missing parts: uploaded ${uploadedCount}/${state.totalParts}`
      );
    }

    // Convert to ordered array
    const orderedParts: PartResult[] = [];
    for (let i = 1; i <= state.totalParts; i++) {
      const part = state.parts[String(i)];
      if (!part) {
        throw new MissingPartError(`Part ${i} is missing`);
      }
      orderedParts.push({ partNumber: i, etag: part.etag });
    }

    // Complete with provider
    const provider = await this.storageFactory.getProvider(state.organizationId);
    await provider.completeMultipartUpload(state.uploadId, orderedParts);

    // Create file record
    const [file] = await this.db
      .insert(files)
      .values({
        organizationId: state.organizationId,
        filename: state.filename,
        mimeType: state.mimeType,
        size: state.totalSize,
        storageProvider: state.storageProvider,
        storageKey: state.storageKey,
        uploadedBy,
        isPublic: false,
        metadata: { source: 'multipart_upload' },
      })
      .returning();

    // Delete from Redis
    await this.redis.del(this.getRedisKey(uploadId));

    this.logger.log(`Completed multipart upload: ${uploadId} -> ${(file as { id: string }).id}`);

    return { fileId: (file as { id: string }).id };
  }

  /**
   * Abort a multipart upload
   */
  async abort(uploadId: string): Promise<void> {
    const state = await this.getUploadState(uploadId);

    // Abort with provider
    const provider = await this.storageFactory.getProvider(state.organizationId);
    await provider.abortMultipartUpload(state.uploadId);

    // Delete from Redis
    await this.redis.del(this.getRedisKey(uploadId));

    this.logger.log(`Aborted multipart upload: ${uploadId}`);
  }

  /**
   * Get upload state from Redis
   */
  private async getUploadState(uploadId: string): Promise<MultipartUploadState> {
    const data = await this.redis.get(this.getRedisKey(uploadId));

    if (!data) {
      throw new UploadNotFoundError(uploadId);
    }

    return JSON.parse(data) as MultipartUploadState;
  }
}
