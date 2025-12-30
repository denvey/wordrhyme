import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Menus Table
 *
 * Stores system menus (Core + Plugin), supports permission-based visibility.
 */
export const menus = pgTable('menus', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // Source (来源：core 或 pluginId)
    source: text('source').notNull(), // 'core' | pluginId

    // Multi-Tenant
    organizationId: text('organization_id').notNull(),

    // Menu Metadata
    label: text('label').notNull(), // 显示文本
    icon: text('icon'), // Lucide icon name
    path: text('path').notNull(), // 路由路径

    // Hierarchy
    parentId: text('parent_id'),
    order: integer('order').notNull().default(0),

    // Permission Control
    requiredPermission: text('required_permission'), // 可选

    // Target Application
    target: text('target').notNull().$type<'admin' | 'web'>(),

    // Extensibility
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
    sourceIdx: index('menus_source_idx').on(table.source),
    orgIdx: index('menus_org_idx').on(table.organizationId),
    targetIdx: index('menus_target_idx').on(table.target),
}));

export type Menu = typeof menus.$inferSelect;
export type InsertMenu = typeof menus.$inferInsert;
