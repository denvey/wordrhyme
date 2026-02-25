/**
 * LocalizedText Component
 *
 * Displays translated text with automatic locale detection.
 * Supports both UI translations (via t()) and content data (via getI18nValue pattern).
 *
 * @example UI Translation
 * ```tsx
 * <LocalizedText i18nKey="common.save" />
 * <LocalizedText i18nKey="common.greeting" values={{ name: 'John' }} />
 * ```
 *
 * @example Content Data
 * ```tsx
 * <LocalizedText content={product.title} />
 * <LocalizedText content={product.title} fallbackLocale="en-US" />
 * ```
 */

import React from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * I18n field type (JSONB translations)
 */
type I18nField = Record<string, string> | null | undefined;

/**
 * Props for LocalizedText component
 */
interface LocalizedTextProps {
  /** i18n key for UI translations (use with react-i18next) */
  i18nKey?: string;
  /** @deprecated namespace is handled automatically */
  ns?: string;
  /** Interpolation values for i18n key */
  values?: Record<string, unknown>;
  /** Content data with translations (JSONB field) */
  content?: I18nField;
  /** Fallback locale for content data */
  fallbackLocale?: string;
  /** Fallback text if no translation found */
  fallback?: string;
  /** HTML tag to render (default: span) */
  as?: React.ElementType;
  /** Additional className */
  className?: string;
  /** Children to render if no translation (acts as fallback) */
  children?: React.ReactNode;
}

/**
 * Get localized value from content data
 */
function getI18nValue(
  field: I18nField,
  locale: string,
  fallbackLocale?: string
): string | undefined {
  if (!field || typeof field !== 'object') {
    return undefined;
  }

  const keys = Object.keys(field);
  if (keys.length === 0) {
    return undefined;
  }

  // Try exact locale match
  if (field[locale] !== undefined) {
    return field[locale];
  }

  // Try fallback locale
  if (fallbackLocale && field[fallbackLocale] !== undefined) {
    return field[fallbackLocale];
  }

  // Try language code only (e.g., "en" from "en-US")
  const languageCode = locale.split('-')[0];
  if (languageCode) {
    for (const key of keys) {
      if (key === languageCode || key.startsWith(languageCode + '-')) {
        return field[key];
      }
    }
  }

  // Return first available value as last resort
  const firstKey = keys[0];
  return firstKey ? field[firstKey] : undefined;
}

/**
 * LocalizedText Component
 */
export function LocalizedText({
  i18nKey,
  // ns is deprecated - namespace is handled by the provider
  values,
  content,
  fallbackLocale,
  fallback,
  as: Component = 'span',
  className,
  children,
}: LocalizedTextProps) {
  const { t, locale } = useI18n();

  let text: string | undefined;

  if (i18nKey) {
    // UI Translation mode
    text = t(i18nKey, values as Record<string, string>) as string;
  } else if (content) {
    // Content Data mode
    text = getI18nValue(content, locale, fallbackLocale);
  }

  // Fallback chain: text -> fallback prop -> children
  const displayText = text || fallback || (typeof children === 'string' ? children : undefined);

  if (!displayText && children) {
    // If no text but has non-string children, render them
    return <Component className={className}>{children}</Component>;
  }

  return <Component className={className}>{displayText}</Component>;
}

export default LocalizedText;
