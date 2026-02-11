/**
 * Assets Database Schema
 *
 * Drizzle ORM table definitions for CMS asset management.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';
import { files } from './files';

// ============================================================
// Types
// ============================================================

/**
 * Asset Type
 */
export type AssetType = 'image' | 'video' | 'document' | 'other';

/**
 * Variant Info (stored inline as JSONB)
 */
export interface AssetVariantInfo {
  name: string;
  fileId: string;
  width: number;
  height: number;
  format: string;
  createdAt: string;
}

// ============================================================
// Assets Table
// ============================================================

/**
 * Assets Table
 *
 * Represents files with CMS semantics (images, videos, documents).
 * Each asset references an underlying file and adds metadata.
 * Variants are stored inline as JSONB for simplicity.
 */
export const assets = pgTable(
  'assets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // FK to files table
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),

    // Asset type
    type: text('type').notNull().$type<AssetType>(),

    // Image-specific info (only when type='image')
    width: integer('width'),
    height: integer('height'),
    format: text('format'),

    // Organization
    alt: text('alt'),
    title: text('title'),
    tags: text('tags').array().default([]),
    folderPath: text('folder_path'),

    // Variants (inline JSONB instead of separate table)
    variants: jsonb('variants').$type<AssetVariantInfo[]>().default([]),

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
    // Organization index (partial - exclude deleted)
    index('idx_assets_tenant')
      .on(table.organizationId)
      .where(sql`${table.deletedAt} IS NULL`),
    // Type index
    index('idx_assets_type')
      .on(table.organizationId, table.type)
      .where(sql`${table.deletedAt} IS NULL`),
    // Folder path index
    index('idx_assets_folder')
      .on(table.organizationId, table.folderPath)
      .where(sql`${table.deletedAt} IS NULL`),
    // Tags GIN index for array queries
    index('idx_assets_tags')
      .using('gin', table.tags)
      .where(sql`${table.deletedAt} IS NULL`),
    // Deleted index for cleanup queries
    index('idx_assets_deleted')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const assetSchema = createInsertSchema(assets);

// ============================================================
// Inferred Types
// ============================================================

export type Asset = typeof assets.$inferSelect;
