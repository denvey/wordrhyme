/**
 * Data Capability - Scoped database access for plugins
 *
 * Provides plugins with controlled access to their private tables.
 * All operations are automatically scoped to:
 * - Plugin's private tables (prefixed with plugin_{pluginId}_)
 * - Current tenant (organization_id filter)
 *
 * Auto-injected fields on insert:
 * - organization_id (from context)
 * - created_by (from context, if available)
 */
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import type { PluginDatabaseCapability } from '@wordrhyme/plugin';

/**
 * Escape a SQL value to prevent injection
 */
function escapeSqlValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (Array.isArray(value)) {
        // PostgreSQL array literal (e.g., TEXT[])
        const escaped = value.map(v =>
            typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : String(v)
        ).join(',');
        return `'{${escaped}}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Validate a SQL identifier (table/column name) to prevent injection
 */
function validateIdentifier(name: string): string {
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
        throw new Error(`Invalid SQL identifier: ${name}`);
    }
    return name;
}

/**
 * Create data capability for a plugin
 *
 * @param pluginId - Plugin ID (used for table prefixing)
 * @param organizationId - Optional tenant ID for multi-tenancy
 * @param userId - Optional user ID for audit fields
 * @returns PluginDatabaseCapability
 */
export function createPluginDataCapability(
    pluginId: string,
    organizationId?: string,
    userId?: string,
): PluginDatabaseCapability {
    // Convert pluginId to safe table prefix (e.g., com.wordrhyme.hello-world -> com_wordrhyme_hello_world)
    const tablePrefix = `plugin_${pluginId.replace(/[.\-]/g, '_')}_`;

    /**
     * Get full table name with prefix
     */
    function getFullTableName(shortName: string): string {
        return validateIdentifier(`${tablePrefix}${shortName}`);
    }

    /**
     * Add tenant filter to where clause if organizationId is provided
     */
    function buildWhereClause(
        where?: Record<string, unknown>,
        includeTenant = true
    ): Record<string, unknown> {
        const result: Record<string, unknown> = { ...where };
        if (includeTenant && organizationId) {
            result['organization_id'] = organizationId;
        }
        return result;
    }

    /**
     * Build SQL WHERE conditions from object with proper escaping
     */
    function buildWhereConditions(where: Record<string, unknown>): string {
        const conditions = Object.entries(where)
            .map(([key, value]) => {
                const col = validateIdentifier(key);
                if (value === null) {
                    return `${col} IS NULL`;
                }
                return `${col} = ${escapeSqlValue(value)}`;
            })
            .join(' AND ');
        return conditions || '1=1';
    }

    return {
        async query<T>(options: {
            table: string;
            where?: Record<string, unknown>;
            limit?: number;
            offset?: number;
        }): Promise<T[]> {
            const tableName = getFullTableName(options.table);
            const where = buildWhereClause(options.where);
            const whereConditions = buildWhereConditions(where);

            let query = `SELECT * FROM ${tableName} WHERE ${whereConditions}`;

            if (options.limit !== undefined) {
                const limit = Math.max(0, Math.floor(Number(options.limit)));
                query += ` LIMIT ${limit}`;
            }
            if (options.offset !== undefined) {
                const offset = Math.max(0, Math.floor(Number(options.offset)));
                query += ` OFFSET ${offset}`;
            }

            const result = await db.execute(sql.raw(query));
            return result as T[];
        },

        async insert<T>(options: {
            table: string;
            data: T | T[];
        }): Promise<void> {
            const tableName = getFullTableName(options.table);
            const dataArray = Array.isArray(options.data) ? options.data : [options.data];

            for (const row of dataArray) {
                const rowData = { ...row as Record<string, unknown> };

                // Auto-inject organization_id if available and not already provided
                if (organizationId && !rowData['organization_id']) {
                    rowData['organization_id'] = organizationId;
                }

                // Auto-inject created_by if available and not already provided
                if (userId && !rowData['created_by']) {
                    rowData['created_by'] = userId;
                }

                const columns = Object.keys(rowData).map(validateIdentifier).join(', ');
                const values = Object.values(rowData).map(escapeSqlValue).join(', ');

                await db.execute(sql.raw(`INSERT INTO ${tableName} (${columns}) VALUES (${values})`));
            }
        },

        async update<T>(options: {
            table: string;
            where: Record<string, unknown>;
            data: Partial<T>;
        }): Promise<void> {
            const tableName = getFullTableName(options.table);
            const where = buildWhereClause(options.where);
            const whereConditions = buildWhereConditions(where);

            const setClause = Object.entries(options.data as Record<string, unknown>)
                .map(([key, value]) => {
                    return `${validateIdentifier(key)} = ${escapeSqlValue(value)}`;
                })
                .join(', ');

            await db.execute(sql.raw(`UPDATE ${tableName} SET ${setClause} WHERE ${whereConditions}`));
        },

        async delete(options: {
            table: string;
            where: Record<string, unknown>;
        }): Promise<void> {
            const tableName = getFullTableName(options.table);
            const where = buildWhereClause(options.where);
            const whereConditions = buildWhereConditions(where);

            await db.execute(sql.raw(`DELETE FROM ${tableName} WHERE ${whereConditions}`));
        },

        async count(options: {
            table: string;
            where?: Record<string, unknown>;
        }): Promise<number> {
            const tableName = getFullTableName(options.table);
            const where = buildWhereClause(options.where);
            const whereConditions = buildWhereConditions(where);

            const result = await db.execute(
                sql.raw(`SELECT COUNT(*)::int AS count FROM ${tableName} WHERE ${whereConditions}`)
            );
            const rows = result as unknown as { count: number }[];
            return rows[0]?.count ?? 0;
        },

        async raw<T>(sqlQuery: string, params?: unknown[]): Promise<T> {
            // Validate that the query only accesses plugin's own tables
            if (!sqlQuery.includes(tablePrefix)) {
                throw new Error(`Plugin can only access tables with prefix: ${tablePrefix}`);
            }

            const result = await db.execute(sql.raw(sqlQuery));
            return result as T;
        },

        async transaction<T>(callback: (tx: PluginDatabaseCapability) => Promise<T>): Promise<T> {
            // For MVP, transactions use the same connection
            // Full transaction support would require Drizzle transaction API
            return callback(this);
        },
    };
}
