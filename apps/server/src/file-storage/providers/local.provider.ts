import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Stream } from 'stream';
import {
  StorageProvider,
  UploadInput,
  UploadResult,
  SignedUrlOptions,
  PartResult,
} from '../storage-provider.interface';

/**
 * Local Storage Provider Configuration
 */
export interface LocalStorageConfig {
  /** Base directory for file storage */
  basePath: string;
  /** Base URL for file access */
  baseUrl?: string;
  /** Secret for signing access tokens */
  signingSecret?: string;
}

/**
 * Multipart upload state stored locally
 */
interface MultipartState {
  key: string;
  parts: Map<number, string>; // partNumber -> temp file path
  createdAt: Date;
}

/**
 * Local Storage Provider
 *
 * Stores files on the local filesystem.
 * Uses signed tokens for secure file access.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly type = 'local' as const;

  private readonly basePath: string;
  private readonly baseUrl: string;
  private readonly signingSecret: string;
  private readonly multipartUploads = new Map<string, MultipartState>();

  constructor(config: LocalStorageConfig) {
    this.basePath = path.resolve(config.basePath);
    this.baseUrl = config.baseUrl || '/api/files';
    this.signingSecret =
      config.signingSecret || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get the full file path for a storage key
   */
  private getFilePath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.basePath, sanitizedKey);
  }

  /**
   * Ensure directory exists for a file path
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: Stream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const filePath = this.getFilePath(input.key);
    await this.ensureDirectory(filePath);

    const buffer =
      Buffer.isBuffer(input.body)
        ? input.body
        : await this.streamToBuffer(input.body as Stream);

    await fs.writeFile(filePath, buffer);

    return {
      key: input.key,
      size: buffer.length,
    };
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Idempotent - ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a signed token for file access
   */
  private generateToken(
    key: string,
    expiresAt: number,
    operation: 'get' | 'put'
  ): string {
    const payload = `${key}:${expiresAt}:${operation}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');

    return Buffer.from(
      JSON.stringify({
        key,
        exp: expiresAt,
        op: operation,
        sig: signature,
      })
    ).toString('base64url');
  }

  /**
   * Verify a signed token
   */
  verifyToken(
    token: string
  ): { key: string; operation: 'get' | 'put'; valid: boolean } | null {
    try {
      const decoded = JSON.parse(
        Buffer.from(token, 'base64url').toString('utf-8')
      );
      const { key, exp, op, sig } = decoded;

      // Check expiration
      if (Date.now() / 1000 > exp) {
        return { key, operation: op, valid: false };
      }

      // Verify signature
      const payload = `${key}:${exp}:${op}`;
      const expectedSig = crypto
        .createHmac('sha256', this.signingSecret)
        .update(payload)
        .digest('hex');

      const valid = crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSig)
      );

      return { key, operation: op, valid };
    } catch {
      return null;
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + options.expiresIn;
    const token = this.generateToken(key, expiresAt, options.operation);

    const encodedKey = encodeURIComponent(key);

    if (options.operation === 'put') {
      return `${this.baseUrl}/upload/${encodedKey}?token=${token}`;
    }

    return `${this.baseUrl}/${encodedKey}?token=${token}`;
  }

  getPublicUrl(_key: string): string | null {
    // Local storage doesn't support truly public URLs
    // Return null to indicate signed URLs are required
    return null;
  }

  // Multipart upload operations

  async initiateMultipartUpload(key: string): Promise<string> {
    const uploadId = crypto.randomUUID();

    this.multipartUploads.set(uploadId, {
      key,
      parts: new Map(),
      createdAt: new Date(),
    });

    return uploadId;
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<PartResult> {
    const state = this.multipartUploads.get(uploadId);
    if (!state) {
      throw new Error(`Multipart upload not found: ${uploadId}`);
    }

    // Store part in temp directory
    const tempDir = path.join(this.basePath, '.multipart', uploadId);
    await fs.mkdir(tempDir, { recursive: true });

    const partPath = path.join(tempDir, `part-${partNumber}`);
    await fs.writeFile(partPath, body);

    // Calculate ETag (MD5 hash)
    const etag = crypto.createHash('md5').update(body).digest('hex');

    state.parts.set(partNumber, partPath);

    return { partNumber, etag };
  }

  async completeMultipartUpload(
    uploadId: string,
    parts: PartResult[]
  ): Promise<void> {
    const state = this.multipartUploads.get(uploadId);
    if (!state) {
      throw new Error(`Multipart upload not found: ${uploadId}`);
    }

    // Sort parts by part number
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    // Merge parts into final file
    const filePath = this.getFilePath(state.key);
    await this.ensureDirectory(filePath);

    const writeStream = await fs.open(filePath, 'w');

    try {
      for (const part of sortedParts) {
        const partPath = state.parts.get(part.partNumber);
        if (!partPath) {
          throw new Error(`Part ${part.partNumber} not found`);
        }

        const partData = await fs.readFile(partPath);
        await writeStream.write(partData);
      }
    } finally {
      await writeStream.close();
    }

    // Cleanup temp files
    await this.cleanupMultipartUpload(uploadId);
  }

  async abortMultipartUpload(uploadId: string): Promise<void> {
    await this.cleanupMultipartUpload(uploadId);
  }

  private async cleanupMultipartUpload(uploadId: string): Promise<void> {
    const state = this.multipartUploads.get(uploadId);
    if (!state) {
      return;
    }

    // Remove temp directory
    const tempDir = path.join(this.basePath, '.multipart', uploadId);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    this.multipartUploads.delete(uploadId);
  }
}
