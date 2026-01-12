import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organization } from './auth-schema';

/**
 * Roles Table
 *
 * Stores tenant-scoped role definitions. System roles (owner, admin, member, viewer)
 * are protected from deletion.
 */
export const roles = pgTable(
    'roles',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        slug: text('slug').notNull(),
        description: text('description'),
        isSystem: boolean('is_system').notNull().default(false),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at')
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('roles_org_slug_uidx').on(table.organizationId, table.slug),
        index('roles_organization_id_idx').on(table.organizationId),
    ],
);

export const rolesRelations = relations(roles, ({ one }) => ({
    organization: one(organization, {
        fields: [roles.organizationId],
        references: [organization.id],
    }),
}));

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
