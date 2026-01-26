/**
 * Data Capability - Scoped database access for plugins
 *
 * Provides plugins with controlled access to their private tables.
 * All operations are automatically scoped to:
 * - Plugin's private tables (prefixed with plugin_{pluginId}_)
 * - Current tenant (organizationId filter)
 */
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import type { PluginDatabaseCapability } from '@wordrhyme/plugin';

/**
 * Create data capability for a plugin
 *
 * @param pluginId - Plugin ID (used for table prefixing)
 * @param organizationId - Optional tenant ID for multi-tenancy
 * @returns PluginDatabaseCapability
 */
export function createPluginDataCapability(
    pluginId: string,
    organizationId?: string
): PluginDatabaseCapability {
    // Convert pluginId to safe table prefix (e.g., com.wordrhyme.hello-world -> com_wordrhyme_hello_world)
    const tablePrefix = `plugin_${pluginId.replace(/[.\-]/g, '_')}_`;

    /**
     * Get full table name with prefix
     */
    function getFullTableName(shortName: string): string {
        return `${tablePrefix}${shortName}`;
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
            result['tenant_id'] = organizationId;
        }
        return result;
    }

    /**
     * Build SQL WHERE conditions from object
     */
    function buildWhereConditions(where: Record<string, unknown>): string {
        const conditions = Object.entries(where)
            .map(([key, value]) => {
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = ${typeof value === 'string' ? `'${value}'` : value}`;
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
                query += ` LIMIT ${options.limit}`;
            }
            if (options.offset !== undefined) {
                query += ` OFFSET ${options.offset}`;
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

                // Add tenant_id if available
                if (organizationId) {
                    rowData['tenant_id'] = organizationId;
                }

                const columns = Object.keys(rowData).join(', ');
                const values = Object.values(rowData)
                    .map(v => (typeof v === 'string' ? `'${v}'` : v === null ? 'NULL' : v))
                    .join(', ');

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
                    const sqlValue = typeof value === 'string' ? `'${value}'` : value === null ? 'NULL' : value;
                    return `${key} = ${sqlValue}`;
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
