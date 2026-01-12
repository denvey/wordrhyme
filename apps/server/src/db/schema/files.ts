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

/**
 * Storage Provider Types
 */
export type StorageProviderType = 'local' | 's3' | 'oss' | 'r2' | string;

/**
 * Files Table
 *
 * Stores raw file metadata and storage information.
 * Each file is isolated by tenant_id.
 */
export const files = pgTable(
  'files',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    tenantId: text('tenant_id').notNull(),

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
  (table) => ({
    // Unique constraint on tenant + storage
    storageUniqueIdx: uniqueIndex('files_storage_unique').on(
      table.tenantId,
      table.storageProvider,
      table.storageKey
    ),
    // Tenant index (partial - exclude deleted)
    tenantIdx: index('idx_files_tenant')
      .on(table.tenantId)
      .where(sql`${table.deletedAt} IS NULL`),
    // MIME type index
    mimeIdx: index('idx_files_mime')
      .on(table.tenantId, table.mimeType)
      .where(sql`${table.deletedAt} IS NULL`),
    // Created date index
    createdIdx: index('idx_files_created')
      .on(table.tenantId, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    // Deleted index for cleanup queries
    deletedIdx: index('idx_files_deleted')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),
  })
);

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

// Note: File relations are defined in assets.ts to avoid circular imports
// Note: Multipart upload state is stored in Redis (not in database)
