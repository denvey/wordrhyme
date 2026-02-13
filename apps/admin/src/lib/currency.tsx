/**
 * Currency Provider
 *
 * Fetches enabled currencies and exchange rates from backend.
 * Provides formatting, conversion, and currency switching utilities.
 */
import {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    type ReactNode,
} from 'react';
import { trpc } from './trpc';
import { useI18n } from './i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

interface CurrencyInfo {
    code: string;
    nameI18n: Record<string, string>;
    symbol: string;
    decimalDigits: number;
    isBase: boolean;
    currentRate: string | null;
}

interface CurrencyContextValue {
    currencies: CurrencyInfo[];
    baseCurrency: string | undefined;
    currentCurrencyCode: string | undefined;
    isLoading: boolean;
    setCurrentCurrency: (code: string) => void;
    formatAmount: (amountCents: number, currencyCode: string) => string;
    getCurrency: (code: string) => CurrencyInfo | undefined;
}

const DEFAULT_CURRENCY: CurrencyInfo = {
    code: 'USD',
    nameI18n: { 'en-US': 'US Dollar' },
    symbol: '$',
    decimalDigits: 2,
    isBase: true,
    currentRate: null,
};

const CurrencyContext = createContext<CurrencyContextValue>({
    currencies: [],
    baseCurrency: undefined,
    currentCurrencyCode: undefined,
    isLoading: false,
    setCurrentCurrency: () => {},
    formatAmount: () => '',
    getCurrency: () => undefined,
});

export function useCurrency() {
    return useContext(CurrencyContext);
}

/**
 * Hook for currency switching UI components.
 * Returns current currency, available currencies, and switch function.
 */
export function useCurrencySwitcher() {
    const { currencies, currentCurrencyCode, isLoading, setCurrentCurrency, getCurrency } =
        useContext(CurrencyContext);

    const currentCurrency = getCurrency(currentCurrencyCode ?? '') ?? currencies[0] ?? DEFAULT_CURRENCY;

    return {
        currentCurrency,
        availableCurrencies: currencies,
        isChanging: isLoading,
        switchTo: setCurrentCurrency,
    };
}

interface CurrencyProviderProps {
    children: ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
    const { locale } = useI18n();

    const [currentCurrencyCode, setCurrentCurrencyCode] = useState<string | undefined>(
        () => localStorage.getItem('currency') ?? undefined
    );

    const { data, isLoading } = trpcAny.currency.getCurrencies.useQuery(undefined, {
        staleTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    const currencies = (data ?? []) as CurrencyInfo[];

    const baseCurrency = useMemo(
        () => currencies.find((c) => c.isBase)?.code,
        [currencies]
    );

    // Default to base currency if no selection
    const effectiveCurrencyCode = currentCurrencyCode ?? baseCurrency;

    const currencyMap = useMemo(
        () => new Map<string, CurrencyInfo>(currencies.map((c) => [c.code, c])),
        [currencies]
    );

    const setCurrentCurrency = useCallback((code: string) => {
        setCurrentCurrencyCode(code);
        localStorage.setItem('currency', code);
    }, []);

    const formatAmount = useMemo(() => {
        return (amountCents: number, currencyCode: string): string => {
            const currency = currencyMap.get(currencyCode);
            const digits = currency?.decimalDigits ?? 2;
            const amount = amountCents / Math.pow(10, digits);

            try {
                return new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: currencyCode,
                    minimumFractionDigits: digits,
                    maximumFractionDigits: digits,
                }).format(amount);
            } catch {
                const symbol = currency?.symbol ?? currencyCode;
                return `${symbol}${amount.toFixed(digits)}`;
            }
        };
    }, [currencyMap, locale]);

    const getCurrency = useCallback(
        (code: string): CurrencyInfo | undefined => currencyMap.get(code),
        [currencyMap]
    );

    const contextValue = useMemo<CurrencyContextValue>(
        () => ({
            currencies,
            baseCurrency,
            currentCurrencyCode: effectiveCurrencyCode,
            isLoading,
            setCurrentCurrency,
            formatAmount,
            getCurrency,
        }),
        [currencies, baseCurrency, effectiveCurrencyCode, isLoading, setCurrentCurrency, formatAmount, getCurrency]
    );

    return (
        <CurrencyContext.Provider value={contextValue}>
            {children}
        </CurrencyContext.Provider>
    );
}
