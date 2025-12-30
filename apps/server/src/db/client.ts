import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/definitions';

/**
 * PostgreSQL connection using postgres.js driver
 */
const client = postgres(env.DATABASE_URL, {
    max: 20,
    idle_timeout: 30,
});

/**
 * Drizzle ORM instance with schema
 */
export const db = drizzle(client, { schema });

export type Database = typeof db;
