/**
 * Media Database Schema
 *
 * Unified table for content assets (images, videos, documents).
 * Replaces the separate `files` + `assets` tables.
 * Variants are stored as self-referencing rows via `parent_id`.
 *
 * System files (exports, imports, temp) do NOT belong here.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

export type StorageProviderType = 'local' | 'minio' | string;

// ============================================================
// Media Table
// ============================================================

export const media = pgTable(
  'media',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Self-reference: variants point to their original media
    parentId: text('parent_id').references((): AnyPgColumn => media.id, { onDelete: 'cascade' }),
    variantName: text('variant_name'),

    // File information
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),

    // Storage information
    storageProvider: text('storage_provider').notNull().$type<StorageProviderType>(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket'),

    // Public access
    publicUrl: text('public_url'),
    isPublic: boolean('is_public').notNull().default(false),

    // Integrity
    checksum: text('checksum'),

    // Image-specific (null for non-image media)
    width: integer('width'),
    height: integer('height'),
    format: text('format'),

    // CMS semantics
    alt: text('alt'),
    title: text('title'),
    tags: text('tags').array().default([]),
    folderPath: text('folder_path'),

    // Extensible metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    // Storage key uniqueness per tenant
    uniqueIndex('media_storage_unique').on(
      table.organizationId,
      table.storageProvider,
      table.storageKey,
    ),
    // Variant name uniqueness per parent
    uniqueIndex('media_parent_variant_unique')
      .on(table.parentId, table.variantName)
      .where(sql`${table.parentId} IS NOT NULL`),
    // Prevent self-referencing
    check('media_no_self_ref', sql`${table.parentId} IS DISTINCT FROM ${table.id}`),
    // Query indexes
    index('idx_media_org_folder')
      .on(table.organizationId, table.folderPath)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_media_org_mime')
      .on(table.organizationId, table.mimeType)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_media_parent')
      .on(table.parentId)
      .where(sql`${table.parentId} IS NOT NULL`),
    index('idx_media_tags')
      .using('gin', table.tags)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_media_org_created')
      .on(table.organizationId, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_media_deleted')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const mediaInsertSchema = createInsertSchema(media);
export const mediaSelectSchema = createSelectSchema(media);

// ============================================================
// Inferred Types
// ============================================================

export type Media = typeof media.$inferSelect;
export type InsertMedia = typeof media.$inferInsert;
