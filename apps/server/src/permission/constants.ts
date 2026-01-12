/**
 * Permission Constants
 *
 * Defines available subjects and actions for the CASL permission system.
 * Used by Admin UI for dropdown options.
 */
import { z } from 'zod';

/**
 * Core application subjects
 * These are the resource types that can be protected by permissions.
 */
export const APP_SUBJECTS = [
    'all',          // Wildcard - matches all subjects
    'User',
    'Organization',
    'Team',
    'Content',
    'Menu',
    'Plugin',
    'Role',
    'Permission',
    'AuditLog',
    'Settings',     // System settings management
    'FeatureFlag',  // Feature flag management
    'Webhook',      // Webhook management
] as const;

/**
 * Core application actions
 * These are the operations that can be performed on subjects.
 */
export const APP_ACTIONS = [
    'manage',   // Wildcard - matches all actions (create, read, update, delete)
    'create',
    'read',
    'update',
    'delete',
    'test',     // Special action for webhook testing
] as const;

/**
 * Subject display names for UI
 */
export const SUBJECT_DISPLAY_NAMES: Record<string, string> = {
    all: '所有资源',
    User: '用户',
    Organization: '组织',
    Team: '团队',
    Content: '内容',
    Menu: '菜单',
    Plugin: '插件',
    Role: '角色',
    Permission: '权限',
    AuditLog: '审计日志',
    Settings: '系统设置',
    FeatureFlag: '功能开关',
    Webhook: 'Webhook',
};

/**
 * Action display names for UI
 */
export const ACTION_DISPLAY_NAMES: Record<string, string> = {
    manage: '完全管理',
    create: '创建',
    read: '读取',
    update: '更新',
    delete: '删除',
    test: '测试',
};

/**
 * Subject descriptions for UI tooltips
 */
export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
    all: '匹配所有资源类型 (超级管理员)',
    User: '用户账户管理',
    Organization: '组织/租户管理',
    Team: '团队管理',
    Content: '内容管理',
    Menu: '导航菜单管理',
    Plugin: '插件安装与配置',
    Role: '角色管理',
    Permission: '权限配置',
    AuditLog: '审计日志查看',
    Settings: '全局和租户级系统设置',
    FeatureFlag: '功能开关与灰度发布',
    Webhook: 'Webhook 端点管理与交付日志',
};

/**
 * Action descriptions for UI tooltips
 */
export const ACTION_DESCRIPTIONS: Record<string, string> = {
    manage: '包含所有操作权限 (创建、读取、更新、删除)',
    create: '创建新记录',
    read: '查看记录',
    update: '修改现有记录',
    delete: '删除记录',
    test: '发送测试事件',
};

// Zod schemas derived from constants
export const subjectSchema = z.enum(APP_SUBJECTS);
export const actionSchema = z.enum(APP_ACTIONS);

export type AppSubject = (typeof APP_SUBJECTS)[number];
export type AppAction = (typeof APP_ACTIONS)[number];

/**
 * Get metadata for Admin UI permission editor
 */
export function getPermissionMeta() {
    return {
        subjects: APP_SUBJECTS.map(subject => ({
            value: subject,
            label: SUBJECT_DISPLAY_NAMES[subject] ?? subject,
            description: SUBJECT_DESCRIPTIONS[subject] ?? '',
        })),
        actions: APP_ACTIONS.map(action => ({
            value: action,
            label: ACTION_DISPLAY_NAMES[action] ?? action,
            description: ACTION_DESCRIPTIONS[action] ?? '',
        })),
    };
}
