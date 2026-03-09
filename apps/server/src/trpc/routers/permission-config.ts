import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db, rawDb } from '../../db';
import { roles, rolePermissions, menus } from '@wordrhyme/db';
import { eq, and, or, isNull } from 'drizzle-orm';
import {
  getResourceTree,
  getResourceDetail,
  getMenuCode,
  RESOURCE_DEFINITIONS,
  CATEGORY_LABELS,
  type ResourceTreeNode,
  type ConditionPresetKey,
} from '../../permission/resource-definitions';
import {
  CONDITION_PRESETS,
  getPresetsForSubject,
  combinePresets,
} from '../../permission/condition-presets';
import { PermissionCache } from '../../permission/permission-cache';
import { CacheManager } from '../../cache/cache-manager';
import { Actions, Subjects } from '../../permission/constants';
import type { SettingsService } from '../../settings/settings.service';
import {
  getPermissionRegistry,
  isPermissionRegistryReady,
  setRbacOverride,
  deleteRbacOverride,
  getRbacOverride,
  getRbacDefaultPolicy,
  setRbacDefaultPolicyValue,
  getRegistrySubjectSummary,
  getRegistryActionsBySubject,
  getSubjectTitle,
  type RbacDefaultPolicy,
  type SubjectSummary,
} from '../permission-registry';
import {
  listTemplates,
  getTemplate,
  applyUnifiedTemplate,
} from '../permission-template';
import { getAllRouteDriftReports } from '../route-drift';

/**
 * SettingsService injection for template application
 */
let _settingsService: SettingsService | null = null;

export function setPermissionConfigSettingsService(s: SettingsService): void {
  _settingsService = s;
}

/**
 * Permission cache instance
 */
let permissionCacheInstance: PermissionCache | null = null;

function getPermissionCache(): PermissionCache | null {
  if (!permissionCacheInstance) {
    try {
      const cacheManager = new CacheManager();
      permissionCacheInstance = new PermissionCache(cacheManager);
    } catch (error) {
      console.error('[PermissionConfigRouter] Failed to initialize PermissionCache:', error);
      return null;
    }
  }
  return permissionCacheInstance;
}

/**
 * Input schemas
 */
const savePermissionsInput = z.object({
  roleId: z.string(),
  permissions: z.record(z.object({
    actions: z.array(z.string()),
    preset: z.enum(['none', 'own', 'team', 'department', 'public', 'draft', 'published', 'assigned', 'not_archived']).nullable().optional(),
    customConditions: z.record(z.unknown()).nullable().optional(),
  })),
});

/**
 * Permission Config Router
 *
 * Provides APIs for the permission configuration UI:
 * - Resource tree for left navigation
 * - Resource detail for advanced config panel
 * - Role permissions CRUD
 */
export const permissionConfigRouter = router({
  getRouteDriftReports: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(() => {
      return getAllRouteDriftReports();
    }),

  /**
   * Get resource tree for left navigation
   * Requires: Role read permission
   */
  getResourceTree: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async ({ ctx }) => {
      // Enrich RESOURCE_DEFINITIONS tree with real procedure names from Registry
      const tree = enrichTreeWithRegistryActions(getResourceTree());

      // Collect known subjects from RESOURCE_DEFINITIONS
      const knownSubjects = new Set(
        Object.values(RESOURCE_DEFINITIONS).map(r => r.subject),
      );

      // Get auto-discovered subjects from Registry (not in RESOURCE_DEFINITIONS)
      const autoSubjects = getRegistrySubjectSummary(knownSubjects);

      if (!ctx.organizationId) {
        // No org context — full tree + all auto-discovered
        return appendAutoDiscoveredNodes(tree, autoSubjects);
      }

      // Get menu codes visible to this organization
      const visibleMenus = await rawDb
        .select({ code: menus.code })
        .from(menus)
        .where(
          or(
            isNull(menus.organizationId),
            eq(menus.organizationId, ctx.organizationId),
          )
        );

      const visibleCodes = new Set(visibleMenus.map(m => m.code));

      // Filter RESOURCE_DEFINITIONS tree by visible menus
      const filteredTree = filterByVisibleMenus(tree, visibleCodes);

      const isPlatform = ctx.organizationId === 'platform';
      if (isPlatform) {
        // Platform admin: filtered core tree + ALL auto-discovered
        return appendAutoDiscoveredNodes(filteredTree, autoSubjects);
      }

      // Tenant admin: only show auto-discovered from installed plugins
      const pluginModules = new Set<string>();
      for (const code of visibleCodes) {
        const match = code.match(/^plugin:([^:]+):/);
        if (match) pluginModules.add(match[1]!);
      }

      const visibleAutoSubjects = autoSubjects.filter(
        s => s.module !== null && pluginModules.has(s.module),
      );

      return appendAutoDiscoveredNodes(filteredTree, visibleAutoSubjects);
    }),

  /**
   * Get resource detail for advanced config panel
   * Requires: Role read permission
   */
  getResourceDetail: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      subject: z.string(),
    }))
    .query(async ({ input }) => {
      const detail = getResourceDetail(input.subject);
      if (!detail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Resource not found: ${input.subject}`,
        });
      }

      // Get applicable presets
      const presets = getPresetsForSubject(input.subject).map(p => ({
        key: p.key,
        label: p.label,
        description: p.description,
        icon: p.icon,
      }));

      return {
        ...detail,
        presets,
      };
    }),

  /**
   * Get all available presets
   * Requires: Role read permission
   */
  getPresets: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async () => {
      return Object.values(CONDITION_PRESETS).map(p => ({
        key: p.key,
        label: p.label,
        description: p.description,
        icon: p.icon,
        applicableSubjects: p.applicableSubjects ?? null,
        combinable: p.combinable,
      }));
    }),

  /**
   * Get role permissions for a specific role
   * Requires: Role read permission
   */
  getRolePermissions: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      roleId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No organization context',
        });
      }

      // Verify role belongs to organization
      const [role] = await db
        .select()
        .from(roles)
        .where(and(
          eq(roles.id, input.roleId),
          eq(roles.organizationId, ctx.organizationId)
        ));

      if (!role) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Role not found',
        });
      }

      // Get all permissions for this role
      const permissions = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, input.roleId));

      // Group by subject
      const grouped: Record<string, {
        actions: string[];
        preset: ConditionPresetKey | null;
        conditions: Record<string, unknown> | null;
      }> = {};

      for (const perm of permissions) {
        if (!grouped[perm.subject]) {
          grouped[perm.subject] = {
            actions: [],
            preset: null,
            conditions: null,
          };
        }

        const group = grouped[perm.subject];
        group.actions.push(perm.action);

        // Extract preset from conditions if available
        if (perm.conditions) {
          group.conditions = perm.conditions as Record<string, unknown>;
          // Try to detect preset from conditions
          group.preset = detectPresetFromConditions(perm.conditions as Record<string, unknown>);
        }
      }

      return grouped;
    }),

  /**
   * Save permissions for a role
   * Requires: Role update permission
   */
  savePermissions: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(savePermissionsInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No organization context',
        });
      }

      const { roleId, permissions } = input;

      // Verify role belongs to organization
      const [role] = await db
        .select()
        .from(roles)
        .where(and(
          eq(roles.id, roleId),
          eq(roles.organizationId, ctx.organizationId)
        ));

      if (!role) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Role not found',
        });
      }

      if (role.isSystem && role.slug === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot modify owner role permissions',
        });
      }

      // Delete existing permissions for this role
      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      // Build new permission records
      const records: Array<{
        roleId: string;
        action: string;
        subject: string;
        fields: string[] | null;
        conditions: Record<string, unknown> | null;
        inverted: boolean;
      }> = [];

      // Get visible menu codes for this organization to validate subjects
      // Use rawDb to bypass LBAC which would exclude NULL organizationId menus
      const visibleMenus = await rawDb
        .select({ code: menus.code })
        .from(menus)
        .where(
          or(
            isNull(menus.organizationId),
            eq(menus.organizationId, ctx.organizationId),
          )
        );
      const visibleCodes = new Set(visibleMenus.map(m => m.code));

      for (const [subject, config] of Object.entries(permissions)) {
        // Only allow saving permissions for resources visible to this organization
        const menuCode = getMenuCode(subject);
        if (!visibleCodes.has(menuCode)) {
          continue;
        }

        // Calculate conditions from preset or custom
        let conditions: Record<string, unknown> | null = null;

        if (config.customConditions) {
          conditions = config.customConditions;
        } else if (config.preset && config.preset !== 'none') {
          conditions = combinePresets([config.preset as ConditionPresetKey]);
        }

        // Create a record for each action
        for (const action of config.actions) {
          records.push({
            roleId,
            action,
            subject,
            fields: null,
            conditions,
            inverted: false,
          });
        }
      }

      // Insert new permissions
      if (records.length > 0) {
        await db.insert(rolePermissions).values(records);
      }

      // Invalidate permission cache
      const cache = getPermissionCache();
      if (cache) {
        await cache.invalidateOrganization(ctx.organizationId);
      }

      return { success: true, count: records.length };
    }),

  /**
   * Preview conditions from preset
   * Requires: Role read permission
   */
  previewConditions: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      preset: z.enum(['none', 'own', 'team', 'department', 'public', 'draft', 'published', 'assigned', 'not_archived']),
    }))
    .query(async ({ input }) => {
      if (input.preset === 'none') {
        return { conditions: null, json: 'null' };
      }

      const conditions = combinePresets([input.preset as ConditionPresetKey]);
      return {
        conditions,
        json: JSON.stringify(conditions, null, 2),
      };
    }),

  // ─── Task 6.7: Procedure Registry Endpoints ───

  /**
   * List all registered procedures from the startup permission registry.
   * Enriched with RESOURCE_DEFINITIONS metadata (category, label) when available.
   * Used by Admin UI to display and configure procedure permissions.
   */
  listProcedures: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      /** Filter by module name */
      module: z.string().optional(),
      /** Filter by source type */
      source: z.enum(['explicit', 'auto-crud', 'pending']).optional(),
      /** Filter by procedure type */
      type: z.enum(['query', 'mutation']).optional(),
    }).optional())
    .query(async ({ input }) => {
      if (!isPermissionRegistryReady()) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Permission registry not initialized',
        });
      }

      const registry = getPermissionRegistry();
      const resourceDefsBySubject = buildResourceDefIndex();

      const entries: Array<{
        path: string;
        name: string;
        type: 'query' | 'mutation';
        permission: { action: string; subject: string };
        source: 'explicit' | 'auto-crud' | 'pending';
        module: string | null;
        override: { action: string; subject: string } | undefined;
        resourceMeta: { category: string; label: string } | null;
      }> = [];

      for (const entry of registry.values()) {
        // Apply filters
        if (input?.module && entry.module !== input.module) continue;
        if (input?.source && entry.source !== input.source) continue;
        if (input?.type && entry.type !== input.type) continue;

        const override = getRbacOverride(entry.path);
        const effectiveSubject = override?.subject ?? entry.permission.subject;
        const resDef = resourceDefsBySubject.get(effectiveSubject);

        entries.push({
          path: entry.path,
          name: entry.name,
          type: entry.type,
          permission: override
            ? { action: override.action, subject: override.subject }
            : entry.permission,
          source: entry.source,
          module: entry.module,
          override,
          resourceMeta: resDef
            ? { category: CATEGORY_LABELS[resDef.category as keyof typeof CATEGORY_LABELS] ?? resDef.category, label: resDef.label }
            : null,
        });
      }

      // Sort: pending first, then by module, then by path
      entries.sort((a, b) => {
        const sourcePriority = { pending: 0, 'auto-crud': 1, explicit: 2 };
        const aPri = sourcePriority[a.source] ?? 1;
        const bPri = sourcePriority[b.source] ?? 1;
        if (aPri !== bPri) return aPri - bPri;
        return a.path.localeCompare(b.path);
      });

      return {
        total: entries.length,
        items: entries,
      };
    }),

  // ─── Task 6.9: Admin Override Endpoints ───

  /**
   * Set admin override for a procedure's permission mapping.
   * Overrides both developer-declared meta.permission and registry defaults.
   */
  overrideProcedure: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(z.object({
      path: z.string().min(1),
      action: z.string().min(1),
      subject: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // Verify path exists in registry
      if (isPermissionRegistryReady()) {
        const registry = getPermissionRegistry();
        if (!registry.has(input.path)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Procedure not found in registry: ${input.path}`,
          });
        }
      }

      await setRbacOverride(input.path, {
        action: input.action,
        subject: input.subject,
      });

      return { success: true };
    }),

  /**
   * Reset admin override for a procedure path.
   * Restores to developer default (Registry value).
   */
  resetProcedureOverride: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(z.object({
      path: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      await deleteRbacOverride(input.path);
      return { success: true };
    }),

  /**
   * Get current RBAC default policy for pending procedures.
   */
  getDefaultPolicy: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async () => {
      return { policy: getRbacDefaultPolicy() };
    }),

  /**
   * Set RBAC default policy for pending procedures.
   * Controls how unregistered/pending mutations are handled:
   * - 'audit': allow + log warning (safe default)
   * - 'deny': block all unconfigured procedures
   * - 'allow': allow all without logging
   */
  setDefaultPolicy: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(z.object({
      policy: z.enum(['audit', 'deny', 'allow']),
    }))
    .mutation(async ({ input }) => {
      await setRbacDefaultPolicyValue(input.policy as RbacDefaultPolicy);
      return { success: true, policy: input.policy };
    }),

  // ─── Task 6.11 + 6.12: Template Endpoints ───

  /**
   * List all available configuration templates.
   */
  listTemplates: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async () => {
      return listTemplates().map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        moduleCount: Object.keys(t.modules).length,
        procedureRuleCount: t.procedures?.length ?? 0,
      }));
    }),

  /**
   * Get template detail including full module and procedure configuration.
   */
  getTemplate: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const template = getTemplate(input.id);
      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Template not found: ${input.id}`,
        });
      }
      return template;
    }),

  /**
   * Apply a configuration template.
   * Supports dry-run mode for previewing changes before committing.
   *
   * Respects existing admin overrides — will not overwrite them.
   */
  applyTemplate: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(z.object({
      templateId: z.string(),
      mode: z.enum(['dry-run', 'apply']).default('dry-run'),
    }))
    .mutation(async ({ input }) => {
      if (!_settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'SettingsService not initialized for template application',
        });
      }

      const report = await applyUnifiedTemplate(
        input.templateId,
        _settingsService,
        input.mode,
      );

      return report;
    }),
});

/**
 * Try to detect which preset was used from conditions
 */
function detectPresetFromConditions(conditions: Record<string, unknown>): ConditionPresetKey | null {
  if (!conditions || Object.keys(conditions).length === 0) {
    return 'none';
  }

  // Check for common patterns
  if ('creatorId' in conditions && conditions.creatorId === '${user.id}') {
    return 'own';
  }
  if ('teamId' in conditions && conditions.teamId === '${user.currentTeamId}') {
    return 'team';
  }
  if ('departmentId' in conditions && conditions.departmentId === '${user.departmentId}') {
    return 'department';
  }
  if ('visibility' in conditions && conditions.visibility === 'public') {
    return 'public';
  }

  // If we can't detect, return null (custom)
  return null;
}

/**
 * Filter resource tree to only include nodes whose menu code
 * exists in the organization's visible menus.
 * Directory nodes are kept if they have any visible children.
 */
function filterByVisibleMenus(nodes: ResourceTreeNode[], visibleCodes: Set<string>): ResourceTreeNode[] {
  return nodes
    .map(node => {
      const filteredChildren = node.children
        ? filterByVisibleMenus(node.children, visibleCodes)
        : [];

      // Keep node if its code is in visible menus, or if it's a directory with visible children
      const isVisible = visibleCodes.has(node.code);
      const hasVisibleChildren = filteredChildren.length > 0;

      if (!isVisible && !hasVisibleChildren) return null;

      return { ...node, children: filteredChildren };
    })
    .filter((n): n is ResourceTreeNode => n !== null);
}

/**
 * Build a lookup index from subject → resource definition metadata.
 * Used by listProcedures to enrich registry entries.
 */
function buildResourceDefIndex(): Map<string, { category: string; label: string }> {
  const index = new Map<string, { category: string; label: string }>();
  for (const def of Object.values(RESOURCE_DEFINITIONS)) {
    index.set(def.subject, { category: def.category, label: def.label });
  }
  return index;
}

/**
 * Overlay real procedure names from the Permission Registry onto the resource tree.
 * Replaces abstract CASL actions ('read', 'manage') with actual procedure names,
 * and adds actionGroups for UI quick-select.
 */
function enrichTreeWithRegistryActions(nodes: ResourceTreeNode[]): ResourceTreeNode[] {
  const registryActions = getRegistryActionsBySubject();

  return nodes.map(node => {
    const enriched = { ...node };

    if (!node.isDirectory) {
      const regActions = registryActions.get(node.subject);
      if (regActions) {
        enriched.actions = regActions.actions;
      }
    }

    if (node.children.length > 0) {
      enriched.children = enrichTreeWithRegistryActions(node.children);
    }

    return enriched;
  });
}

/**
 * Append auto-discovered subjects (from Permission Registry) to the resource tree.
 * These subjects exist in the Registry but not in RESOURCE_DEFINITIONS.
 * Uses getSubjectTitle for human-readable labels (i18n → humanize fallback).
 */
function appendAutoDiscoveredNodes(
  tree: ResourceTreeNode[],
  subjects: SubjectSummary[],
): ResourceTreeNode[] {
  if (subjects.length === 0) return tree;

  const autoNodes: ResourceTreeNode[] = subjects.map(s => {
    const node: ResourceTreeNode = {
      code: `auto:${s.subject.toLowerCase()}`,
      subject: s.subject,
      label: getSubjectTitle(s.subject),
      icon: 'Box',
      category: 'extension' as const,
      order: 900,
      isDirectory: false,
      actions: s.actions,
      availablePresets: ['none', 'own'] as ConditionPresetKey[],
      children: [],
      systemReserved: false,
    };
    if (s.actionGroups) {
      node.actionGroups = s.actionGroups;
    }
    return node;
  });

  return [...tree, ...autoNodes];
}
