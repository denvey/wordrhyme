/**
 * I18n Cache Service
 *
 * Multi-layer caching for translations with version-based invalidation.
 *
 * Cache Strategy (from design.md D3):
 * - Redis: 1 hour TTL
 * - Version number for cache validation
 * - Pattern: i18n:v:{org}:{locale}:{ns} → "1706961234567"
 *
 * @see design.md D3: 缓存策略
 */

import { Injectable, Logger } from '@nestjs/common';
import { CacheManager } from '../cache/cache-manager';

/**
 * Cache key patterns
 */
const CACHE_KEYS = {
  /** Translation messages: i18n:msg:{org}:{locale}:{namespace} */
  messages: (orgId: string, locale: string, namespace: string) =>
    `i18n:msg:${orgId}:${locale}:${namespace}`,

  /** Version number: i18n:v:{org}:{locale}:{namespace} */
  version: (orgId: string, locale: string, namespace: string) =>
    `i18n:v:${orgId}:${locale}:${namespace}`,

  /** All versions for an org: i18n:v:{org}:* */
  orgVersionPattern: (orgId: string) => `i18n:v:${orgId}:*`,

  /** All messages for an org: i18n:msg:{org}:* */
  orgMessagesPattern: (orgId: string) => `i18n:msg:${orgId}:*`,

  /** All messages for a namespace: i18n:msg:{org}:*:{namespace} */
  namespacePattern: (orgId: string, namespace: string) =>
    `i18n:msg:${orgId}:*:${namespace}`,
};

/**
 * Cache TTL in seconds
 */
const CACHE_TTL = {
  messages: 3600, // 1 hour
  version: 86400, // 24 hours (version numbers rarely change format)
};

/**
 * Cached translation data structure
 */
export interface CachedTranslations {
  messages: Record<string, string>;
  version: string;
  cachedAt: number;
}

/**
 * I18n Cache Service
 *
 * Manages caching for translation messages with version-based invalidation.
 */
@Injectable()
export class I18nCacheService {
  private readonly logger = new Logger(I18nCacheService.name);

  constructor(private readonly cacheManager: CacheManager) {}

  /**
   * Get cached translations for a locale and namespace
   *
   * @returns Cached translations or null if not cached
   */
  async getTranslations(
    organizationId: string,
    locale: string,
    namespace: string
  ): Promise<CachedTranslations | null> {
    const key = CACHE_KEYS.messages(organizationId, locale, namespace);
    const cache = await this.cacheManager.forOrganization(organizationId);

    return cache.get<CachedTranslations>(key);
  }

  /**
   * Cache translations with version number
   */
  async setTranslations(
    organizationId: string,
    locale: string,
    namespace: string,
    messages: Record<string, string>
  ): Promise<string> {
    const version = this.generateVersion();
    const cached: CachedTranslations = {
      messages,
      version,
      cachedAt: Date.now(),
    };

    const cache = await this.cacheManager.forOrganization(organizationId);
    const messageKey = CACHE_KEYS.messages(organizationId, locale, namespace);
    const versionKey = CACHE_KEYS.version(organizationId, locale, namespace);

    await Promise.all([
      cache.set(messageKey, cached, { ttl: CACHE_TTL.messages }),
      cache.set(versionKey, version, { ttl: CACHE_TTL.version }),
    ]);

    return version;
  }

  /**
   * Get current version number for a namespace
   *
   * @returns Version string or null if not set
   */
  async getVersion(
    organizationId: string,
    locale: string,
    namespace: string
  ): Promise<string | null> {
    const key = CACHE_KEYS.version(organizationId, locale, namespace);
    const cache = await this.cacheManager.forOrganization(organizationId);

    return cache.get<string>(key);
  }

  /**
   * Check if client version matches server version
   *
   * @param clientVersion Version from client request
   * @returns true if versions match (client has latest)
   */
  async isVersionCurrent(
    organizationId: string,
    locale: string,
    namespace: string,
    clientVersion: string
  ): Promise<boolean> {
    const serverVersion = await this.getVersion(organizationId, locale, namespace);
    return serverVersion === clientVersion;
  }

  /**
   * Invalidate cache for a specific namespace
   *
   * Called when translations are updated.
   */
  async invalidateNamespace(
    organizationId: string,
    namespace: string
  ): Promise<void> {
    const cache = await this.cacheManager.forOrganization(organizationId);

    // Invalidate all locales for this namespace
    const pattern = CACHE_KEYS.namespacePattern(organizationId, namespace);
    await cache.invalidatePattern(pattern);

    this.logger.log(
      `Invalidated i18n cache for org=${organizationId}, namespace=${namespace}`
    );
  }

  /**
   * Invalidate all i18n cache for an organization
   *
   * Called when languages are added/removed.
   */
  async invalidateOrganization(organizationId: string): Promise<void> {
    const cache = await this.cacheManager.forOrganization(organizationId);

    // Invalidate all messages and versions
    await Promise.all([
      cache.invalidatePattern(CACHE_KEYS.orgMessagesPattern(organizationId)),
      cache.invalidatePattern(CACHE_KEYS.orgVersionPattern(organizationId)),
    ]);

    this.logger.log(`Invalidated all i18n cache for org=${organizationId}`);
  }

  /**
   * Invalidate cache for a specific locale
   *
   * Called when a language is disabled.
   */
  async invalidateLocale(organizationId: string, locale: string): Promise<void> {
    const cache = await this.cacheManager.forOrganization(organizationId);

    // Pattern: i18n:msg:{org}:{locale}:*
    const messagePattern = `i18n:msg:${organizationId}:${locale}:*`;
    const versionPattern = `i18n:v:${organizationId}:${locale}:*`;

    await Promise.all([
      cache.invalidatePattern(messagePattern),
      cache.invalidatePattern(versionPattern),
    ]);

    this.logger.log(
      `Invalidated i18n cache for org=${organizationId}, locale=${locale}`
    );
  }

  /**
   * Generate version number
   *
   * Uses timestamp for simplicity and natural ordering.
   */
  private generateVersion(): string {
    return Date.now().toString();
  }
}
