/**
 * Plugin Schemas - Private tables for plugins
 *
 * Each plugin can define its own tables here.
 * Table names should be prefixed with: plugin_{plugin_name}_{table_name}
 *
 * All plugin tables MUST include:
 * - tenantId: For multi-tenant isolation
 * - pluginId: For plugin isolation (optional but recommended)
 */
import { pgTable, text, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// ============================================================================
// Hello World Plugin Tables
// ============================================================================

/**
 * Hello World Greetings Table
 *
 * Stores greeting messages sent by users.
 * Demonstrates plugin private table with tenant isolation.
 */
export const pluginHelloWorldGreetings = pgTable('plugin_hello_world_greetings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull().default('com.wordrhyme.hello-world'),

    // Greeting data
    name: text('name').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('idx_hello_world_greetings_tenant').on(table.tenantId),
]);

/**
 * Zod schemas for validation
 */
export const insertHelloWorldGreetingSchema = createInsertSchema(pluginHelloWorldGreetings);
export const selectHelloWorldGreetingSchema = createSelectSchema(pluginHelloWorldGreetings);

export type HelloWorldGreeting = typeof pluginHelloWorldGreetings.$inferSelect;
export type NewHelloWorldGreeting = typeof pluginHelloWorldGreetings.$inferInsert;
