/**
 * Common Zod Schemas
 *
 * Reusable validation schemas for common patterns like pagination, sorting, etc.
 */

import { z } from 'zod';

// ============================================================
// Pagination
// ============================================================

/**
 * 分页参数
 */
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

/**
 * Cursor 分页（可选，用于大数据集）
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================
// Sorting
// ============================================================

/**
 * 排序参数
 */
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================================
// Search
// ============================================================

/**
 * 搜索参数
 */
export const searchSchema = z.object({
  q: z.string().min(1).optional(),
});

// ============================================================
// Common Combinations
// ============================================================

/**
 * 列表查询基础（分页 + 排序）
 */
export const listQueryBase = paginationSchema.merge(sortSchema);

/**
 * 搜索列表查询（分页 + 排序 + 搜索）
 */
export const searchListQueryBase = listQueryBase.merge(searchSchema);

// ============================================================
// ID Schemas
// ============================================================

/**
 * 通用 ID 参数
 */
export const idSchema = z.object({
  id: z.string(),
});

/**
 * UUID 参数（严格验证）
 */
export const uuidSchema = z.object({
  id: z.string().uuid(),
});

/**
 * 批量 ID 操作
 */
export const batchIdsSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// ============================================================
// Date Range
// ============================================================

/**
 * 日期范围查询
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
