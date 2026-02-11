/**
 * Files Database Schema
 *
 * Drizzle ORM table definitions for file storage management.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * Storage Provider Types
 */
export type StorageProviderType = 'local' | 's3' | 'oss' | 'r2' | string;

// ============================================================
// Files Table
// ============================================================

/**
 * Files Table
 *
 * Stores raw file metadata and storage information.
 * Each file is isolated by organization_id.
 */
export const files = pgTable(
  'files',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // File information
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),

    // Storage information
    storageProvider: text('storage_provider').notNull().$type<StorageProviderType>(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket'),

    // Public access
    publicUrl: text('public_url'),
    isPublic: boolean('is_public').notNull().default(false),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    checksum: text('checksum'),

    // Audit
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    // Unique constraint on tenant + storage
    uniqueIndex('files_storage_unique').on(
      table.organizationId,
      table.storageProvider,
      table.storageKey,
    ),
    // Organization index (partial - exclude deleted)
    index('idx_files_tenant')
      .on(table.organizationId)
      .where(sql`${table.deletedAt} IS NULL`),
    // MIME type index
    index('idx_files_mime')
      .on(table.organizationId, table.mimeType)
      .where(sql`${table.deletedAt} IS NULL`),
    // Created date index
    index('idx_files_created')
      .on(table.organizationId, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    // Deleted index for cleanup queries
    index('idx_files_deleted')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const fileSchema = createInsertSchema(files);

// ============================================================
// Inferred Types
// ============================================================

export type File = typeof files.$inferSelect;
