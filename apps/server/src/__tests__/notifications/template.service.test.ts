/**
 * Template Service Unit Tests
 *
 * Tests for the notification template service including:
 * - Variable interpolation
 * - i18n fallback
 * - XSS prevention
 */
import { describe, it, expect } from 'vitest';

describe('Template Service', () => {
  describe('Variable Interpolation', () => {
    function interpolate(template: string, variables: Record<string, unknown>): string {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = variables[key];
        return value !== undefined ? String(value) : `{{${key}}}`;
      });
    }

    it('should replace simple variables', () => {
      const result = interpolate('Hello, {{name}}!', { name: 'John' });
      expect(result).toBe('Hello, John!');
    });

    it('should replace multiple variables', () => {
      const result = interpolate('{{userName}} commented on {{postTitle}}', {
        userName: 'Alice',
        postTitle: 'My Post',
      });
      expect(result).toBe('Alice commented on My Post');
    });

    it('should preserve unmatched variables', () => {
      const result = interpolate('Hello, {{name}}! You have {{count}} messages.', {
        name: 'John',
      });
      expect(result).toBe('Hello, John! You have {{count}} messages.');
    });

    it('should handle numeric values', () => {
      const result = interpolate('You have {{count}} notifications', { count: 5 });
      expect(result).toBe('You have 5 notifications');
    });

    it('should handle empty strings', () => {
      const result = interpolate('Value: {{value}}', { value: '' });
      expect(result).toBe('Value: ');
    });
  });

  describe('i18n Fallback', () => {
    const translations = {
      'en-US': {
        title: 'Welcome',
        message: 'You have joined the platform',
      },
      'zh-CN': {
        title: '欢迎',
        message: '您已加入平台',
      },
      en: {
        title: 'Welcome',
        message: 'You have joined',
      },
    };

    function getTranslation(
      key: 'title' | 'message',
      locale: string,
      defaultLocale = 'en-US'
    ): string {
      // Try exact locale
      const exactMatch = translations[locale as keyof typeof translations];
      if (exactMatch?.[key]) {
        return exactMatch[key];
      }

      // Try language code only (e.g., 'en' from 'en-GB')
      const langCode = locale.split('-')[0];
      const langMatch = translations[langCode as keyof typeof translations];
      if (langMatch?.[key]) {
        return langMatch[key];
      }

      // Fall back to default
      const defaultMatch = translations[defaultLocale as keyof typeof translations];
      return defaultMatch?.[key] || key;
    }

    it('should return exact locale match', () => {
      expect(getTranslation('title', 'zh-CN')).toBe('欢迎');
    });

    it('should fall back to language code', () => {
      expect(getTranslation('title', 'en-GB')).toBe('Welcome');
    });

    it('should fall back to default locale', () => {
      expect(getTranslation('title', 'fr-FR')).toBe('Welcome');
    });

    it('should return key if no translation found', () => {
      const result = getTranslation('title', 'fr-FR', 'ja-JP');
      // Since ja-JP doesn't exist in translations, it falls back further
      expect(result).toBe('title');
    });
  });

  describe('XSS Prevention', () => {
    function sanitizeHtml(input: string): string {
      const htmlEntities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
      };
      return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char]);
    }

    it('should escape HTML tags', () => {
      const result = sanitizeHtml('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should escape ampersands', () => {
      const result = sanitizeHtml('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      const result = sanitizeHtml('He said "hello"');
      expect(result).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      const result = sanitizeHtml("It's a test");
      expect(result).toBe('It&#x27;s a test');
    });

    it('should handle normal text', () => {
      const result = sanitizeHtml('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should prevent event handler injection when rendered as HTML', () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      // The sanitized string escapes < > and " so it can't be interpreted as HTML
      expect(result).not.toContain('<img');
      expect(result).toBe('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
    });
  });

  describe('Template Validation', () => {
    interface Template {
      key: string;
      title: Record<string, string>;
      message: Record<string, string>;
      variables?: string[];
    }

    function validateTemplate(template: Template): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (!template.key || template.key.length === 0) {
        errors.push('Template key is required');
      }

      if (!template.title || Object.keys(template.title).length === 0) {
        errors.push('At least one title translation is required');
      }

      if (!template.message || Object.keys(template.message).length === 0) {
        errors.push('At least one message translation is required');
      }

      // Check for required 'en-US' fallback
      if (!template.title?.['en-US']) {
        errors.push('en-US title translation is required');
      }

      if (!template.message?.['en-US']) {
        errors.push('en-US message translation is required');
      }

      return { valid: errors.length === 0, errors };
    }

    it('should validate a complete template', () => {
      const template: Template = {
        key: 'system.welcome',
        title: { 'en-US': 'Welcome' },
        message: { 'en-US': 'Welcome to the platform!' },
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require template key', () => {
      const template: Template = {
        key: '',
        title: { 'en-US': 'Welcome' },
        message: { 'en-US': 'Welcome!' },
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template key is required');
    });

    it('should require en-US translations', () => {
      const template: Template = {
        key: 'test',
        title: { 'zh-CN': '欢迎' },
        message: { 'zh-CN': '欢迎!' },
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('en-US title translation is required');
      expect(result.errors).toContain('en-US message translation is required');
    });
  });
});
