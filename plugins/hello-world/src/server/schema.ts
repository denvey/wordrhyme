/**
 * Hello World Plugin - Database Schema
 *
 * Example plugin demonstrating database access with auto tenant filtering.
 * Uses Drizzle ORM for type-safe database operations.
 */
import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Hello World Greetings Table
 *
 * Stores greeting messages sent by users.
 * Demonstrates plugin private table with tenant isolation.
 */
export const helloGreetings = pgTable('plugin_com_wordrhyme_hello_world_greetings', {
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
export const insertGreetingSchema = createInsertSchema(helloGreetings);
export const selectGreetingSchema = createSelectSchema(helloGreetings);

export type HelloGreeting = typeof helloGreetings.$inferSelect;
export type NewHelloGreeting = typeof helloGreetings.$inferInsert;
