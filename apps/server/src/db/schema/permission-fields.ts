/**
 * Permission Fields - 预留字段定义
 *
 * 这些字段预留在业务表中，Core 不一定全部使用，但插件可以扩展使用。
 * 预留的目的是避免未来添加功能时需要数据迁移。
 *
 * 使用方式：
 * ```typescript
 * export const articles = pgTable('articles', {
 *     id: text('id').primaryKey(),
 *     organizationId: text('organization_id').notNull(),
 *     title: text('title').notNull(),
 *     ...permissionFields,  // 展开权限字段
 * });
 * ```
 */

import { text } from 'drizzle-orm/pg-core';

/**
 * 范围归属字段
 * - spaceId: 资源空间（Space 插件使用）
 * - teamId: 团队归属
 */
export const scopeFields = {
    /** 资源空间 ID（Space 插件使用，Core 预留） */
    spaceId: text('space_id'),

    /** 团队 ID（Team 功能使用） */
    teamId: text('team_id'),
};

/**
 * 人员归属字段
 * - ownerId: 当前所有者（可转移）
 * - creatorId: 原始创建者（不可变，用于审计）
 */
export const ownerFields = {
    /** 当前所有者 ID */
    ownerId: text('owner_id'),

    /** 原始创建者 ID（审计用，所有权转移后保留） */
    creatorId: text('creator_id'),
};

/**
 * LBAC 字段
 * - aclTags: 允许访问的标签列表
 * - denyTags: 拒绝访问的标签列表（优先级高于 aclTags）
 *
 * 标签格式: '{prefix}:{id}'
 * 例如: 'user:123', 'org:456', 'team:tech', 'space:marketing'
 */
export const lbacFields = {
    /** 允许列表 - 匹配任一标签即可访问 */
    aclTags: text('acl_tags').array().notNull().default([]),

    /** 拒绝列表 - 匹配任一标签则拒绝（优先级高于允许） */
    denyTags: text('deny_tags').array().notNull().default([]),
};

/**
 * 完整的权限字段（推荐业务表使用）
 *
 * 包含：
 * - spaceId, teamId (范围归属)
 * - ownerId, creatorId (人员归属)
 * - aclTags, denyTags (LBAC)
 */
export const permissionFields = {
    ...scopeFields,
    ...ownerFields,
    ...lbacFields,
};

/**
 * LBAC 索引 SQL 生成器
 *
 * 为 aclTags 和 denyTags 创建 GIN 索引以加速查询
 *
 * @param tableName - 表名
 * @returns SQL 语句
 */
export const createLbacIndexes = (tableName: string) => `
CREATE INDEX IF NOT EXISTS idx_${tableName}_acl_tags ON "${tableName}" USING GIN(acl_tags);
CREATE INDEX IF NOT EXISTS idx_${tableName}_deny_tags ON "${tableName}" USING GIN(deny_tags);
`;

/**
 * 标签前缀常量
 */
export const TagPrefix = {
    USER: 'user',
    ORG: 'org',
    TEAM: 'team',
    SPACE: 'space',
    ROLE: 'role',
    PUBLIC: 'public',
} as const;

export type TagPrefixType = typeof TagPrefix[keyof typeof TagPrefix];
