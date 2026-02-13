/**
 * I18n Provider
 *
 * Fetches translations from backend and provides a translation function.
 * Supports version-based caching and language switching.
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
    t: (key: string, params?: Record<string, string | number>) => string;
    isLoading: boolean;
    availableLocales: string[];
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'en-US',
    setLocale: () => {},
    t: (key) => key,
    isLoading: false,
    availableLocales: [],
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

    const handleSetLocale = useCallback((newLocale: string) => {
        setLocale(newLocale);
        localStorage.setItem('locale', newLocale);
        versionRef.current = undefined;
    }, []);

    // Fetch translations
    const { data, isLoading } = trpcAny.i18n.getMessages.useQuery(
        { locale, namespaces: ['common'] },
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
            setMessages(data.messages);
            versionRef.current = data.version;
        }
    }, [data]);

    const t = useCallback(
        (key: string, params?: Record<string, string | number>): string => {
            let value = messages[key] ?? key;
            if (params) {
                for (const [k, v] of Object.entries(params)) {
                    value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                }
            }
            return value;
        },
        [messages]
    );

    const contextValue = useMemo<I18nContextValue>(
        () => ({ locale, setLocale: handleSetLocale, t, isLoading, availableLocales }),
        [locale, handleSetLocale, t, isLoading, availableLocales]
    );

    return (
        <I18nContext.Provider value={contextValue}>
            {children}
        </I18nContext.Provider>
    );
}
