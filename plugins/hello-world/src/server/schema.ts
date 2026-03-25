/**
 * Hello World Plugin - Database Schema
 *
 * Example plugin demonstrating database access with auto tenant filtering.
 * Uses Drizzle ORM for type-safe database operations.
 */
import { pluginTable, createPluginInsertSchema, createPluginSelectSchema } from '@wordrhyme/db/plugin';
import { text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Hello World Greetings Table
 *
 * Stores greeting messages sent by users.
 * Demonstrates plugin private table with tenant isolation.
 */
export const helloGreetings = pluginTable('greetings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull().default('com.wordrhyme.hello-world'),

    // Greeting data
    name: text('name').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Zod schemas for validation
 */
export const insertGreetingSchema = createPluginInsertSchema(helloGreetings);
export const selectGreetingSchema = createPluginSelectSchema(helloGreetings);

export type HelloGreeting = typeof helloGreetings.$inferSelect;
export type NewHelloGreeting = typeof helloGreetings.$inferInsert;
