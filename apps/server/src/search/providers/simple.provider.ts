/**
 * Simple Search Provider
 *
 * A basic search provider using SQL ILIKE for pattern matching.
 * This is the default fallback provider that works with any SQL database.
 *
 * Limitations:
 * - No relevance scoring (all results have score 1.0)
 * - No highlighting
 * - Performance degrades on large datasets
 * - Case-insensitive but no fuzzy matching
 */

import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import type {
  SearchProvider,
  SearchProviderMetadata,
  SearchQuery,
  SearchResult,
  SearchHit,
} from './provider.interface.js';

/**
 * Index configuration for SimpleSearchProvider
 */
export interface SimpleSearchIndexConfig {
  /** Table name */
  table: string;
  /** ID column name */
  idColumn: string;
  /** Tenant ID column name */
  organizationIdColumn: string;
  /** Columns to search in */
  searchColumns: string[];
  /** Columns to return in results */
  selectColumns: string[];
  /** Columns that can be used for filtering (whitelist) */
  filterableColumns?: string[];
  /** Columns that can be used for sorting (whitelist) */
  sortableColumns?: string[];
}

/**
 * SimpleSearchProvider configuration
 */
export interface SimpleSearchProviderConfig {
  /** Index configurations by index name */
  indexes: Record<string, SimpleSearchIndexConfig>;
}

/**
 * Simple Search Provider
 *
 * Uses SQL ILIKE for basic pattern matching.
 * Suitable for small datasets or as a fallback.
 */
export class SimpleSearchProvider implements SearchProvider {
  private readonly logger = new Logger(SimpleSearchProvider.name);
  private config: SimpleSearchProviderConfig;

  readonly metadata: SearchProviderMetadata = {
    id: 'simple',
    name: 'Simple Search',
    version: '1.0.0',
    capabilities: [],
    default: true,
    pluginId: 'core',
  };

  constructor(config: SimpleSearchProviderConfig = { indexes: {} }) {
    this.config = config;
  }

  /**
   * Configure an index
   */
  configureIndex(name: string, config: SimpleSearchIndexConfig): void {
    this.config.indexes[name] = config;
    this.logger.debug(`Index configured: ${name}`);
  }

  /**
   * Index a document (no-op for simple provider)
   * Simple provider searches directly from the database table
   */
  async indexDocument(
    index: string,
    id: string,
    _doc: Record<string, unknown>,
    _organizationId: string
  ): Promise<void> {
    // No-op: Simple provider searches directly from tables
    this.logger.debug(
      `indexDocument called for ${index}/${id} (no-op for simple provider)`
    );
  }

  /**
   * Bulk index documents (no-op for simple provider)
   */
  async bulkIndex(
    index: string,
    docs: Array<{ id: string; doc: Record<string, unknown> }>,
    _organizationId: string
  ): Promise<void> {
    // No-op: Simple provider searches directly from tables
    this.logger.debug(
      `bulkIndex called for ${index} with ${docs.length} docs (no-op for simple provider)`
    );
  }

  /**
   * Delete a document (no-op for simple provider)
   */
  async deleteDocument(
    index: string,
    id: string,
    _organizationId: string
  ): Promise<void> {
    // No-op: Simple provider searches directly from tables
    this.logger.debug(
      `deleteDocument called for ${index}/${id} (no-op for simple provider)`
    );
  }

  /**
   * Search for documents using ILIKE
   */
  async search(index: string, query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    const indexConfig = this.config.indexes[index];

    if (!indexConfig) {
      this.logger.warn(`Index '${index}' not configured, returning empty results`);
      return {
        hits: [],
        total: 0,
        took: Date.now() - startTime,
      };
    }

    const {
      table,
      idColumn,
      organizationIdColumn,
      searchColumns,
      selectColumns,
      filterableColumns,
      sortableColumns,
    } = indexConfig;

    const { term, filters, pagination, sort, organizationId } = query;
    const limit = pagination?.limit ?? 20;
    const offset = pagination?.offset ?? 0;

    // Build allowed columns sets for validation
    const allowedFilterColumns = new Set(filterableColumns ?? selectColumns);
    const allowedSortColumns = new Set(sortableColumns ?? selectColumns);

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Tenant isolation (required)
    conditions.push(`"${organizationIdColumn}" = $${paramIndex}`);
    params.push(organizationId);
    paramIndex++;

    // Search term with ILIKE across configured columns
    if (term && term.trim()) {
      const searchPattern = `%${term.trim()}%`;
      const searchConditions = searchColumns.map((col) => {
        const condition = `"${col}" ILIKE $${paramIndex}`;
        return condition;
      });
      // All search columns share the same parameter
      conditions.push(`(${searchConditions.join(' OR ')})`);
      params.push(searchPattern);
      paramIndex++;
    }

    // Additional filters (with whitelist validation)
    if (filters) {
      for (const [field, value] of Object.entries(filters)) {
        if (value === null || value === undefined) {
          continue;
        }

        // Validate filter field against whitelist
        if (!allowedFilterColumns.has(field)) {
          this.logger.warn(`Filter field '${field}' not in whitelist, skipping`);
          continue;
        }

        if (Array.isArray(value)) {
          if (value.length > 0) {
            const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`"${field}" IN (${placeholders})`);
            params.push(...value);
          }
        } else {
          conditions.push(`"${field}" = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Build ORDER BY (with whitelist validation)
    let orderByClause = '';
    if (sort && sort.length > 0) {
      const validSorts = sort.filter((s) => {
        if (!allowedSortColumns.has(s.field)) {
          this.logger.warn(`Sort field '${s.field}' not in whitelist, skipping`);
          return false;
        }
        return true;
      });

      if (validSorts.length > 0) {
        const sortParts = validSorts.map(
          (s) => `"${s.field}" ${s.direction === 'desc' ? 'DESC' : 'ASC'}`
        );
        orderByClause = `ORDER BY ${sortParts.join(', ')}`;
      }
    }

    // Build SELECT columns
    const selectClause = selectColumns.map((col) => `"${col}"`).join(', ');

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM "${table}" ${whereClause}`;

    // Data query
    const dataQuery = `
      SELECT "${idColumn}" as id, ${selectClause}
      FROM "${table}"
      ${whereClause}
      ${orderByClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    try {
      // Execute queries
      const [countResult, dataResult] = await Promise.all([
        db.execute(sql.raw(this.interpolateParams(countQuery, params))),
        db.execute(sql.raw(this.interpolateParams(dataQuery, params))),
      ]);

      // Access results as arrays
      const countRows = countResult as unknown as Array<{ total: string }>;
      const dataRows = dataResult as unknown as Array<Record<string, unknown>>;

      const total = Number.parseInt(countRows[0]?.total ?? '0', 10);

      const hits: SearchHit[] = dataRows.map((row) => ({
        id: String(row['id']),
        score: 1.0, // No relevance scoring in simple search
        source: row,
      }));

      const took = Date.now() - startTime;

      this.logger.debug(
        `Search completed: index=${index}, term="${term}", total=${total}, took=${took}ms`
      );

      return {
        hits,
        total,
        took,
      };
    } catch (error) {
      this.logger.error(`Search failed for index ${index}: ${error}`);
      throw error;
    }
  }

  /**
   * Interpolate parameters into SQL query
   * Note: This is a simple implementation for demonstration.
   * In production, use parameterized queries properly.
   */
  private interpolateParams(query: string, params: unknown[]): string {
    let result = query;
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      const value = this.escapeValue(param);
      result = result.replace(placeholder, value);
    });
    return result;
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
 * Factory function for SimpleSearchProvider
 */
export function createSimpleSearchProvider(
  config: Record<string, unknown>
): SimpleSearchProvider {
  const indexes = (config['indexes'] as Record<string, SimpleSearchIndexConfig>) ?? {};
  return new SimpleSearchProvider({ indexes });
}
