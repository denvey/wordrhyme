/**
 * Default Roles Seeding
 *
 * Seeds default system roles when an organization is created.
 * Uses CASL format for permissions.
 *
 * Menu visibility is now based on requiredPermission in each menu definition,
 * no longer stored in role_menu_visibility table.
 */
import { roles, rolePermissions } from '../schema/definitions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = { insert: (table: any) => any; select: () => any };

/**
 * CASL Rule definition
 */
interface CaslRuleDef {
    action: string;
    subject: string;
    fields?: string[] | null;
    conditions?: Record<string, unknown> | null;
    inverted?: boolean;
}

/**
 * Role definition with CASL rules
 */
interface RoleDef {
    slug: string;
    name: string;
    description: string;
    rules: CaslRuleDef[];
}

/**
 * Default system role definitions with CASL rules.
 * Matches PERMISSION_GOVERNANCE.md governance document.
 */
export const DEFAULT_SYSTEM_ROLES: RoleDef[] = [
    {
        slug: 'owner',
        name: 'Owner',
        description: 'Full access to all resources',
        rules: [
            { action: 'manage', subject: 'all' },
        ],
    },
    {
        slug: 'admin',
        name: 'Administrator',
        description: 'Manage organization, plugins, users, and content',
        rules: [
            { action: 'manage', subject: 'Organization' },
            { action: 'manage', subject: 'Plugin' },
            { action: 'manage', subject: 'User' },
            { action: 'manage', subject: 'Content' },
            { action: 'manage', subject: 'Role' },
            { action: 'manage', subject: 'Menu' },
            { action: 'manage', subject: 'File' },
            { action: 'manage', subject: 'Asset' },
            { action: 'manage', subject: 'Webhook' },
            { action: 'manage', subject: 'Hook' },
            { action: 'manage', subject: 'Core' },
            { action: 'manage', subject: 'System' },
            { action: 'update', subject: 'Settings' },
            { action: 'update', subject: 'FeatureFlag' },
            { action: 'read', subject: 'AuditLog' },
            { action: 'manage', subject: 'AuditLog' },
        ],
    },
    {
        slug: 'member',
        name: 'Member',
        description: 'Read content and comment',
        rules: [
            { action: 'read', subject: 'Content' },
            { action: 'create', subject: 'Content' },
            { action: 'update', subject: 'Content', conditions: { ownerId: '${user.id}' } },
            { action: 'read', subject: 'User' },
        ],
    },
    {
        slug: 'viewer',
        name: 'Viewer',
        description: 'Read public content only',
        rules: [
            { action: 'read', subject: 'Content' },
        ],
    },
];

/**
 * Seeds default system roles for an organization.
 *
 * @param organizationId - The organization to seed roles for
 * @param database - Database instance
 */
export async function seedDefaultRoles(
    organizationId: string,
    database: AnyDatabase,
): Promise<void> {
    const db = database;

    for (const roleDef of DEFAULT_SYSTEM_ROLES) {
        // Create the role
        const [role] = await db
            .insert(roles)
            .values({
                organizationId,
                name: roleDef.name,
                slug: roleDef.slug,
                description: roleDef.description,
                isSystem: true,
            })
            .onConflictDoNothing()
            .returning();

        // If role was created (not a conflict), add permissions
        if (role) {
            for (const rule of roleDef.rules) {
                await db
                    .insert(rolePermissions)
                    .values({
                        roleId: role.id,
                        action: rule.action,
                        subject: rule.subject,
                        fields: rule.fields ?? null,
                        conditions: rule.conditions ?? null,
                        inverted: rule.inverted ?? false,
                    })
                    .onConflictDoNothing();
            }
        }
    }
}

export type DefaultRoleSlug = typeof DEFAULT_SYSTEM_ROLES[number]['slug'];
