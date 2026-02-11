/**
 * I18nProvider Component
 *
 * Provides i18n context to the application with:
 * - Initial loading from tRPC backend
 * - LocalStorage caching with version validation
 * - Language switching support
 * - RTL direction support
 *
 * @see design.md D4: 前端 SSR 集成
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';
import { trpc } from '../trpc';
import { useAuth } from '../auth';
import {
  i18n,
  initI18n,
  addI18nResources,
  getCachedMessages,
  setCachedMessages,
  getCachedVersion,
  getSavedLocale,
  saveLocale,
  DEFAULT_NAMESPACES,
  DEFAULT_LOCALE,
} from './config';

/**
 * Text direction type
 */
type TextDirection = 'ltr' | 'rtl';

/**
 * RTL locales
 */
const RTL_LOCALES = new Set(['ar', 'ar-SA', 'ar-EG', 'he', 'he-IL', 'fa', 'fa-IR', 'ur']);

/**
 * Get text direction for a locale
 */
function getDirection(locale: string): TextDirection {
  if (RTL_LOCALES.has(locale)) {
    return 'rtl';
  }
  const langCode = locale.split('-')[0];
  if (langCode && RTL_LOCALES.has(langCode)) {
    return 'rtl';
  }
  return 'ltr';
}

/**
 * I18n Context value
 */
interface I18nContextValue {
  locale: string;
  direction: TextDirection;
  isLoading: boolean;
  isReady: boolean;
  changeLanguage: (locale: string) => Promise<void>;
  availableLocales: string[];
}

/**
 * I18n Context
 */
const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * I18nProvider Props
 */
interface I18nProviderProps {
  children: ReactNode;
  /** Initial locale (optional, uses saved or default) */
  initialLocale?: string;
  /** Initial messages for SSR (optional) */
  initialMessages?: Record<string, Record<string, string>>;
  /** Namespaces to load */
  namespaces?: string[];
}

/**
 * I18nProvider Component
 */
export function I18nProvider({
  children,
  initialLocale,
  initialMessages,
  namespaces = DEFAULT_NAMESPACES,
}: I18nProviderProps) {
  const { isAuthenticated } = useAuth();
  const [locale, setLocale] = useState(initialLocale || getSavedLocale());
  const [direction, setDirection] = useState<TextDirection>(getDirection(locale));
  const [isLoading, setIsLoading] = useState(!initialMessages);
  const [isReady, setIsReady] = useState(!!initialMessages);
  const [availableLocales, setAvailableLocales] = useState<string[]>([DEFAULT_LOCALE]);

  // tRPC query for fetching messages (only when authenticated)
  const getMessagesQuery = trpc.i18n.getMessages.useQuery(
    {
      locale,
      namespaces,
      version: getCachedVersion(locale, namespaces[0] || 'core') || undefined,
    },
    {
      enabled: isAuthenticated && !initialMessages && isLoading,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    }
  );

  // tRPC query for available languages (only when authenticated)
  const languagesQuery = trpc.i18n.languages.list.useQuery({}, {
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Initialize i18n on mount
  useEffect(() => {
    if (initialMessages) {
      // SSR: Use provided messages
      initI18n(locale, initialMessages);
      setIsReady(true);
      setIsLoading(false);
    } else {
      // Client: Try cache first
      const allCached: Record<string, Record<string, string>> = {};
      let hasCached = true;

      for (const ns of namespaces) {
        const cached = getCachedMessages(locale, ns);
        if (cached) {
          allCached[ns] = cached.messages;
        } else {
          hasCached = false;
          break;
        }
      }

      if (hasCached && Object.keys(allCached).length > 0) {
        initI18n(locale, allCached);
        setIsReady(true);
        // Still fetch to check for updates
      } else {
        // Initialize with empty resources, will be populated by query
        initI18n(locale, {});
      }
    }
  }, []);

  // Handle query results
  useEffect(() => {
    if (getMessagesQuery.data) {
      const { messages, version, notModified } = getMessagesQuery.data;

      if (!notModified && Object.keys(messages).length > 0) {
        // Add new messages to i18n
        for (const ns of namespaces) {
          addI18nResources(locale, ns, messages);
          setCachedMessages(locale, ns, messages, version);
        }
      }

      setIsReady(true);
      setIsLoading(false);
    }
  }, [getMessagesQuery.data, locale, namespaces]);

  // Handle languages query
  useEffect(() => {
    if (!languagesQuery.data) return;

    const items = Array.isArray(languagesQuery.data)
      ? languagesQuery.data
      : languagesQuery.data.data;

    if (!Array.isArray(items)) return;

    const locales = items
      .filter((lang: { isEnabled: boolean }) => lang.isEnabled)
      .map((lang: { locale: string }) => lang.locale);
    setAvailableLocales(locales.length > 0 ? locales : [DEFAULT_LOCALE]);
  }, [languagesQuery.data]);

  // Change language handler
  const changeLanguage = useCallback(
    async (newLocale: string) => {
      if (newLocale === locale) return;

      setIsLoading(true);
      setLocale(newLocale);
      saveLocale(newLocale);

      // Update direction
      const newDirection = getDirection(newLocale);
      setDirection(newDirection);
      document.documentElement.dir = newDirection;
      document.documentElement.lang = newLocale;

      // Change i18n language
      await i18n.changeLanguage(newLocale);

      // Check cache
      const allCached: Record<string, Record<string, string>> = {};
      let hasCached = true;

      for (const ns of namespaces) {
        const cached = getCachedMessages(newLocale, ns);
        if (cached) {
          allCached[ns] = cached.messages;
          addI18nResources(newLocale, ns, cached.messages);
        } else {
          hasCached = false;
        }
      }

      if (hasCached) {
        setIsLoading(false);
        setIsReady(true);
      }
      // Query will refetch due to locale change
    },
    [locale, namespaces]
  );

  // Update direction on mount
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = locale;
  }, [direction, locale]);

  const contextValue: I18nContextValue = {
    locale,
    direction,
    isLoading,
    isReady,
    changeLanguage,
    availableLocales,
  };

  return (
    <I18nContext.Provider value={contextValue}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}

/**
 * Hook to access i18n context
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook for language switching
 */
export function useLanguageSwitcher() {
  const { locale, changeLanguage, availableLocales, isLoading } = useI18n();

  return {
    currentLocale: locale,
    availableLocales,
    isChanging: isLoading,
    switchTo: changeLanguage,
  };
}
