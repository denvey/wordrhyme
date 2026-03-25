/**
 * LBAC Spaces Plugin - Server Entry
 *
 * Provides space-based isolation for LBAC:
 * 1. KeyProvider: Injects space keys + role keys
 * 2. MemberProvider: Expands space ownership to members
 *
 * @see Frozen Spec: plugin-spaces
 */
import type { PluginContext, PluginDatabaseCapability } from '@wordrhyme/plugin';
import * as schemaExports from '../schema';

/**
 * Plugin schema export - used for type sharing and uninstall table discovery.
 * Runtime schema changes must be shipped via SQL migration files in `migrations/`.
 */
export const schema = schemaExports;

/**
 * Space with hierarchy info
 */
interface SpaceInfo {
    id: string;
    name: string;
    parentId: string | null;
    path: string | null;
    level: number;
    role: string;
}

/**
 * Scope Member
 */
interface ScopeMember {
    type: 'user' | 'team' | 'role';
    id: string;
}

/**
 * Get all spaces a user belongs to
 */
async function getUserSpaces(
    ctx: PluginContext,
    userId: string,
    organizationId: string
): Promise<SpaceInfo[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    const spaces = await (ctx.db as PluginDatabaseCapability).raw<SpaceInfo[]>(`
        SELECT
            s.id,
            s.name,
            s.parent_id as "parentId",
            s.path,
            s.level,
            sm.role
        FROM space s
        JOIN space_member sm ON s.id = sm.space_id
        WHERE sm.user_id = $1 AND s.organization_id = $2
    `, [userId, organizationId]);

    return spaces;
}

/**
 * Get space hierarchy (space + all parent spaces via ltree)
 */
async function getSpaceHierarchy(
    ctx: PluginContext,
    spaceId: string
): Promise<SpaceInfo[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    // Get target space
    const targetSpaces = await (ctx.db as PluginDatabaseCapability).raw<(SpaceInfo & { organization_id: string })[]>(`
        SELECT id, name, parent_id as "parentId", path, level, organization_id, 'member' as role
        FROM space WHERE id = $1
    `, [spaceId]);

    if (targetSpaces.length === 0) return [];
    const targetSpace = targetSpaces[0];

    if (!targetSpace.path) {
        return [targetSpace];
    }

    // Get all ancestors using ltree
    const ancestors = await (ctx.db as PluginDatabaseCapability).raw<SpaceInfo[]>(`
        SELECT id, name, parent_id as "parentId", path, level, 'member' as role
        FROM space
        WHERE organization_id = $1 AND path::ltree @> $2::ltree
    `, [targetSpace.organization_id, targetSpace.path]);

    return ancestors;
}

/**
 * Get all members of a space
 */
async function getSpaceMembers(
    ctx: PluginContext,
    spaceId: string
): Promise<ScopeMember[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    const members = await (ctx.db as PluginDatabaseCapability).raw<{ user_id: string }[]>(`
        SELECT user_id FROM space_member WHERE space_id = $1
    `, [spaceId]);

    return members.map((m: { user_id: string }) => ({
        type: 'user' as const,
        id: m.user_id,
    }));
}

/**
 * Lifecycle: onEnable
 */
export async function onEnable(ctx: PluginContext) {
    // Note: LBAC API is not yet available in PluginContext
    // This is a placeholder for when the LBAC capability is added
    //
    // Expected API:
    // ctx.lbac.keyBuilder.registerProvider({ ... })
    // ctx.lbac.inheritanceService.registerMemberProvider({ ... })

    ctx.logger.info('[lbac-spaces] Plugin enabled (LBAC API pending)');
    ctx.logger.warn('[lbac-spaces] LBAC capability not yet available in PluginContext');
}

/**
 * Lifecycle: onDisable
 */
export async function onDisable(ctx: PluginContext) {
    // Unregister providers when available
    ctx.logger.info('[lbac-spaces] Plugin disabled');
}
