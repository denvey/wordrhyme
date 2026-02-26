/**
 * LBAC Teams Plugin - Server Entry
 *
 * Provides team hierarchy support for LBAC:
 * 1. KeyProvider: Injects team keys (including parent teams)
 * 2. MemberProvider: Expands team ownership to members
 *
 * @see Frozen Spec: plugin-teams
 */
import type { PluginContext } from '@wordrhyme/plugin';
import * as schemaExports from '../schema';

/**
 * Plugin schema export - discovered by PluginManager for DDL generation
 */
export const schema = schemaExports;

/**
 * Team with hierarchy info
 */
interface TeamHierarchy {
    id: string;
    name: string;
    parentId: string | null;
    path: string | null;
    level: number;
}

/**
 * Scope Member
 */
interface ScopeMember {
    type: 'user' | 'team' | 'role';
    id: string;
}

/**
 * LBAC Key Context (inferred from usage)
 */
interface LBACKeyContext {
    userId: string;
    organizationId: string;
}

/**
 * Get all teams a user belongs to
 */
async function getUserTeams(
    ctx: PluginContext,
    userId: string,
    organizationId: string
): Promise<TeamHierarchy[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    // Query team memberships
    const memberships = await ctx.db.raw<{ team_id: string }[]>(`
        SELECT team_id FROM team_member WHERE user_id = $1
    `, [userId]);

    if (memberships.length === 0) return [];

    const teamIds = memberships.map((m: { team_id: string }) => m.team_id);

    // Query teams with hierarchy
    const teams = await ctx.db.raw<TeamHierarchy[]>(`
        SELECT id, name, parent_id as "parentId", path, level
        FROM team
        WHERE organization_id = $1 AND id = ANY($2)
    `, [organizationId, teamIds]);

    return teams;
}

/**
 * Get team hierarchy (team + all parent teams via ltree)
 */
async function getTeamHierarchy(
    ctx: PluginContext,
    teamId: string
): Promise<TeamHierarchy[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    // Get target team
    const targetTeams = await ctx.db.raw<(TeamHierarchy & { organization_id: string })[]>(`
        SELECT id, name, parent_id as "parentId", path, level, organization_id
        FROM team WHERE id = $1
    `, [teamId]);

    if (targetTeams.length === 0) return [];
    const targetTeam = targetTeams[0];

    if (!targetTeam.path) {
        return [targetTeam];
    }

    // Get all ancestors using ltree
    const ancestors = await ctx.db.raw<TeamHierarchy[]>(`
        SELECT id, name, parent_id as "parentId", path, level
        FROM team
        WHERE organization_id = $1 AND path::ltree @> $2::ltree
    `, [targetTeam.organization_id, targetTeam.path]);

    return ancestors;
}

/**
 * Get all members of a team
 */
async function getTeamMembers(
    ctx: PluginContext,
    teamId: string
): Promise<ScopeMember[]> {
    if (!ctx.db) {
        ctx.logger.warn('Database capability not available');
        return [];
    }

    const members = await ctx.db.raw<{ user_id: string }[]>(`
        SELECT user_id FROM team_member WHERE team_id = $1
    `, [teamId]);

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

    ctx.logger.info('[lbac-teams] Plugin enabled (LBAC API pending)');
    ctx.logger.warn('[lbac-teams] LBAC capability not yet available in PluginContext');
}

/**
 * Lifecycle: onDisable
 */
export async function onDisable(ctx: PluginContext) {
    // Unregister providers when available
    ctx.logger.info('[lbac-teams] Plugin disabled');
}

