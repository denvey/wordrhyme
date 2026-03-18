/**
 * Context Resolver - Locale Resolution Pipeline
 *
 * Resolves the current locale from multiple sources in priority order:
 * 1. URL query parameter (?lang=)
 * 2. Cookie
 * 3. User preference (from database)
 * 4. Organization default (from database)
 * 5. System default (zh-CN)
 *
 * @see spec.md "Requirement: Globalization Context"
 */

import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../db';
import { currencies, i18nLanguages, notificationPreferences, settings } from '@wordrhyme/db';
import {
  type GlobalizationContext,
  type LocaleResolution,
  type LocaleSource,
  getTextDirection,
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
} from './types';

/**
 * Cookie name for storing user's preferred locale
 */
const LOCALE_COOKIE_NAME = 'wr_locale';

/**
 * Query parameter name for locale override
 */
const LOCALE_QUERY_PARAM = 'lang';
const TENANT_LOCALE_KEYS = ['i18n.locale', 'general.locale'];
const TENANT_CURRENCY_KEYS = ['i18n.currency', 'general.currency'];
const TENANT_TIMEZONE_KEYS = ['i18n.timezone', 'general.timezone'];

/**
 * Context Resolver Service
 *
 * Resolves GlobalizationContext from request and database sources.
 */
@Injectable()
export class ContextResolver {
  private readonly logger = new Logger(ContextResolver.name);

  /**
   * Resolve globalization context for a request
   *
   * @param request Fastify request object
   * @param organizationId Current organization ID
   * @param userId Current user ID (optional)
   * @returns Resolved GlobalizationContext
   */
  async resolve(
    request: FastifyRequest,
    organizationId?: string,
    userId?: string
  ): Promise<GlobalizationContext> {
    // Resolve locale from sources
    const localeResolution = await this.resolveLocale(
      request,
      organizationId,
      userId
    );

    // Build full context
    return {
      locale: localeResolution.locale,
      direction: localeResolution.direction,
      currency: await this.resolveCurrency(organizationId),
      timezone: await this.resolveTimezone(organizationId, userId),
      fallbackLocale: DEFAULT_LOCALE,
    };
  }

  /**
   * Resolve locale from multiple sources
   */
  async resolveLocale(
    request: FastifyRequest,
    organizationId?: string,
    userId?: string
  ): Promise<LocaleResolution> {
    // 1. URL query parameter (?lang=en-US)
    const urlLocale = this.getLocaleFromUrl(request);
    if (urlLocale) {
      const isValid = await this.isLocaleValid(urlLocale, organizationId);
      if (isValid) {
        return {
          locale: urlLocale,
          source: 'url',
          direction: getTextDirection(urlLocale),
        };
      }
    }

    // 2. Cookie
    const cookieLocale = this.getLocaleFromCookie(request);
    if (cookieLocale) {
      const isValid = await this.isLocaleValid(cookieLocale, organizationId);
      if (isValid) {
        return {
          locale: cookieLocale,
          source: 'cookie',
          direction: getTextDirection(cookieLocale),
        };
      }
    }

    // 3. User preference (if authenticated)
    if (userId && organizationId) {
      const userLocale = await this.getUserPreferredLocale(userId, request);
      if (userLocale) {
        const isValid = await this.isLocaleValid(userLocale, organizationId);
        if (isValid) {
          return {
            locale: userLocale,
            source: 'user',
            direction: getTextDirection(userLocale),
          };
        }
      }
    }

    // 4. Organization default
    if (organizationId) {
      const localeFromSettings = await this.getTenantSettingString(
        organizationId,
        TENANT_LOCALE_KEYS
      );
      if (localeFromSettings && this.isValidLocaleFormat(localeFromSettings)) {
        return {
          locale: localeFromSettings,
          source: 'organization',
          direction: getTextDirection(localeFromSettings),
        };
      }

      const orgLocale = await this.getOrganizationDefaultLocale(organizationId);
      if (orgLocale) {
        return {
          locale: orgLocale,
          source: 'organization',
          direction: getTextDirection(orgLocale),
        };
      }
    }

    // 5. System default
    return {
      locale: DEFAULT_LOCALE,
      source: 'system',
      direction: getTextDirection(DEFAULT_LOCALE),
    };
  }

  /**
   * Extract locale from URL query parameter
   */
  private getLocaleFromUrl(request: FastifyRequest): string | null {
    const query = request.query as Record<string, string>;
    const locale = query[LOCALE_QUERY_PARAM];
    return locale && this.isValidLocaleFormat(locale) ? locale : null;
  }

  /**
   * Extract locale from cookie
   */
  private getLocaleFromCookie(request: FastifyRequest): string | null {
    const cookies = (request as FastifyRequest & {
      cookies?: Record<string, string | undefined>;
    }).cookies ?? {};
    const locale = cookies[LOCALE_COOKIE_NAME];
    return locale && this.isValidLocaleFormat(locale) ? locale : null;
  }

  /**
   * Get user's preferred locale from user settings
   * (Placeholder - implement when user settings are available)
   */
  private async getUserPreferredLocale(
    _userId: string,
    request?: FastifyRequest
  ): Promise<string | null> {
    const cookieLocale = request ? this.getLocaleFromCookie(request) : null;
    if (cookieLocale) {
      return cookieLocale;
    }
    return null;
  }

  /**
   * Get organization's default locale
   */
  private async getOrganizationDefaultLocale(
    organizationId: string
  ): Promise<string | null> {
    try {
      const [defaultLang] = await db
        .select({ locale: i18nLanguages.locale })
        .from(i18nLanguages)
        .where(
          and(
            eq(i18nLanguages.organizationId, organizationId),
            eq(i18nLanguages.isDefault, true),
            eq(i18nLanguages.isEnabled, true)
          )
        )
        .limit(1);
      return defaultLang?.locale ?? null;
    } catch (error) {
      this.logger.warn(`Failed to get org default locale: ${error}`);
      return null;
    }
  }

  /**
   * Check if a locale is enabled for an organization
   */
  private async isLocaleValid(
    locale: string,
    organizationId?: string
  ): Promise<boolean> {
    if (!organizationId) {
      // Without org context, accept any valid format
      return this.isValidLocaleFormat(locale);
    }

    try {
      const [language] = await db
        .select({ locale: i18nLanguages.locale })
        .from(i18nLanguages)
        .where(
          and(
            eq(i18nLanguages.organizationId, organizationId),
            eq(i18nLanguages.locale, locale),
            eq(i18nLanguages.isEnabled, true)
          )
        )
        .limit(1);
      return !!language;
    } catch (error) {
      this.logger.warn(`Failed to validate locale: ${error}`);
      return false;
    }
  }

  /**
   * Validate locale format (BCP 47)
   */
  private isValidLocaleFormat(locale: string): boolean {
    // Basic BCP 47 validation: xx or xx-XX format
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(locale);
  }

  /**
   * Resolve currency (placeholder)
   */
  private async resolveCurrency(organizationId?: string): Promise<string> {
    if (!organizationId) {
      return DEFAULT_CURRENCY;
    }

    const configured = await this.getTenantSettingString(
      organizationId,
      TENANT_CURRENCY_KEYS
    );
    if (configured) {
      return configured.toUpperCase();
    }

    try {
      const [baseCurrency] = await db
        .select({ code: currencies.code })
        .from(currencies)
        .where(
          and(
            eq(currencies.organizationId, organizationId),
            eq(currencies.isBase, 1),
            eq(currencies.isEnabled, 1)
          )
        )
        .limit(1);

      return baseCurrency?.code ?? DEFAULT_CURRENCY;
    } catch (error) {
      this.logger.warn(`Failed to resolve currency: ${error}`);
    }

    return DEFAULT_CURRENCY;
  }

  /**
   * Resolve timezone (placeholder)
   */
  private async resolveTimezone(
    organizationId?: string,
    userId?: string
  ): Promise<string> {
    if (organizationId && userId) {
      try {
        const [preference] = await db
          .select({ quietHours: notificationPreferences.quietHours })
          .from(notificationPreferences)
          .where(
            and(
              eq(notificationPreferences.organizationId, organizationId),
              eq(notificationPreferences.userId, userId)
            )
          )
          .limit(1);

        const quietHours = preference?.quietHours as { timezone?: string } | null | undefined;
        if (quietHours?.timezone) {
          return quietHours.timezone;
        }
      } catch (error) {
        this.logger.warn(`Failed to resolve user timezone: ${error}`);
      }
    }

    if (organizationId) {
      const configured = await this.getTenantSettingString(
        organizationId,
        TENANT_TIMEZONE_KEYS
      );
      if (configured) {
        return configured;
      }
    }

    return DEFAULT_TIMEZONE;
  }

  private async getTenantSettingString(
    organizationId: string,
    keys: string[]
  ): Promise<string | null> {
    try {
      for (const key of keys) {
        const [row] = await db
          .select({ value: settings.value })
          .from(settings)
          .where(
            and(
              eq(settings.scope, 'tenant'),
              eq(settings.organizationId, organizationId),
              eq(settings.key, key)
            )
          )
          .limit(1);

        if (typeof row?.value === 'string' && row.value.trim()) {
          return row.value.trim();
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to resolve tenant setting [${keys.join(', ')}]: ${error}`);
    }

    return null;
  }
}
