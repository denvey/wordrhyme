import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Media } from '@wordrhyme/db';

/**
 * CDN Configuration
 */
export interface CDNConfig {
  /** Whether CDN is enabled */
  enabled: boolean;
  /** CDN base URL */
  baseUrl: string;
  /** Whether to use signed URLs */
  signedUrls: boolean;
  /** Signing key for URL signatures */
  signingKey?: string;
  /** Default TTL in seconds */
  ttl: number;
}

/**
 * CDN Settings Keys
 */
export const CDN_SETTINGS = {
  ENABLED: 'storage.cdn.enabled',
  BASE_URL: 'storage.cdn.baseUrl',
  SIGNED_URLS: 'storage.cdn.signedUrls',
  SIGNING_KEY: 'storage.cdn.signingKey',
  TTL: 'storage.cdn.ttl',
} as const;

/**
 * Default CDN configuration
 */
export const DEFAULT_CDN_CONFIG: CDNConfig = {
  enabled: false,
  baseUrl: '',
  signedUrls: false,
  ttl: 86400, // 24 hours
};

/**
 * CDN Service
 *
 * Handles CDN URL generation and signing.
 */
@Injectable()
export class CDNService {
  private readonly logger = new Logger(CDNService.name);

  constructor(private readonly settingsService?: SettingsService) {}

  /**
   * Get CDN configuration
   */
  private async getConfig(organizationId?: string): Promise<CDNConfig> {
    if (!this.settingsService) {
      return DEFAULT_CDN_CONFIG;
    }

    const [enabled, baseUrl, signedUrls, signingKey, ttl] = await Promise.all([
      this.settingsService.get<boolean>(CDN_SETTINGS.ENABLED, organizationId),
      this.settingsService.get<string>(CDN_SETTINGS.BASE_URL, organizationId),
      this.settingsService.get<boolean>(CDN_SETTINGS.SIGNED_URLS, organizationId),
      this.settingsService.get<string>(CDN_SETTINGS.SIGNING_KEY, organizationId),
      this.settingsService.get<number>(CDN_SETTINGS.TTL, organizationId),
    ]);

    return {
      enabled: enabled ?? DEFAULT_CDN_CONFIG.enabled,
      baseUrl: baseUrl ?? DEFAULT_CDN_CONFIG.baseUrl,
      signedUrls: signedUrls ?? DEFAULT_CDN_CONFIG.signedUrls,
      signingKey,
      ttl: ttl ?? DEFAULT_CDN_CONFIG.ttl,
    };
  }

  /**
   * Check if CDN is enabled
   */
  async isEnabled(organizationId?: string): Promise<boolean> {
    const config = await this.getConfig(organizationId);
    return config.enabled && !!config.baseUrl;
  }

  /**
   * Get CDN URL for a file
   */
  async getUrl(
    file: Media,
    organizationId?: string,
    options?: { ttl?: number }
  ): Promise<string | null> {
    const config = await this.getConfig(organizationId);

    if (!config.enabled || !config.baseUrl) {
      return null;
    }

    const path = this.buildCDNPath(file);
    const ttl = options?.ttl ?? config.ttl;

    if (config.signedUrls && config.signingKey) {
      return this.signUrl(config.baseUrl, path, config.signingKey, ttl);
    }

    return `${config.baseUrl}${path}`;
  }

  /**
   * Build CDN path from file
   */
  private buildCDNPath(file: Media): string {
    // CDN path strategy - use storage key directly
    return `/${file.storageKey}`;
  }

  /**
   * Sign a CDN URL
   */
  private signUrl(
    baseUrl: string,
    path: string,
    signingKey: string,
    ttlSeconds: number
  ): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.generateSignature(path, expires, signingKey);

    return `${baseUrl}${path}?expires=${expires}&signature=${signature}`;
  }

  /**
   * Generate URL signature
   */
  private generateSignature(
    path: string,
    expires: number,
    signingKey: string
  ): string {
    const payload = `${path}:${expires}`;
    return crypto
      .createHmac('sha256', signingKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify a signed URL
   */
  verifySignature(
    path: string,
    expires: number,
    signature: string,
    signingKey: string
  ): boolean {
    // Check expiration
    if (Date.now() / 1000 > expires) {
      return false;
    }

    const expectedSignature = this.generateSignature(path, expires, signingKey);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Get CDN URL or fallback to storage URL
   */
  async getUrlWithFallback(
    file: Media,
    organizationId: string,
    fallbackUrlFn: () => Promise<string>,
    options?: { ttl?: number }
  ): Promise<string> {
    const cdnUrl = await this.getUrl(file, organizationId, options);

    if (cdnUrl) {
      return cdnUrl;
    }

    return fallbackUrlFn();
  }
}

// Type placeholder
interface SettingsService {
  get<T>(key: string, organizationId?: string): Promise<T | null>;
}
