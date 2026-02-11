/**
 * Context Resolver Unit Tests
 *
 * Tests for locale resolution pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';

// Mock database
vi.mock('../../db', () => ({
  db: {
    query: {
      i18nLanguages: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Import after mocking
import { ContextResolver } from '../../i18n/context-resolver';
import { db } from '../../db';

// Helper to create mock FastifyRequest
function createMockRequest(options: {
  query?: Record<string, string>;
  cookies?: Record<string, string>;
} = {}): FastifyRequest {
  return {
    query: options.query || {},
    cookies: options.cookies || {},
  } as unknown as FastifyRequest;
}

describe('ContextResolver', () => {
  let resolver: ContextResolver;
  const mockFindFirst = vi.mocked(db.query.i18nLanguages.findFirst);

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new ContextResolver();
  });

  describe('resolveLocale', () => {
    it('should return URL locale if valid', async () => {
      // Mock: language exists in DB
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'zh-CN',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({ query: { lang: 'zh-CN' } });
      const result = await resolver.resolveLocale(request, 'org-1');

      expect(result.locale).toBe('zh-CN');
      expect(result.source).toBe('url');
    });

    it('should fallback to cookie locale if URL not present', async () => {
      // Cookie locale is valid
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'en-US',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({
        // No URL locale, only cookie
        cookies: { wr_locale: 'en-US' },
      });
      const result = await resolver.resolveLocale(request, 'org-1');

      expect(result.locale).toBe('en-US');
      expect(result.source).toBe('cookie');
    });

    it('should fallback to organization default if others not valid', async () => {
      // No URL, no cookie - org default
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'zh-CN',
        isEnabled: true,
        isDefault: true,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest();
      const result = await resolver.resolveLocale(request, 'org-1');

      expect(result.locale).toBe('zh-CN');
      expect(result.source).toBe('organization');
    });

    it('should fallback to system default as last resort', async () => {
      // Nothing found in DB
      mockFindFirst.mockResolvedValue(null);

      const request = createMockRequest();
      const result = await resolver.resolveLocale(request);

      expect(result.locale).toBe('zh-CN'); // DEFAULT_LOCALE
      expect(result.source).toBe('system');
    });

    it('should accept any valid format locale without org context', async () => {
      const request = createMockRequest({ query: { lang: 'en-US' } });
      const result = await resolver.resolveLocale(request);

      expect(result.locale).toBe('en-US');
      expect(result.source).toBe('url');
    });
  });

  describe('resolve (full context)', () => {
    it('should return complete GlobalizationContext', async () => {
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'en-US',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({ query: { lang: 'en-US' } });
      const result = await resolver.resolve(request, 'org-1');

      expect(result).toEqual({
        locale: 'en-US',
        direction: 'ltr',
        currency: 'CNY', // Default currency
        timezone: 'Asia/Shanghai', // Default timezone
        fallbackLocale: 'zh-CN',
      });
    });

    it('should detect RTL direction for Arabic', async () => {
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'ar-SA',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({ query: { lang: 'ar-SA' } });
      const result = await resolver.resolve(request, 'org-1');

      expect(result.locale).toBe('ar-SA');
      expect(result.direction).toBe('rtl');
    });
  });

  describe('locale format validation', () => {
    it('should accept valid BCP 47 formats', async () => {
      const validLocales = ['en', 'en-US', 'zh-CN', 'ar-SA'];

      for (const locale of validLocales) {
        const request = createMockRequest({ query: { lang: locale } });
        const result = await resolver.resolveLocale(request);

        expect(result.locale).toBe(locale);
      }
    });

    it('should reject invalid locale formats', async () => {
      // Invalid formats should fall through to system default
      mockFindFirst.mockResolvedValue(null);

      const invalidLocales = ['english', 'en_US', '123', 'en-usa'];

      for (const locale of invalidLocales) {
        const request = createMockRequest({ query: { lang: locale } });
        const result = await resolver.resolveLocale(request);

        expect(result.source).toBe('system');
      }
    });
  });

  describe('priority order', () => {
    it('should respect priority: URL > Cookie > Org > System', async () => {
      // URL wins over cookie
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'zh-CN',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({
        query: { lang: 'zh-CN' },
        cookies: { wr_locale: 'en-US' },
      });
      const result = await resolver.resolveLocale(request, 'org-1');

      expect(result.locale).toBe('zh-CN');
      expect(result.source).toBe('url');
    });

    it('should use cookie when URL is absent', async () => {
      mockFindFirst.mockResolvedValue({
        id: '1',
        locale: 'en-US',
        isEnabled: true,
        isDefault: false,
        organizationId: 'org-1',
      } as any);

      const request = createMockRequest({
        cookies: { wr_locale: 'en-US' },
      });
      const result = await resolver.resolveLocale(request, 'org-1');

      expect(result.locale).toBe('en-US');
      expect(result.source).toBe('cookie');
    });
  });
});
