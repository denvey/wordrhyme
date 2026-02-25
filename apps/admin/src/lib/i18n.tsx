/**
 * I18n Provider
 *
 * Fetches translations from backend and provides a translation function.
 * Supports version-based caching, language switching, and dynamic namespace loading.
 *
 * Namespace design:
 * - 'common': all core/system translations (single namespace for simplicity)
 * - 'plugin.{id}': per-plugin translations (loaded on demand via addNamespace)
 */
import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type ReactNode,
} from 'react';
import { trpc } from './trpc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

interface I18nContextValue {
    locale: string;
    setLocale: (locale: string) => void;
    t: (key: string, paramsOrDefault?: Record<string, string | number> | string) => string;
    isLoading: boolean;
    availableLocales: string[];
    /** Register a plugin namespace for lazy loading */
    addNamespace: (ns: string) => void;
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'en-US',
    setLocale: () => {},
    t: (key) => key,
    isLoading: false,
    availableLocales: [],
    addNamespace: () => {},
});

/**
 * Hook to access i18n context
 */
export function useI18n() {
    return useContext(I18nContext);
}

/**
 * Hook for translation function shorthand
 */
export function useTranslation() {
    const { t, locale, isLoading } = useI18n();
    return { t, locale, isLoading };
}

/**
 * Hook for language switching UI components.
 * Returns current locale, available locales, and switch function.
 */
export function useLanguageSwitcher() {
    const { locale, setLocale, availableLocales, isLoading } = useContext(I18nContext);

    return {
        currentLocale: locale,
        availableLocales,
        isChanging: isLoading,
        switchTo: setLocale,
    };
}

interface I18nProviderProps {
    children: ReactNode;
    defaultLocale?: string;
}

/**
 * I18nProvider - wraps the app to provide translation context
 *
 * Fetches translations from backend i18n.getMessages endpoint.
 * Must be placed inside tRPC provider.
 */
export function I18nProvider({ children, defaultLocale }: I18nProviderProps) {
    const [locale, setLocale] = useState(
        () => defaultLocale ?? localStorage.getItem('locale') ?? navigator.language ?? 'en-US'
    );
    const versionRef = useRef<string | undefined>(undefined);

    // Track all active namespaces (core + dynamically added plugin namespaces)
    const [namespaces, setNamespaces] = useState<string[]>(['common']);

    const handleSetLocale = useCallback((newLocale: string) => {
        setLocale(newLocale);
        localStorage.setItem('locale', newLocale);
        versionRef.current = undefined;
    }, []);

    const addNamespace = useCallback((ns: string) => {
        setNamespaces(prev => {
            if (prev.includes(ns)) return prev;
            return [...prev, ns];
        });
    }, []);

    // Fetch translations for all active namespaces
    const { data, isLoading } = trpcAny.i18n.getMessages.useQuery(
        { locale, namespaces },
        {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
        }
    );

    // Fetch available languages
    const { data: languagesData } = trpcAny.i18n.languages.list.useQuery({ page: 1, perPage: 100, joinOperator: 'and' as const }, {
        staleTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    const availableLocales = useMemo(() => {
        if (!languagesData) return [locale];
        const items = Array.isArray(languagesData) ? languagesData : (languagesData as any).data;
        return (items as Array<{ locale: string; isEnabled: boolean }>)
            .filter((l) => l.isEnabled)
            .map((l) => l.locale);
    }, [languagesData, locale]);

    // Build messages map
    const [messages, setMessages] = useState<Record<string, string>>({});

    useEffect(() => {
        if (data && !data.notModified) {
            setMessages(prev => ({ ...prev, ...data.messages }));
            versionRef.current = data.version;
        }
    }, [data]);

    const t = useCallback(
        (key: string, paramsOrDefault?: Record<string, string | number> | string): string => {
            let value = messages[key];
            if (!value) {
                // If not found and a default string is provided, use it as fallback
                if (typeof paramsOrDefault === 'string') return paramsOrDefault;
                return key;
            }
            if (paramsOrDefault && typeof paramsOrDefault === 'object') {
                for (const [k, v] of Object.entries(paramsOrDefault)) {
                    value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                }
            }
            return value;
        },
        [messages]
    );

    const contextValue = useMemo<I18nContextValue>(
        () => ({ locale, setLocale: handleSetLocale, t, isLoading, availableLocales, addNamespace }),
        [locale, handleSetLocale, t, isLoading, availableLocales, addNamespace]
    );

    return (
        <I18nContext.Provider value={contextValue}>
            {children}
        </I18nContext.Provider>
    );
}
