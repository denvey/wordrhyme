import { z } from 'zod';

/**
 * I18n JSONB field type: maps locale → translated string.
 * Example: { "en": "T-Shirt", "zh-CN": "T恤" }
 */
export type I18nField = Record<string, string>;

export const i18nFieldSchema = z.record(z.string(), z.string());

/**
 * Get the best-matching value from an i18n field.
 * Falls back to: exact locale → language prefix → first available → fallback.
 */
export function getI18nValue(
    field: I18nField | string | null | undefined,
    locale: string,
    fallback?: string,
): string {
    if (typeof field === 'string') return field;
    if (!field || typeof field !== 'object') return fallback ?? '';

    // Exact match
    if (field[locale]) return field[locale];

    // Language prefix fallback (e.g. "zh-CN" → "zh")
    const parts = locale.split('-');
    if (parts.length > 1) {
        const lang = parts[0]!;
        if (field[lang]) return field[lang]!;
    }

    // First available value
    const values = Object.values(field);
    if (values.length > 0) return values[0]!;

    return fallback ?? '';
}
