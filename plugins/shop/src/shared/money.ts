import { z } from 'zod';

/**
 * Monetary amount stored as minor unit (cents/分).
 * Always paired with a currency code (ISO 4217).
 */
export interface MoneyAmount {
    cents: number;
    currency: string;
}

export const moneyAmountSchema = z.object({
    cents: z.number().int(),
    currency: z.string().min(3).max(3),
});

/**
 * Format cents to a decimal string (e.g. 2050 → "20.50").
 */
export function formatMoney(amount: MoneyAmount): string {
    const major = Math.floor(Math.abs(amount.cents) / 100);
    const minor = Math.abs(amount.cents) % 100;
    const sign = amount.cents < 0 ? '-' : '';
    return `${sign}${major}.${String(minor).padStart(2, '0')}`;
}

/**
 * Parse a decimal string to MoneyAmount (e.g. "20.50", "USD" → { cents: 2050, currency: "USD" }).
 */
export function parseMoney(str: string, currency: string): MoneyAmount {
    const num = parseFloat(str);
    if (isNaN(num)) {
        throw new Error(`Invalid money string: "${str}"`);
    }
    return {
        cents: Math.round(num * 100),
        currency,
    };
}

/**
 * Convert cents to decimal number (e.g. 2050 → 20.50).
 */
export function centsToDecimal(cents: number): number {
    return cents / 100;
}

/**
 * Convert decimal number to cents (e.g. 20.50 → 2050).
 */
export function decimalToCents(decimal: number): number {
    return Math.round(decimal * 100);
}
