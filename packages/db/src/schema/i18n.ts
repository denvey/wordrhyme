/**
 * i18n Database Schema
 *
 * Drizzle ORM table definitions for internationalization.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organization } from './auth';
import { paginationSchema } from './common';

// ============================================================
// Types
// ============================================================

/**
 * i18n Message Type
 * - page: Frontend UI text (buttons, labels, messages)
 * - api: Backend API text (error messages, notifications)
 */
export type I18nMessageType = 'page' | 'api';

/**
 * i18n Message Source
 * - core: System built-in translations
 * - plugin: Plugin-provided translations
 * - user: User-created translations
 */
export type I18nMessageSource = 'core' | 'plugin' | 'user';

/**
 * Text Direction
 */
export type I18nDirection = 'ltr' | 'rtl';

/**
 * Translations JSONB structure
 * Key: BCP 47 locale code (e.g., "en-US", "zh-CN")
 * Value: Translated text
 */
export type TranslationsObject = Record<string, string>;

// ============================================================
// Tables
// ============================================================

/**
 * i18n Languages Table
 *
 * Stores available languages for each organization.
 * Each organization has exactly one default language.
 *
 * @example
 * { locale: 'zh-CN', name: '简体中文', isDefault: true }
 * { locale: 'en-US', name: 'English', isDefault: false }
 */
export const i18nLanguages = pgTable(
  'i18n_languages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Language identification (BCP 47)
    locale: text('locale').notNull(), // e.g., 'en-US', 'zh-CN', 'ar-SA'
    name: text('name').notNull(), // e.g., 'English', '简体中文', 'العربية'
    nativeName: text('native_name'), // e.g., 'English', '中文', 'العربية'

    // Status
    isDefault: boolean('is_default').notNull().default(false),
    isEnabled: boolean('is_enabled').notNull().default(true),

    // Display order
    sortOrder: integer('sort_order').notNull().default(0),

    // RTL support
    direction: text('direction').notNull().default('ltr').$type<I18nDirection>(),

    // Audit fields
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Each locale is unique per organization
    uniqueIndex('i18n_languages_org_locale_uidx').on(
      table.organizationId,
      table.locale
    ),
    // Fast lookup by organization
    index('i18n_languages_org_idx').on(table.organizationId),
    // Fast lookup for enabled languages
    index('i18n_languages_enabled_idx').on(table.organizationId, table.isEnabled),
  ]
);

/**
 * i18n Messages Table
 *
 * Stores UI translation entries with JSONB for multi-language values.
 * This is for UI text (buttons, labels, messages), NOT content data.
 *
 * @example
 * {
 *   key: 'order.submit',
 *   namespace: 'commerce',
 *   type: 'page',
 *   translations: { 'zh-CN': '提交订单', 'en-US': 'Submit Order' }
 * }
 */
export const i18nMessages = pgTable(
  'i18n_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Message identification
    key: text('key').notNull(), // e.g., 'order.submit', 'common.save'
    namespace: text('namespace').notNull(), // e.g., 'core', 'admin', 'plugin:dsneo.orders'

    // Message type
    type: text('type').notNull().default('page').$type<I18nMessageType>(),

    // Translations (JSONB)
    translations: jsonb('translations')
      .notNull()
      .default({})
      .$type<TranslationsObject>(),

    // Description for translators
    description: text('description'),

    // Source tracking
    source: text('source').notNull().default('user').$type<I18nMessageSource>(),
    sourceId: text('source_id'), // Plugin ID if source is 'plugin'

    // User modification tracking (for plugin upgrade protection)
    userModified: boolean('user_modified').notNull().default(false),

    // Status
    isEnabled: boolean('is_enabled').notNull().default(true),

    // Version for optimistic locking
    version: integer('version').notNull().default(1),

    // Audit fields
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Each key is unique per organization + namespace
    uniqueIndex('i18n_messages_org_ns_key_uidx').on(
      table.organizationId,
      table.namespace,
      table.key
    ),
    // Fast lookup by organization
    index('i18n_messages_org_idx').on(table.organizationId),
    // Fast lookup by namespace (for loading translations)
    index('i18n_messages_org_ns_idx').on(table.organizationId, table.namespace),
    // Fast lookup by source (for plugin lifecycle)
    index('i18n_messages_source_idx').on(table.source, table.sourceId),
  ]
);

// ============================================================
// Zod Schemas
// ============================================================

/**
 * BCP 47 locale code pattern
 * Examples: 'en', 'en-US', 'zh-CN', 'ar-SA'
 */
export const localeSchema = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid BCP 47 locale format (e.g., "en" or "en-US")');

export const translationsObjectSchema = z.record(z.string(), z.string());

export const i18nDirectionSchema = z.enum(['ltr', 'rtl']);
export const i18nMessageTypeSchema = z.enum(['page', 'api']);
export const i18nMessageSourceSchema = z.enum(['core', 'plugin', 'user']);

/** Base Schema - 直接用于 Create/Update */
export const i18nLanguageSchema = createInsertSchema(i18nLanguages, {
  locale: (schema) => schema.min(2).max(16).regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid BCP 47 locale format'),
  name: (schema) => schema.min(1).max(50),
  nativeName: (schema) => schema.max(50),
});

/** Base Schema - 直接用于 Create/Update */
export const i18nMessageSchema = createInsertSchema(i18nMessages, {
  key: (schema) => schema.min(1).max(200),
  namespace: (schema) => schema.min(1).max(100),
});

// ============================================================
// Query Schemas
// ============================================================

/** Get translations for client (public API) */
export const getI18nMessagesQuery = z.object({
  locale: z.string().min(2).max(16),
  namespaces: z.array(z.string()).optional(),
  version: z.string().optional(),
});

/** List languages */
export const listI18nLanguagesQuery = paginationSchema.partial();

/** List messages */
export const listI18nMessagesQuery = z.object({
  namespace: z.string().optional(),
  key: z.string().optional(),
}).merge(paginationSchema.partial());

// ============================================================
// Mutation Schemas
// ============================================================

/** Set default language mutation */
export const setDefaultLanguageMutation = z.object({
  locale: z.string(),
});

/** Batch update messages mutation */
export const batchUpdateMessagesMutation = z.object({
  messages: z.array(z.object({
    key: z.string(),
    namespace: z.string(),
    translations: translationsObjectSchema,
  })),
});

// ============================================================
// Inferred Types
// ============================================================

export type I18nLanguage = typeof i18nLanguages.$inferSelect;
export type I18nMessage = typeof i18nMessages.$inferSelect;
