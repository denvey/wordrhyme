/**
 * Database Error Handler
 *
 * 将数据库错误转换为友好的 tRPC 错误
 *
 * PostgreSQL Error Codes:
 * - 23505: unique_violation (唯一约束违反)
 * - 23503: foreign_key_violation (外键约束违反)
 * - 23502: not_null_violation (非空约束违反)
 * - 23514: check_violation (检查约束违反)
 */

import { TRPCError } from '@trpc/server';

/**
 * PostgreSQL 错误码映射
 */
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
} as const;

/**
 * 提取约束名称中的表名和字段名
 *
 * @example
 * parseConstraintName('i18n_languages_org_locale_uidx')
 * // => { table: 'i18n_languages', fields: ['org', 'locale'] }
 */
function parseConstraintName(constraintName: string): {
  table: string;
  fields: string[];
} | null {
  // 匹配格式: tablename_field1_field2_uidx
  const match = constraintName.match(/^(.+?)_(.+?)_(uidx|idx|fkey|pkey)$/);

  if (!match) return null;

  const [, table, fieldsPart] = match;
  if (!table || !fieldsPart) {
    return null;
  }
  const fields = fieldsPart.split('_');

  return { table, fields };
}

/**
 * 检查错误是否是数据库错误
 */
function isDatabaseError(error: unknown): error is {
  code: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

/**
 * 处理数据库错误，转换为友好的 tRPC 错误
 *
 * @param error - 原始错误对象
 * @returns TRPCError 或原始错误
 *
 * @example
 * try {
 *   await db.insert(languages).values({ locale: 'en-US', ... });
 * } catch (error) {
 *   throw handleDatabaseError(error);
 * }
 */
export function handleDatabaseError(error: unknown): never {
  if (!isDatabaseError(error)) {
    // 不是数据库错误，直接抛出
    throw error;
  }

  switch (error.code) {
    case PG_ERROR_CODES.UNIQUE_VIOLATION: {
      // 唯一约束违反
      const constraintName = error.constraint || '';
      const parsed = parseConstraintName(constraintName);

      let message = 'Resource already exists';

      // 根据约束名称生成更友好的错误消息
      if (parsed) {
        const { table, fields } = parsed;

        // 特殊处理常见的表
        if (table === 'i18n_languages') {
          message = 'Language already exists';
        } else if (table === 'i18n_messages') {
          message = 'Translation key already exists';
        } else if (table === 'users') {
          message = 'User already exists';
        } else {
          // 通用消息
          message = `Duplicate ${fields.join(' and ')}`;
        }
      }

      throw new TRPCError({
        code: 'CONFLICT',
        message,
        cause: error,
      });
    }

    case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION: {
      // 外键约束违反
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Referenced resource does not exist',
        cause: error,
      });
    }

    case PG_ERROR_CODES.NOT_NULL_VIOLATION: {
      // 非空约束违反
      const column = error.column || 'field';
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${column} is required`,
        cause: error,
      });
    }

    case PG_ERROR_CODES.CHECK_VIOLATION: {
      // 检查约束违反
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid value',
        cause: error,
      });
    }

    default:
      // 其他数据库错误
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database operation failed',
        cause: error,
      });
  }
}

/**
 * Middleware 版本：包装异步函数，自动处理数据库错误
 *
 * @example
 * const createLanguage = withDbErrorHandler(async (input) => {
 *   return await db.insert(languages).values(input).returning();
 * });
 */
export function withDbErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw handleDatabaseError(error);
    }
  }) as T;
}
