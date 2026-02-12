import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@wordrhyme/db/schema';
import { relations } from '@wordrhyme/db/relations';
import { env } from '../config/env.js';

/**
 * Drizzle ORM instance with schema and relations (v2 style)
 * Uses connection string directly (new v1 API)
 *
 * Note: Using type assertion due to drizzle-orm beta type inference issues
 * with the new relations API. This is safe as the runtime behavior is correct.
 *
 * IMPORTANT: Drizzle v1/v2 Query API Migration
 * - db.query (v2): Uses object-based where syntax: { id: 1, name: { like: '%foo%' } }
 * - db._query (v1): Uses function-based where syntax: and(eq(table.id, 1), ...)
 *
 * Current codebase uses v1 function-based syntax, so use db._query for all queries.
 * @see https://orm.drizzle.team/docs/relations-v1-v2
 */
export const db = drizzle(env.DATABASE_URL, {
    schema,
    relations,
} as any);

export type Database = typeof db;
