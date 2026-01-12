import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { roles } from './roles';

/**
 * Role Permissions Table (CASL Format)
 *
 * Maps roles to CASL-compatible permission rules. Cascade deletes when role is deleted.
 *
 * CASL Rule Format:
 * - action: The action being permitted (e.g., 'read', 'update', 'manage')
 * - subject: The resource being protected (e.g., 'User', 'Order', 'all')
 * - fields: Optional array of allowed fields for field-level security
 * - conditions: Optional JSON object for ABAC conditions (e.g., { "ownerId": "${user.id}" })
 * - inverted: If true, this is a "cannot" rule (deny instead of allow)
 * - source: Plugin ID if this permission was registered by a plugin
 */
export const rolePermissions = pgTable(
    'role_permissions',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        roleId: text('role_id')
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),
        // CASL rule fields
        action: text('action').notNull(),
        subject: text('subject').notNull(),
        fields: jsonb('fields').$type<string[] | null>(),
        conditions: jsonb('conditions').$type<Record<string, unknown> | null>(),
        inverted: boolean('inverted').notNull().default(false),
        // Plugin tracking
        source: text('source'), // Plugin ID if from a plugin, null for core permissions
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => [
        // Unique constraint on role + action + subject + conditions combination
        uniqueIndex('role_permissions_role_action_subject_uidx').on(
            table.roleId,
            table.action,
            table.subject,
        ),
        index('role_permissions_role_id_idx').on(table.roleId),
        index('role_permissions_source_idx').on(table.source),
    ],
);

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
    role: one(roles, {
        fields: [rolePermissions.roleId],
        references: [roles.id],
    }),
}));

export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = typeof rolePermissions.$inferInsert;

/**
 * Type for CASL rule representation (used in API responses)
 */
export interface CaslRule {
    action: string;
    subject: string;
    fields?: string[] | null;
    conditions?: Record<string, unknown> | null;
    inverted?: boolean;
}
