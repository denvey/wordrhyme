/**
 * PostgreSQL Full-text Search Provider
 *
 * A search provider using PostgreSQL's built-in full-text search capabilities.
 * Features:
 * - tsvector/tsquery for efficient text search
 * - GIN indexes for fast lookups
 * - Relevance ranking with ts_rank_cd
 * - Multi-language support
 * - Weighted field search (A, B, C, D)
 */

import type {
    SearchProvider,
    SearchProviderMetadata,
    SearchQuery,
    SearchResult,
    SearchHit,
    SearchSort,
} from './types.js';

/**
 * Field configuration for PostgreSQL FTS
 */
export interface PostgresSearchFieldConfig {
    /** Column name in the table */
    column: string;
    /** Weight for relevance scoring (A=highest, D=lowest) */
    weight?: 'A' | 'B' | 'C' | 'D';
}

/**
 * Index configuration for PostgreSQL FTS
 */
export interface PostgresSearchIndexConfig {
    /** Table name */
    table: string;
    /** ID column name */
    idColumn: string;
    /** Tenant ID column name */
    tenantIdColumn: string;
    /** tsvector column name (must exist in table) */
    searchVectorColumn: string;
    /** Fields to include in search results */
    selectColumns: string[];
    /** Language configuration for text search */
    language?: string;
    /** Field configurations for building tsvector */
    fields: PostgresSearchFieldConfig[];
    /** Columns that can be used for filtering (whitelist) */
    filterableColumns?: string[];
    /** Columns that can be used for sorting (whitelist) */
    sortableColumns?: string[];
    /** Columns that can be highlighted */
    highlightableColumns?: string[];
}

/**
 * Database executor interface
 */
export interface DatabaseExecutor {
    execute(query: string): Promise<unknown[]>;
}

/**
 * PostgresSearchProvider configuration
 */
export interface PostgresSearchProviderConfig {
    /** Database executor */
    db: DatabaseExecutor;
    /** Index configurations by index name */
    indexes: Record<string, PostgresSearchIndexConfig>;
    /** Default language for text search */
    defaultLanguage?: string | undefined;
}

/**
 * PostgreSQL Full-text Search Provider
 */
export class PostgresSearchProvider implements SearchProvider {
    private config: PostgresSearchProviderConfig;

    readonly metadata: SearchProviderMetadata = {
        id: 'postgres',
        name: 'PostgreSQL Full-text Search',
        version: '1.0.0',
        capabilities: ['full-text', 'highlight'],
        pluginId: 'search-postgres',
    };

    constructor(config: PostgresSearchProviderConfig) {
        this.config = config;
    }

    /**
     * Get the database executor
     */
    private get db(): DatabaseExecutor {
        return this.config.db;
    }

    /**
     * Get the language configuration
     */
    private getLanguage(indexConfig?: PostgresSearchIndexConfig): string {
        return indexConfig?.language ?? this.config.defaultLanguage ?? 'english';
    }

    /**
     * Configure an index
     */
    configureIndex(name: string, config: PostgresSearchIndexConfig): void {
        this.config.indexes[name] = config;
    }

    /**
     * Index a single document
     * Updates the tsvector column for the document
     */
    async indexDocument(
        index: string,
        id: string,
        doc: Record<string, unknown>,
        tenantId: string
    ): Promise<void> {
        const indexConfig = this.config.indexes[index];
        if (!indexConfig) {
            throw new Error(`Index '${index}' not configured`);
        }

        const { table, idColumn, tenantIdColumn, searchVectorColumn, fields } = indexConfig;
        const lang = this.getLanguage(indexConfig);

        // Build tsvector from document fields
        const tsvectorParts = fields.map((field) => {
            const value = doc[field.column];
            if (value === null || value === undefined) {
                return null;
            }
            const weight = field.weight ?? 'D';
            return `setweight(to_tsvector('${lang}', coalesce(${this.escapeValue(String(value))}, '')), '${weight}')`;
        }).filter(Boolean);

        if (tsvectorParts.length === 0) {
            return;
        }

        const tsvectorExpr = tsvectorParts.join(' || ');

        const query = `
            UPDATE "${table}"
            SET "${searchVectorColumn}" = ${tsvectorExpr}
            WHERE "${idColumn}" = ${this.escapeValue(id)}
              AND "${tenantIdColumn}" = ${this.escapeValue(tenantId)}
        `;

        await this.db.execute(query);
    }

    /**
     * Bulk index multiple documents
     */
    async bulkIndex(
        index: string,
        docs: Array<{ id: string; doc: Record<string, unknown> }>,
        tenantId: string
    ): Promise<void> {
        // For simplicity, process sequentially
        // In production, consider using a single UPDATE with CASE or temp table
        for (const { id, doc } of docs) {
            await this.indexDocument(index, id, doc, tenantId);
        }
    }

    /**
     * Delete a document from the index
     * Clears the tsvector column
     */
    async deleteDocument(
        index: string,
        id: string,
        tenantId: string
    ): Promise<void> {
        const indexConfig = this.config.indexes[index];
        if (!indexConfig) {
            return;
        }

        const { table, idColumn, tenantIdColumn, searchVectorColumn } = indexConfig;

        const query = `
            UPDATE "${table}"
            SET "${searchVectorColumn}" = NULL
            WHERE "${idColumn}" = ${this.escapeValue(id)}
              AND "${tenantIdColumn}" = ${this.escapeValue(tenantId)}
        `;

        await this.db.execute(query);
    }

    /**
     * Search for documents using PostgreSQL full-text search
     */
    async search(index: string, query: SearchQuery): Promise<SearchResult> {
        const startTime = Date.now();
        const indexConfig = this.config.indexes[index];

        if (!indexConfig) {
            return {
                hits: [],
                total: 0,
                took: Date.now() - startTime,
            };
        }

        const {
            table,
            idColumn,
            tenantIdColumn,
            searchVectorColumn,
            selectColumns,
            filterableColumns,
            sortableColumns,
            highlightableColumns,
        } = indexConfig;

        const { term, filters, pagination, sort, tenantId, highlight } = query;
        const limit = pagination?.limit ?? 20;
        const offset = pagination?.offset ?? 0;
        const lang = this.getLanguage(indexConfig);

        // Build allowed columns sets for validation
        const allowedFilterColumns = new Set(filterableColumns ?? selectColumns);
        const allowedSortColumns = new Set(sortableColumns ?? selectColumns);
        const allowedHighlightColumns = new Set(highlightableColumns ?? selectColumns);

        // Build WHERE conditions
        const conditions: string[] = [];

        // Tenant isolation (required)
        conditions.push(`"${tenantIdColumn}" = ${this.escapeValue(tenantId)}`);

        // Full-text search condition
        let tsqueryExpr = '';
        if (term && term.trim()) {
            tsqueryExpr = `websearch_to_tsquery('${lang}', ${this.escapeValue(term)})`;
            conditions.push(`"${searchVectorColumn}" @@ ${tsqueryExpr}`);
        }

        // Additional filters (with whitelist validation)
        if (filters) {
            for (const [field, value] of Object.entries(filters)) {
                if (value === null || value === undefined) {
                    continue;
                }

                // Validate filter field against whitelist
                if (!allowedFilterColumns.has(field)) {
                    continue;
                }

                if (Array.isArray(value)) {
                    if (value.length > 0) {
                        const values = value.map((v) => this.escapeValue(v)).join(', ');
                        conditions.push(`"${field}" IN (${values})`);
                    }
                } else {
                    conditions.push(`"${field}" = ${this.escapeValue(value)}`);
                }
            }
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Build ORDER BY with relevance ranking (with whitelist validation)
        let orderByClause = '';
        if (tsqueryExpr) {
            // Default: order by relevance score
            const rankExpr = `ts_rank_cd("${searchVectorColumn}", ${tsqueryExpr})`;

            if (sort && sort.length > 0) {
                const validSorts = sort.filter((s: SearchSort) =>
                    s.mode === 'rank' || allowedSortColumns.has(s.field)
                );

                if (validSorts.length > 0) {
                    const sortParts = validSorts.map((s: SearchSort) => {
                        if (s.mode === 'rank') {
                            return `${rankExpr} ${s.direction === 'desc' ? 'DESC' : 'ASC'}`;
                        }
                        return `"${s.field}" ${s.direction === 'desc' ? 'DESC' : 'ASC'}`;
                    });
                    orderByClause = `ORDER BY ${sortParts.join(', ')}`;
                } else {
                    orderByClause = `ORDER BY ${rankExpr} DESC`;
                }
            } else {
                orderByClause = `ORDER BY ${rankExpr} DESC`;
            }
        } else if (sort && sort.length > 0) {
            const validSorts = sort.filter((s: SearchSort) => allowedSortColumns.has(s.field));

            if (validSorts.length > 0) {
                const sortParts = validSorts.map(
                    (s: SearchSort) => `"${s.field}" ${s.direction === 'desc' ? 'DESC' : 'ASC'}`
                );
                orderByClause = `ORDER BY ${sortParts.join(', ')}`;
            }
        }

        // Build SELECT columns
        const selectParts = [`"${idColumn}" as id`, ...selectColumns.map((col) => `"${col}"`)];

        // Add relevance score if searching
        if (tsqueryExpr) {
            selectParts.push(`ts_rank_cd("${searchVectorColumn}", ${tsqueryExpr}) as score`);
        }

        // Add highlights if requested (with whitelist validation)
        let highlightSelect = '';
        if (highlight && highlight.fields && highlight.fields.length > 0 && tsqueryExpr) {
            const preTag = highlight.preTag ?? '<mark>';
            const postTag = highlight.postTag ?? '</mark>';

            // Filter to only allowed highlight columns
            const validHighlightFields = highlight.fields.filter(
                (field: string) => allowedHighlightColumns.has(field)
            );

            if (validHighlightFields.length > 0) {
                const highlightParts = validHighlightFields.map((field: string) =>
                    `ts_headline('${lang}', "${field}", ${tsqueryExpr}, 'MaxFragments=3, MaxWords=20, MinWords=10, StartSel=${preTag}, StopSel=${postTag}, FragmentDelimiter=...') as "highlight_${field}"`
                );
                highlightSelect = ', ' + highlightParts.join(', ');
            }
        }

        // Count query
        const countQuery = `SELECT COUNT(*) as total FROM "${table}" ${whereClause}`;

        // Data query
        const dataQuery = `
            SELECT ${selectParts.join(', ')}${highlightSelect}
            FROM "${table}"
            ${whereClause}
            ${orderByClause}
            LIMIT ${limit}
            OFFSET ${offset}
        `;

        try {
            // Execute queries
            const [countResult, dataResult] = await Promise.all([
                this.db.execute(countQuery),
                this.db.execute(dataQuery),
            ]);

            const countRows = countResult as Array<{ total: string }>;
            const dataRows = dataResult as Array<Record<string, unknown>>;

            const total = Number.parseInt(countRows[0]?.total ?? '0', 10);

            const hits: SearchHit[] = dataRows.map((row) => {
                const hit: SearchHit = {
                    id: String(row['id']),
                    score: tsqueryExpr ? Number(row['score'] ?? 0) : 1.0,
                    source: row,
                };

                // Extract highlights
                if (highlight && highlight.fields) {
                    const highlights: Record<string, string[]> = {};
                    for (const field of highlight.fields) {
                        const highlightValue = row[`highlight_${field}`];
                        if (highlightValue) {
                            highlights[field] = [String(highlightValue)];
                        }
                    }
                    if (Object.keys(highlights).length > 0) {
                        hit.highlights = highlights;
                    }
                }

                return hit;
            });

            const took = Date.now() - startTime;

            return {
                hits,
                total,
                took,
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<{ status: 'ok' | 'degraded' | 'error'; details?: unknown }> {
        try {
            await this.db.execute('SELECT 1');
            return { status: 'ok' };
        } catch (error) {
            return {
                status: 'error',
                details: { error: String(error) },
            };
        }
    }

    /**
     * Escape a value for SQL
     */
    private escapeValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
        }
        // String: escape single quotes
        const escaped = String(value).replace(/'/g, "''");
        return `'${escaped}'`;
    }
}

/**
 * Factory function for PostgresSearchProvider
 */
export function createPostgresSearchProvider(
    config: Record<string, unknown>
): PostgresSearchProvider {
    const db = config['db'] as DatabaseExecutor | undefined;
    const indexes = (config['indexes'] as Record<string, PostgresSearchIndexConfig>) ?? {};
    const defaultLanguage = config['defaultLanguage'] as string | undefined;

    if (!db) {
        throw new Error('PostgresSearchProvider requires a database instance');
    }

    return new PostgresSearchProvider({
        db,
        indexes,
        defaultLanguage,
    });
}
