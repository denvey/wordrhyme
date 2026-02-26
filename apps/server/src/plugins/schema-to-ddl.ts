/**
 * Schema-to-DDL - Generate PostgreSQL DDL from Drizzle table definitions
 *
 * Used by PluginMigrationService to create/drop plugin tables at runtime
 * without requiring hand-written SQL migration files.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { sql as drizzleSql } from 'drizzle-orm';
import { Logger } from '@nestjs/common';

const logger = new Logger('SchemaToDDL');

/**
 * Plugin schema export convention.
 * Plugins export a `schema` object from their server entry containing:
 * - Drizzle table definitions (PgTable instances)
 * - Optional `customSQL`: raw SQL statements for things Drizzle can't express
 * - Optional `selfReferences`: self-referencing FKs
 * - Optional `requiredExtensions`: PostgreSQL extensions to install
 */
export interface PluginSchemaExport {
    /** PgTable instances + metadata (mixed object) */
    [key: string]: unknown;
    customSQL?: readonly string[];
    selfReferences?: readonly {
        table: string;
        column: string;
        references: { table: string; column: string };
        onDelete?: string;
    }[];
    requiredExtensions?: readonly string[];
}

/**
 * Extract all PgTable instances from a plugin schema export
 */
export function extractTables(schema: PluginSchemaExport): PgTable[] {
    const tables: PgTable[] = [];
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'customSQL' || key === 'selfReferences' || key === 'requiredExtensions') {
            continue;
        }
        if (isPgTable(value)) {
            tables.push(value);
        }
    }
    return tables;
}

/**
 * Check if a value is a Drizzle PgTable
 */
function isPgTable(value: unknown): value is PgTable {
    return (
        value !== null &&
        typeof value === 'object' &&
        Symbol.for('drizzle:Name') in (value as object)
    );
}

/**
 * Generate full DDL for a plugin schema (CREATE EXTENSION + CREATE TABLE + CREATE INDEX)
 */
export function generateSchemaCreateDDL(schema: PluginSchemaExport): string[] {
    const statements: string[] = [];

    // 1. Extensions
    const extensions = schema.requiredExtensions as readonly string[] | undefined;
    if (extensions) {
        for (const ext of extensions) {
            statements.push(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
        }
    }

    // 2. Tables (in order - parent tables first)
    const tables = extractTables(schema);
    for (const table of tables) {
        statements.push(generateCreateTable(table));
    }

    // 3. Self-referencing FKs (must be after tables are created)
    const selfRefs = schema.selfReferences as PluginSchemaExport['selfReferences'];
    if (selfRefs) {
        for (const ref of selfRefs) {
            const constraintName = `${ref.table}_${ref.column}_fkey`;
            const onDeleteClause = ref.onDelete ? ` ON DELETE ${ref.onDelete.toUpperCase()}` : '';
            statements.push(
                `DO $$ BEGIN ` +
                `IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN ` +
                `ALTER TABLE "${ref.table}" ADD CONSTRAINT "${constraintName}" ` +
                `FOREIGN KEY ("${ref.column}") REFERENCES "${ref.references.table}"("${ref.references.column}")${onDeleteClause}; ` +
                `END IF; END $$`
            );
        }
    }

    // 4. Indexes
    for (const table of tables) {
        statements.push(...generateCreateIndexes(table));
    }

    // 5. Custom SQL (e.g., GIST indexes with ltree)
    const customSQL = schema.customSQL as readonly string[] | undefined;
    if (customSQL) {
        statements.push(...customSQL);
    }

    return statements;
}

/**
 * Generate CREATE TABLE IF NOT EXISTS statement
 */
function generateCreateTable(table: PgTable): string {
    const config = getTableConfig(table);
    const columns: string[] = [];

    for (const col of config.columns) {
        let def = `"${col.name}" ${col.getSQLType()}`;

        if (col.primary) {
            def += ' PRIMARY KEY';
        }
        if (col.notNull && !col.primary) {
            def += ' NOT NULL';
        }
        if (col.hasDefault) {
            const defaultVal = resolveDefault(col);
            if (defaultVal !== null) {
                def += ` DEFAULT ${defaultVal}`;
            }
        }

        columns.push(def);
    }

    // Inline foreign keys
    for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const localCols = ref.columns.map((c: any) => `"${c.name}"`).join(', ');
        const foreignTable = (ref.foreignTable as any)[Symbol.for('drizzle:Name')];
        const foreignCols = ref.foreignColumns.map((c: any) => `"${c.name}"`).join(', ');
        let constraint = `FOREIGN KEY (${localCols}) REFERENCES "${foreignTable}"(${foreignCols})`;
        if (fk.onDelete) {
            constraint += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
        }
        if (fk.onUpdate) {
            constraint += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
        }
        columns.push(constraint);
    }

    return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n  ${columns.join(',\n  ')}\n)`;
}

/**
 * Generate CREATE INDEX statements for a table
 */
function generateCreateIndexes(table: PgTable): string[] {
    const config = getTableConfig(table);
    const statements: string[] = [];

    for (const idx of config.indexes) {
        const idxConfig = (idx as any).config;
        const unique = idxConfig.unique ? 'UNIQUE ' : '';
        const indexName = idxConfig.name;
        const columns = idxConfig.columns.map((c: any) => `"${c.name}"`).join(', ');
        statements.push(
            `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${config.name}" (${columns})`
        );
    }

    return statements;
}

/**
 * Resolve column default value to SQL string
 */
function resolveDefault(col: any): string | null {
    const defaultValue = col.default;

    if (defaultValue === undefined || defaultValue === null) {
        return null;
    }

    // Drizzle SQL object (e.g., defaultNow() -> SQL { now() })
    if (typeof defaultValue === 'object' && defaultValue.queryChunks) {
        // Extract raw SQL from the SQL object
        try {
            const chunks = defaultValue.queryChunks;
            if (chunks.length > 0 && chunks[0]?.value) {
                return chunks[0].value.join('');
            }
        } catch {
            // fallback
        }
        return 'now()';
    }

    // defaultFn (e.g., defaultRandom())
    if (col.defaultFn) {
        return 'gen_random_uuid()';
    }

    // Primitive values
    if (typeof defaultValue === 'string') {
        return `'${defaultValue.replace(/'/g, "''")}'`;
    }
    if (typeof defaultValue === 'number' || typeof defaultValue === 'boolean') {
        return String(defaultValue);
    }

    return null;
}

/**
 * Generate DROP TABLE statements for a plugin schema
 * Tables are dropped in reverse order to handle FK dependencies
 */
export function generateSchemaDropDDL(schema: PluginSchemaExport): string[] {
    const tables = extractTables(schema);
    const tableNames = tables.map(t => getTableConfig(t).name);

    // Reverse order to handle FK dependencies
    return tableNames.reverse().map(name => `DROP TABLE IF EXISTS "${name}" CASCADE`);
}

/**
 * Get all table names from a plugin schema
 */
export function getSchemaTableNames(schema: PluginSchemaExport): string[] {
    return extractTables(schema).map(t => getTableConfig(t).name);
}
