import { pgTable, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { roles } from './roles';
import { menus } from './menus';
import { organization } from './auth-schema';

/**
 * Role Menu Visibility Table
 *
 * Controls which menus are visible to which roles.
 * - organizationId = NULL: Global default (set by platform admin)
 * - organizationId = value: Tenant override (set by tenant admin)
 *
 * Resolution order: tenant override > global default > default hidden
 */
export const roleMenuVisibility = pgTable(
    'role_menu_visibility',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        roleId: text('role_id')
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),
        menuId: text('menu_id')
            .notNull()
            .references(() => menus.id, { onDelete: 'cascade' }),
        // NULL = global default, value = tenant override
        organizationId: text('organization_id')
            .references(() => organization.id, { onDelete: 'cascade' }),
        visible: boolean('visible').notNull().default(true),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at')
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => ({
        // Unique constraint: one record per role + menu + organization
        uqRoleMenuOrg: uniqueIndex('uq_role_menu_visibility').on(
            table.roleId,
            table.menuId,
            table.organizationId
        ),
        // Query optimization indexes
        idxOrgRole: index('idx_rmv_org_role').on(table.organizationId, table.roleId),
        idxMenuOrg: index('idx_rmv_menu_org').on(table.menuId, table.organizationId),
        idxRoleId: index('idx_rmv_role_id').on(table.roleId),
    })
);

export const roleMenuVisibilityRelations = relations(roleMenuVisibility, ({ one }) => ({
    role: one(roles, {
        fields: [roleMenuVisibility.roleId],
        references: [roles.id],
    }),
    menu: one(menus, {
        fields: [roleMenuVisibility.menuId],
        references: [menus.id],
    }),
    organization: one(organization, {
        fields: [roleMenuVisibility.organizationId],
        references: [organization.id],
    }),
}));

export type RoleMenuVisibility = typeof roleMenuVisibility.$inferSelect;
export type InsertRoleMenuVisibility = typeof roleMenuVisibility.$inferInsert;
