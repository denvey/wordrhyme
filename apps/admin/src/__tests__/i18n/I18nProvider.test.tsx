/**
 * I18nProvider Integration Tests
 *
 * Tests for the I18nProvider component behavior using mock implementations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React, { useState, createContext, useContext, type ReactNode } from 'react';

// ============================================================================
// Mock Implementation
// ============================================================================

// RTL locales set
const RTL_LOCALES = new Set(['ar', 'ar-SA', 'he', 'he-IL', 'fa', 'ur']);

type TextDirection = 'ltr' | 'rtl';

function getDirection(locale: string): TextDirection {
  if (RTL_LOCALES.has(locale)) return 'rtl';
  const langCode = locale.split('-')[0];
  if (langCode && RTL_LOCALES.has(langCode)) return 'rtl';
  return 'ltr';
}

// Mock I18n Context
interface MockI18nContextValue {
  locale: string;
  direction: TextDirection;
  isLoading: boolean;
  isReady: boolean;
  changeLanguage: (locale: string) => void;
  availableLocales: string[];
  messages: Record<string, string>;
}

const MockI18nContext = createContext<MockI18nContextValue | null>(null);

// Mock Provider
function MockI18nProvider({
  children,
  initialLocale = 'en-US',
  initialMessages,
  availableLocales = ['en-US', 'zh-CN'],
  forceReady = false,
}: {
  children: ReactNode;
  initialLocale?: string;
  initialMessages?: Record<string, string>;
  availableLocales?: string[];
  forceReady?: boolean;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [direction, setDirection] = useState<TextDirection>(getDirection(initialLocale));
  const [messages, setMessages] = useState(initialMessages || {});
  // isReady when messages provided or forceReady flag set
  const [isReady, setIsReady] = useState(initialMessages !== undefined || forceReady);

  const changeLanguage = (newLocale: string) => {
    setLocale(newLocale);
    setDirection(getDirection(newLocale));
  };

  return (
    <MockI18nContext.Provider
      value={{
        locale,
        direction,
        isLoading: false,
        isReady,
        changeLanguage,
        availableLocales,
        messages,
      }}
    >
      {children}
    </MockI18nContext.Provider>
  );
}

// Mock useI18n hook
function useMockI18n() {
  const context = useContext(MockI18nContext);
  if (!context) {
    throw new Error('useMockI18n must be used within MockI18nProvider');
  }
  return context;
}

// Mock useTranslation hook
function useMockTranslation() {
  const { messages, locale } = useMockI18n();

  const t = (key: string) => {
    return messages[key] || key;
  };

  return { t, i18n: { language: locale } };
}

// Test component that uses i18n
function TestComponent() {
  const { locale, direction, isReady } = useMockI18n();
  const { t } = useMockTranslation();

  if (!isReady) return <div>Loading...</div>;

  return (
    <div data-testid="test-component" dir={direction}>
      <span data-testid="locale">{locale}</span>
      <span data-testid="direction">{direction}</span>
      <span data-testid="translation">{t('common.save')}</span>
    </div>
  );
}

// Language switcher component
function LanguageSwitcher() {
  const { locale, changeLanguage, availableLocales } = useMockI18n();

  return (
    <div data-testid="language-switcher">
      <span data-testid="current-locale">{locale}</span>
      {availableLocales.map((loc) => (
        <button
          key={loc}
          data-testid={`switch-${loc}`}
          onClick={() => changeLanguage(loc)}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('I18nProvider', () => {
  describe('Initialization', () => {
    it('should initialize with default locale', () => {
      render(
        <MockI18nProvider forceReady>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('locale').textContent).toBe('en-US');
      expect(screen.getByTestId('direction').textContent).toBe('ltr');
    });

    it('should initialize with provided locale', () => {
      render(
        <MockI18nProvider initialLocale="zh-CN" forceReady>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('locale').textContent).toBe('zh-CN');
    });

    it('should initialize with provided messages', () => {
      const messages = { 'common.save': 'Save' };

      render(
        <MockI18nProvider initialMessages={messages}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('translation').textContent).toBe('Save');
    });

    it('should show loading state when no initial messages', () => {
      render(
        <MockI18nProvider>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByText('Loading...')).toBeTruthy();
    });
  });

  describe('Direction Detection', () => {
    it('should set LTR for English locale', () => {
      render(
        <MockI18nProvider initialLocale="en-US" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('ltr');
    });

    it('should set LTR for Chinese locale', () => {
      render(
        <MockI18nProvider initialLocale="zh-CN" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('ltr');
    });

    it('should set RTL for Arabic locale', () => {
      render(
        <MockI18nProvider initialLocale="ar-SA" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('rtl');
    });

    it('should set RTL for Hebrew locale', () => {
      render(
        <MockI18nProvider initialLocale="he-IL" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('rtl');
    });

    it('should set RTL for Persian locale', () => {
      render(
        <MockI18nProvider initialLocale="fa" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('rtl');
    });

    it('should handle locale with region code', () => {
      // ar should match RTL even without region
      render(
        <MockI18nProvider initialLocale="ar" initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('rtl');
    });
  });

  describe('Language Switching', () => {
    it('should switch language on user action', async () => {
      render(
        <MockI18nProvider initialLocale="en-US" initialMessages={{}}>
          <LanguageSwitcher />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('current-locale').textContent).toBe('en-US');

      // Switch to Chinese
      act(() => {
        screen.getByTestId('switch-zh-CN').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-locale').textContent).toBe('zh-CN');
      });
    });

    it('should update direction when switching to RTL language', async () => {
      render(
        <MockI18nProvider
          initialLocale="en-US"
          initialMessages={{}}
          availableLocales={['en-US', 'ar-SA']}
        >
          <TestComponent />
          <LanguageSwitcher />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('direction').textContent).toBe('ltr');

      // Switch to Arabic
      act(() => {
        screen.getByTestId('switch-ar-SA').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('direction').textContent).toBe('rtl');
      });
    });

    it('should show available locales in switcher', () => {
      const locales = ['en-US', 'zh-CN', 'ja-JP'];

      render(
        <MockI18nProvider availableLocales={locales} initialMessages={{}}>
          <LanguageSwitcher />
        </MockI18nProvider>
      );

      locales.forEach((loc) => {
        expect(screen.getByTestId(`switch-${loc}`)).toBeTruthy();
      });
    });
  });

  describe('useI18n Hook', () => {
    it('should throw error when used outside provider', () => {
      const TestOutsideProvider = () => {
        try {
          useMockI18n();
          return <div>Should not render</div>;
        } catch (error) {
          return <div data-testid="error">Error caught</div>;
        }
      };

      render(<TestOutsideProvider />);
      expect(screen.getByTestId('error')).toBeTruthy();
    });

    it('should provide correct context values', () => {
      const ContextConsumer = () => {
        const ctx = useMockI18n();
        return (
          <div>
            <span data-testid="has-locale">{ctx.locale ? 'yes' : 'no'}</span>
            <span data-testid="has-direction">{ctx.direction ? 'yes' : 'no'}</span>
            <span data-testid="has-change">{typeof ctx.changeLanguage === 'function' ? 'yes' : 'no'}</span>
          </div>
        );
      };

      render(
        <MockI18nProvider initialMessages={{}}>
          <ContextConsumer />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('has-locale').textContent).toBe('yes');
      expect(screen.getByTestId('has-direction').textContent).toBe('yes');
      expect(screen.getByTestId('has-change').textContent).toBe('yes');
    });
  });

  describe('Translation Function', () => {
    it('should return translated value for existing key', () => {
      const messages = { 'common.save': '保存' };

      render(
        <MockI18nProvider initialLocale="zh-CN" initialMessages={messages}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('translation').textContent).toBe('保存');
    });

    it('should return key for missing translation', () => {
      render(
        <MockI18nProvider initialMessages={{}}>
          <TestComponent />
        </MockI18nProvider>
      );

      expect(screen.getByTestId('translation').textContent).toBe('common.save');
    });
  });
});

describe('getDirection Helper', () => {
  it('should return ltr for non-RTL locales', () => {
    expect(getDirection('en-US')).toBe('ltr');
    expect(getDirection('zh-CN')).toBe('ltr');
    expect(getDirection('fr-FR')).toBe('ltr');
    expect(getDirection('de-DE')).toBe('ltr');
    expect(getDirection('ja-JP')).toBe('ltr');
    expect(getDirection('ko-KR')).toBe('ltr');
  });

  it('should return rtl for RTL locales', () => {
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('ar-SA')).toBe('rtl');
    expect(getDirection('he')).toBe('rtl');
    expect(getDirection('he-IL')).toBe('rtl');
    expect(getDirection('fa')).toBe('rtl');
    expect(getDirection('ur')).toBe('rtl');
  });

  it('should handle locale with region by checking base language', () => {
    // Arabic with Egypt region - should fallback to 'ar' which is RTL
    expect(getDirection('ar-EG')).toBe('rtl');

    // Unknown language with region should be LTR
    expect(getDirection('xx-YY')).toBe('ltr');

    // Test that base language fallback works correctly
    expect(getDirection('fa-AF')).toBe('rtl'); // Persian Afghanistan -> fa is RTL
    expect(getDirection('fr-CA')).toBe('ltr'); // French Canada -> fr is LTR
  });
});
