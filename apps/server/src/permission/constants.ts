/**
 * Permission Constants
 *
 * Defines available subjects and actions for the CASL permission system.
 * Used by Admin UI for dropdown options and type checking.
 *
 * Design principles:
 * 1. Actions and Subjects are auto-derived from RESOURCE_DEFINITIONS (single source of truth)
 * 2. Database stores string values, constants ensure consistency
 * 3. Plugins can register dynamic subjects/actions at runtime (open string union)
 */
import { z } from 'zod';
import {
    Subjects as ResourceSubjects,
    RESOURCE_DEFINITIONS,
    ACTION_LABELS,
} from './resource-definitions';

/**
 * ============================================================
 * Actions - Auto-derived from RESOURCE_DEFINITIONS
 * ============================================================
 *
 * Core actions are collected from all resource definitions.
 * New actions added to any resource's `actions` array are automatically included.
 * Plugin custom actions are supported via the open `AppAction` type (`| string`).
 */

/**
 * Collect all unique actions from RESOURCE_DEFINITIONS + 'manage' wildcard
 */
function collectActions(): string[] {
    const actionSet = new Set<string>(['manage']); // 'manage' is always available (CASL wildcard)
    for (const resource of Object.values(RESOURCE_DEFINITIONS)) {
        for (const action of resource.actions) {
            actionSet.add(action);
        }
    }
    return Array.from(actionSet);
}

/**
 * Action array - auto-derived, no manual maintenance needed
 *
 * To add a new action: add it to a resource's `actions` array in resource-definitions.ts
 * Plugin custom actions don't need registration (open string type)
 */
export const APP_ACTIONS = collectActions();

/**
 * Action type for TypeScript
 *
 * Open union: core actions are typed, but any string is accepted
 * to support plugin custom actions without registration.
 */
export type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete' | (string & {});

/**
 * Static action constants for IDE autocompletion
 *
 * Usage:
 * ```typescript
 * import { Actions } from '@/permission/constants';
 * .meta({ permission: { action: Actions.update, subject: Subjects.Content } })
 * ```
 *
 * Note: This object provides IDE hints for common actions.
 * The authoritative action list comes from RESOURCE_DEFINITIONS.
 */
export const Actions = {
    /** Manage all operations - CASL built-in wildcard */
    manage: 'manage',
    /** Create new records */
    create: 'create',
    /** Read/view records */
    read: 'read',
    /** Update existing records */
    update: 'update',
    /** Delete records */
    delete: 'delete',
} as const;

/**
 * Action display names for UI (i18n-ready)
 *
 * Auto-derived from ACTION_LABELS in resource-definitions.ts
 * Falls back to the action string itself for unregistered actions
 */
export const ACTION_DISPLAY_NAMES: Record<string, string> = {
    manage: '完全管理',
    ...ACTION_LABELS,
};

/**
 * Action descriptions for UI tooltips
 */
export const ACTION_DESCRIPTIONS: Record<string, string> = {
    manage: '包含所有操作权限（CASL 通配符，匹配任意 action）',
    create: '创建新记录',
    read: '查看记录',
    update: '修改现有记录',
    delete: '删除记录',
    publish: '发布内容',
};

/**
 * ============================================================
 * Subjects - Auto-derived from RESOURCE_DEFINITIONS
 * ============================================================
 */

/**
 * Subject constants - use these in code for type safety
 *
 * Auto-derived from RESOURCE_DEFINITIONS + special subjects.
 * Plugin subjects use prefix (e.g., 'plugin:notification').
 */
export const Subjects = {
    // Auto-derived from RESOURCE_DEFINITIONS
    ...ResourceSubjects,

    // Special Subjects
    /** Wildcard - matches all subjects (superadmin only) */
    All: 'all',  // Must be lowercase to match CASL's subject === 'all' check

    // Backward-compatible aliases
    /** @deprecated Use Article, Page, or Media instead */
    Content: 'Content',
} as const;

/**
 * Subject array for core subjects (excludes dynamic plugin subjects)
 */
export const APP_SUBJECTS = Object.values(Subjects);

/**
 * Subject type for TypeScript
 */
export type AppSubject = typeof Subjects[keyof typeof Subjects] | `plugin:${string}`;

/**
 * Subject display names for UI
 */
export const SUBJECT_DISPLAY_NAMES: Record<string, string> = {
    [Subjects.All]: '所有资源',
    User: '用户',
    Organization: '组织',
    [Subjects.Team]: '团队',
    [Subjects.Content]: '内容',
    [Subjects.Menu]: '菜单',
    [Subjects.Plugin]: '插件',
    [Subjects.Role]: '角色',
    Permission: '权限',
    [Subjects.AuditLog]: '审计日志',
    [Subjects.Settings]: '系统设置',
    FeatureFlag: '功能开关',
    [Subjects.Webhook]: 'Webhook',
};

/**
 * Subject descriptions for UI tooltips
 */
export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
    [Subjects.All]: '匹配所有资源类型 (超级管理员)',
    User: '用户账户管理',
    Organization: '组织/租户管理',
    [Subjects.Team]: '团队管理',
    [Subjects.Content]: '内容管理',
    [Subjects.Menu]: '导航菜单管理',
    [Subjects.Plugin]: '插件安装与配置',
    [Subjects.Role]: '角色管理',
    Permission: '权限配置',
    [Subjects.AuditLog]: '审计日志查看',
    [Subjects.Settings]: '全局和租户级系统设置',
    FeatureFlag: '功能开关与灰度发布',
    [Subjects.Webhook]: 'Webhook 端点管理与交付日志',
};

/**
 * ============================================================
 * Validation & Metadata
 * ============================================================
 */

// Zod schemas for runtime validation
export const actionSchema = z.string(); // Open: allow any action (core + plugin custom)
export const subjectSchema = z.string(); // Open: allow any subject (core + plugin)

/**
 * Validate if a string is a known core action
 */
export function isKnownAction(action: string): boolean {
    return APP_ACTIONS.includes(action);
}

/**
 * Validate if a string is a valid subject (core or plugin)
 */
export function isValidSubject(subject: string): boolean {
    return APP_SUBJECTS.includes(subject as any) || subject.startsWith('plugin:');
}

/**
 * Get metadata for Admin UI permission editor
 *
 * Returns both core subjects and dynamically registered plugin subjects
 */
export function getPermissionMeta(pluginSubjects: string[] = []) {
    // Combine core subjects with plugin subjects
    const allSubjects = [
        ...APP_SUBJECTS,
        ...pluginSubjects.filter(s => s.startsWith('plugin:')),
    ];

    return {
        subjects: allSubjects.map(subject => ({
            value: subject,
            label: SUBJECT_DISPLAY_NAMES[subject] ?? subject,
            description: SUBJECT_DESCRIPTIONS[subject] ?? '插件注册的资源',
            isPlugin: subject.startsWith('plugin:'),
        })),
        actions: APP_ACTIONS.map(action => ({
            value: action,
            label: ACTION_DISPLAY_NAMES[action] ?? action,
            description: ACTION_DESCRIPTIONS[action] ?? '',
        })),
    };
}
