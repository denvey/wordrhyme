import { router, protectedProcedure, requirePermission } from '../trpc';
import { db } from '../../db';
import { permissions } from '../../db/schema/definitions';
import { rolePermissions } from '../../db/schema/role-permissions';
import { eq } from 'drizzle-orm';
import { getPermissionMeta, APP_SUBJECTS, APP_ACTIONS } from '../../permission/constants';
import { PermissionKernel } from '../../permission';

// Permission kernel instance
const kernel = new PermissionKernel();

/**
 * Permissions Router
 *
 * Provides CASL permission metadata and rule sync for Admin UI.
 */
export const permissionsRouter = router({
    /**
     * Get permission metadata for Admin UI dropdowns
     * Returns available subjects and actions with display names
     */
    meta: protectedProcedure
        .use(requirePermission('role:manage:organization'))
        .query(async () => {
            return getPermissionMeta();
        }),

    /**
     * List all available capabilities (Core + Plugin) - Legacy endpoint
     */
    list: protectedProcedure
        .query(async () => {
            const result = await db
                .select()
                .from(permissions)
                .orderBy(permissions.source, permissions.capability);

            return result;
        }),

    /**
     * List capabilities grouped by source - Legacy endpoint
     */
    listGrouped: protectedProcedure
        .query(async () => {
            const result = await db
                .select()
                .from(permissions)
                .orderBy(permissions.source, permissions.capability);

            // Group by source
            const grouped: Record<string, typeof result> = {};
            for (const perm of result) {
                const source = perm.source;
                if (!grouped[source]) {
                    grouped[source] = [];
                }
                grouped[source]!.push(perm);
            }

            return grouped;
        }),

    /**
     * Get current user's permissions as CASL rules
     * Used for frontend ability hydration
     */
    myRules: protectedProcedure
        .query(async ({ ctx }) => {
            if (!ctx.userId || !ctx.tenantId) {
                return { rules: [] };
            }

            // Get user's roles
            const userRoles = (ctx as { userRoles?: string[] }).userRoles ??
                (ctx.userRole ? [ctx.userRole] : []);

            // Load rules from DB
            const rules = await kernel.getRulesForUser(userRoles, ctx.tenantId);

            // Return rules for frontend hydration
            // Frontend can use: createMongoAbility(rules)
            return {
                rules: rules.map(r => ({
                    action: r.action,
                    subject: r.subject,
                    ...(r.fields && r.fields.length > 0 ? { fields: r.fields } : {}),
                    ...(r.conditions ? { conditions: r.conditions } : {}),
                    ...(r.inverted ? { inverted: r.inverted } : {}),
                })),
            };
        }),

    /**
     * Get available subjects (for Admin UI select)
     */
    subjects: protectedProcedure
        .use(requirePermission('role:manage:organization'))
        .query(() => {
            return APP_SUBJECTS;
        }),

    /**
     * Get available actions (for Admin UI select)
     */
    actions: protectedProcedure
        .use(requirePermission('role:manage:organization'))
        .query(() => {
            return APP_ACTIONS;
        }),

    /**
     * List all plugin-registered subjects
     * Returns subjects that were registered by plugins (prefixed with plugin:)
     */
    pluginSubjects: protectedProcedure
        .use(requirePermission('role:manage:organization'))
        .query(async () => {
            // Get distinct subjects from role_permissions that start with "plugin:"
            const result = await db
                .selectDistinct({ subject: rolePermissions.subject })
                .from(rolePermissions)
                .where(eq(rolePermissions.source, rolePermissions.source)); // Non-null source means plugin

            return result
                .filter(r => r.subject.startsWith('plugin:'))
                .map(r => r.subject);
        }),
});
