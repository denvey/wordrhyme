/**
 * Default Roles Seeding
 *
 * Seeds default system roles when an organization is created.
 * Uses CASL format for permissions.
 * Also creates menu visibility records for each role.
 *
 * Menu Visibility Strategy (Plan B - System Smart Defaults):
 * - owner/admin: See all non-platform menus
 * - member: Only see Dashboard
 * - viewer: Only see Dashboard
 */
import { roles, rolePermissions, roleMenuVisibility, menus } from '../schema/definitions';
import { eq, and, notLike, like } from 'drizzle-orm';

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
 * Role definition with CASL rules and menu visibility
 */
interface RoleDef {
    slug: string;
    name: string;
    description: string;
    rules: CaslRuleDef[];
    menuVisibility: 'all' | 'basic' | string[]; // 'all' = all non-platform, 'basic' = dashboard only, or specific menu IDs
}

/**
 * Default system role definitions with CASL rules and menu visibility.
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
        menuVisibility: 'all', // See all non-platform menus
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
        menuVisibility: 'all', // See all non-platform menus
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
        menuVisibility: 'basic', // Only dashboard
    },
    {
        slug: 'viewer',
        name: 'Viewer',
        description: 'Read public content only',
        rules: [
            { action: 'read', subject: 'Content' },
        ],
        menuVisibility: 'basic', // Only dashboard
    },
];

/**
 * Basic menus that member/viewer can see
 */
const BASIC_MENU_IDS = [
    'core:dashboard',
];

/**
 * Seeds default system roles for an organization.
 * Also creates menu visibility records based on role's menuVisibility setting.
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

        // If role was created (not a conflict), add permissions and menu visibility
        if (role) {
            // Add permissions in CASL format
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

            // Add menu visibility based on role's menuVisibility setting
            await seedMenuVisibilityForRole(db, role.id, roleDef.menuVisibility);
        }
    }
}

/**
 * Create menu visibility records for a role.
 *
 * @param db - Database instance
 * @param roleId - Role ID
 * @param visibility - 'all' (all non-platform), 'basic' (dashboard only), or specific menu IDs
 */
async function seedMenuVisibilityForRole(
    db: AnyDatabase,
    roleId: string,
    visibility: 'all' | 'basic' | string[],
): Promise<void> {
    try {
        let menuIds: string[] = [];

        if (visibility === 'all') {
            // Get all non-platform menus from 'default' organization
            const allMenus = await db
                .select()
                .from(menus)
                .where(and(
                    eq(menus.organizationId, 'default'),
                    notLike(menus.id, 'platform:%')
                ));
            menuIds = allMenus.map((m: { id: string }) => m.id);
        } else if (visibility === 'basic') {
            // Only basic menus (dashboard)
            menuIds = BASIC_MENU_IDS;
        } else {
            // Specific menu IDs
            menuIds = visibility;
        }

        // Create visibility records (global scope - null organizationId)
        for (const menuId of menuIds) {
            await db
                .insert(roleMenuVisibility)
                .values({
                    roleId,
                    menuId,
                    organizationId: null, // Global scope
                    visible: true,
                })
                .onConflictDoNothing();
        }

        console.log(`[seedDefaultRoles] Created ${menuIds.length} menu visibility records for role ${roleId}`);
    } catch (error) {
        console.error('[seedDefaultRoles] Failed to create menu visibility:', error);
        // Don't throw - menu visibility is not critical for basic functionality
    }
}

/**
 * Add menu visibility for owner/admin roles when a new plugin is installed.
 * Called by plugin installation logic.
 *
 * @param database - Database instance
 * @param organizationId - Organization where plugin is installed
 * @param menuIds - Menu IDs registered by the plugin
 */
export async function addPluginMenuVisibility(
    database: AnyDatabase,
    organizationId: string,
    menuIds: string[],
): Promise<void> {
    const db = database;

    try {
        // Find owner and admin roles for this organization
        const orgRoles = await db
            .select()
            .from(roles)
            .where(and(
                eq(roles.organizationId, organizationId),
                // Only owner and admin get auto visibility
                like(roles.slug, 'owner'),
            ));

        const adminRoles = await db
            .select()
            .from(roles)
            .where(and(
                eq(roles.organizationId, organizationId),
                like(roles.slug, 'admin'),
            ));

        const targetRoles = [...orgRoles, ...adminRoles];

        // Add visibility records for each role and menu
        for (const role of targetRoles) {
            for (const menuId of menuIds) {
                await db
                    .insert(roleMenuVisibility)
                    .values({
                        roleId: role.id,
                        menuId,
                        organizationId, // Tenant scope
                        visible: true,
                    })
                    .onConflictDoNothing();
            }
        }

        console.log(`[addPluginMenuVisibility] Added ${menuIds.length} menus to ${targetRoles.length} roles`);
    } catch (error) {
        console.error('[addPluginMenuVisibility] Failed:', error);
    }
}

export type DefaultRoleSlug = typeof DEFAULT_SYSTEM_ROLES[number]['slug'];
