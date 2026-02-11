/**
 * S3 Storage Provider
 *
 * S3-compatible storage provider supporting:
 * - AWS S3
 * - Cloudflare R2
 * - MinIO
 * - DigitalOcean Spaces
 * - Backblaze B2
 * - Any S3-compatible object storage
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PluginStorageProvider,
  PluginStorageUploadInput,
  PluginStorageUploadResult,
} from '@wordrhyme/plugin';

/**
 * S3 Provider Configuration
 */
export interface S3ProviderConfig {
  /** Custom endpoint (for R2, MinIO, etc.) */
  endpoint?: string;
  /** AWS region or 'auto' for R2 */
  region: string;
  /** S3 bucket name */
  bucket: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Base URL for public files (optional, for CDN) */
  publicUrlBase?: string;
  /** Use path-style URLs (required for MinIO) */
  forcePathStyle?: boolean;
}

/**
 * S3 Storage Provider Implementation
 */
export class S3StorageProvider implements PluginStorageProvider {
  readonly type = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | undefined;

  constructor(private readonly config: S3ProviderConfig) {
    this.bucket = config.bucket;
    this.publicUrlBase = config.publicUrlBase || undefined;

    // Initialize S3 client
    const clientConfig: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle || false,
    };

    // Only add endpoint if provided
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Upload a file to S3
   */
  async upload(input: PluginStorageUploadInput): Promise<PluginStorageUploadResult> {
    const { key, body, contentType, metadata } = input;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.client.send(command);

    return {
      key,
      size: body.length,
    };
  }

  /**
   * Download file content from S3
   */
  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Check if a file exists in S3
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(
    key: string,
    options: {
      expiresIn: number;
      operation: 'get' | 'put';
      contentType?: string;
    }
  ): Promise<string> {
    const command = options.operation === 'get'
      ? new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      : new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: options.contentType,
        });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn,
    });
  }

  /**
   * Initiate multipart upload
   */
  async initiateMultipartUpload(key: string): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.UploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    return response.UploadId;
  }

  /**
   * Upload a part in multipart upload
   */
  async uploadPart(
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<{ partNumber: number; etag: string }> {
    // Extract key from uploadId (stored in format: key|uploadId)
    const [key, actualUploadId] = uploadId.split('|');

    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: actualUploadId,
      PartNumber: partNumber,
      Body: body,
    });

    const response = await this.client.send(command);

    if (!response.ETag) {
      throw new Error('Failed to upload part');
    }

    return {
      partNumber,
      etag: response.ETag,
    };
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<void> {
    const [key, actualUploadId] = uploadId.split('|');

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: actualUploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    });

    await this.client.send(command);
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string): Promise<void> {
    const [key, actualUploadId] = uploadId.split('|');

    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: actualUploadId,
    });

    await this.client.send(command);
  }

  /**
   * Generate public URL for a key
   */
  private getPublicUrl(key: string): string {
    if (this.config.endpoint) {
      // Custom endpoint (R2, MinIO, etc.)
      const endpoint = this.config.endpoint.replace(/\/$/, '');
      return this.config.forcePathStyle
        ? `${endpoint}/${this.bucket}/${key}`
        : `${endpoint}/${key}`;
    }

    // AWS S3 standard URL
    return `https://${this.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }
}
