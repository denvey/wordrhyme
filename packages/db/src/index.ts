/**
 * @wordrhyme/db - Shared Database Types and Schemas
 *
 * This package provides shared database schema definitions and Zod schemas
 * for use across frontend and backend applications.
 *
 * ## Architecture
 *
 * ```
 * Drizzle Schema (source of truth)
 *       ↓
 * drizzle-zod (generates)
 *       ↓
 * Zod Schemas (runtime validation)
 * ```
 *
 * @example
 * ```typescript
 * // Import Drizzle tables and types
 * import { i18nLanguages, i18nMessages, type I18nLanguage } from '@wordrhyme/db';
 *
 * // Import Zod schemas for forms/tables
 * import { selectI18nLanguageSchema } from '@wordrhyme/db/zod';
 * ```
 */

// Re-export all schema tables and types
export * from './schema';

// Re-export relations
export * from './relations';

// Plugin schema helpers
export * from './plugin';
