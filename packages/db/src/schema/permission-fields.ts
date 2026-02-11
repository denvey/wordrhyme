/**
 * Permission Fields Database Schema
 *
 * Predefined fields for business tables that support LBAC.
 * Core may not use all fields, but plugins can extend them.
 *
 * Usage:
 * ```typescript
 * export const articles = pgTable('articles', {
 *     id: text('id').primaryKey(),
 *     organizationId: text('organization_id').notNull(),
 *     title: text('title').notNull(),
 *     ...permissionFields,  // Spread permission fields
 * });
 * ```
 */

import { text } from 'drizzle-orm/pg-core';

// ============================================================
// Scope Fields
// ============================================================

/**
 * Scope ownership fields
 * - spaceId: Resource space (used by Space plugin)
 * - teamId: Team ownership
 */
export const scopeFields = {
  /** Resource space ID (used by Space plugin, reserved by Core) */
  spaceId: text('space_id'),

  /** Team ID (used by Team feature) */
  teamId: text('team_id'),
};

// ============================================================
// Owner Fields
// ============================================================

/**
 * Person ownership fields
 * - ownerId: Current owner (transferable)
 * - creatorId: Original creator (immutable, for audit)
 */
export const ownerFields = {
  /** Current owner ID */
  ownerId: text('owner_id'),

  /** Original creator ID (for audit, preserved after ownership transfer) */
  creatorId: text('creator_id'),
};

// ============================================================
// LBAC Fields
// ============================================================

/**
 * LBAC fields
 * - aclTags: List of tags that allow access
 * - denyTags: List of tags that deny access (higher priority than aclTags)
 *
 * Tag format: '{prefix}:{id}'
 * Examples: 'user:123', 'org:456', 'team:tech', 'space:marketing'
 */
export const lbacFields = {
  /** Allow list - match any tag to grant access */
  aclTags: text('acl_tags').array().notNull().default([]),

  /** Deny list - match any tag to deny access (higher priority than allow) */
  denyTags: text('deny_tags').array().notNull().default([]),
};

// ============================================================
// Combined Permission Fields
// ============================================================

/**
 * Complete permission fields (recommended for business tables)
 *
 * Includes:
 * - spaceId, teamId (scope ownership)
 * - ownerId, creatorId (person ownership)
 * - aclTags, denyTags (LBAC)
 */
export const permissionFields = {
  ...scopeFields,
  ...ownerFields,
  ...lbacFields,
};

// ============================================================
// Utilities
// ============================================================

/**
 * LBAC index SQL generator
 *
 * Creates GIN indexes for aclTags and denyTags to accelerate queries
 *
 * @param tableName - Table name
 * @returns SQL statement
 */
export const createLbacIndexes = (tableName: string) => `
CREATE INDEX IF NOT EXISTS idx_${tableName}_acl_tags ON "${tableName}" USING GIN(acl_tags);
CREATE INDEX IF NOT EXISTS idx_${tableName}_deny_tags ON "${tableName}" USING GIN(deny_tags);
`;

/**
 * Tag prefix constants
 */
export const TagPrefix = {
  USER: 'user',
  ORG: 'org',
  TEAM: 'team',
  SPACE: 'space',
  ROLE: 'role',
  PUBLIC: 'public',
} as const;

export type TagPrefixType = (typeof TagPrefix)[keyof typeof TagPrefix];
