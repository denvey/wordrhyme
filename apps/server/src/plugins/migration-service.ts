import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { pluginMigrations } from '@wordrhyme/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
    generateSchemaCreateDDL,
    generateSchemaDropDDL,
    getSchemaTableNames,
    type PluginSchemaExport,
} from './schema-to-ddl';

/**
 * PluginMigrationService - Manages plugin database migrations
 *
 * Supports two modes:
 * 1. **Drizzle schema** (recommended): Plugin exports `schema` object with pgTable definitions.
 *    DDL is auto-generated and executed statement-by-statement.
 * 2. **SQL files** (legacy): Plugin has `migrations/*.sql` files executed in order.
 */
@Injectable()
export class PluginMigrationService {
    private readonly logger = new Logger(PluginMigrationService.name);

    /**
     * Run Drizzle schema migration for a plugin
     *
     * Generates DDL from Drizzle table definitions and executes each statement.
     * Uses checksum-based tracking to only run when schema changes.
     *
     * @param pluginId - Plugin identifier
     * @param schema - Plugin's exported schema object
     * @param organizationId - Organization ID for scoping
     */
    async runDrizzleSchema(
        pluginId: string,
        schema: PluginSchemaExport,
        organizationId: string,
    ): Promise<void> {
        const statements = generateSchemaCreateDDL(schema);
        if (!statements.length) {
            return;
        }

        // Calculate checksum of all DDL statements combined
        const ddlContent = statements.join(';\n');
        const checksum = this.calculateChecksum(ddlContent);
        const migrationFile = '__drizzle_schema__';

        // Check if this exact schema version was already applied
        const [existing] = await db.select()
            .from(pluginMigrations)
            .where(
                and(
                    eq(pluginMigrations.pluginId, pluginId),
                    eq(pluginMigrations.organizationId, organizationId),
                    eq(pluginMigrations.migrationFile, migrationFile),
                )
            )
            .limit(1);

        if (existing?.checksum === checksum) {
            this.logger.debug(`Schema unchanged for plugin ${pluginId}, skipping`);
            return;
        }

        // Execute each DDL statement individually
        for (const stmt of statements) {
            try {
                await db.execute(sql.raw(stmt));
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.error(`❌ Failed DDL for ${pluginId}: ${stmt.substring(0, 100)}...`);
                throw new Error(`Schema migration failed: ${err.message}\nStatement: ${stmt.substring(0, 200)}`);
            }
        }

        // Record or update migration
        if (existing) {
            await db.update(pluginMigrations)
                .set({ checksum, appliedAt: new Date() })
                .where(eq(pluginMigrations.id, existing.id));
        } else {
            await db.insert(pluginMigrations).values({
                pluginId,
                organizationId,
                migrationFile,
                checksum,
            });
        }

        const tableNames = getSchemaTableNames(schema);
        this.logger.log(`✅ Schema applied for ${pluginId} (tables: ${tableNames.join(', ')})`);
    }

    /**
     * Drop all tables for a plugin schema (used during uninstall)
     *
     * @param pluginId - Plugin identifier
     * @param schema - Plugin's exported schema object
     * @param organizationId - Organization ID for scoping
     */
    async dropPluginSchema(
        pluginId: string,
        schema: PluginSchemaExport,
        organizationId: string,
    ): Promise<void> {
        const dropStatements = generateSchemaDropDDL(schema);

        for (const stmt of dropStatements) {
            try {
                await db.execute(sql.raw(stmt));
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.error(`❌ Failed to drop table for ${pluginId}: ${err.message}`);
                // Continue dropping other tables even if one fails
            }
        }

        // Remove migration records
        await db.delete(pluginMigrations).where(
            and(
                eq(pluginMigrations.pluginId, pluginId),
                eq(pluginMigrations.organizationId, organizationId),
            )
        );

        const tableNames = getSchemaTableNames(schema);
        this.logger.log(`🗑️ Dropped tables for ${pluginId}: ${tableNames.join(', ')}`);
    }

    /**
     * Run SQL file migrations for a plugin (legacy mode)
     *
     * @param pluginId - Plugin identifier
     * @param pluginDir - Path to plugin directory
     * @param organizationId - Organization ID for scoping
     */
    async runMigrations(
        pluginId: string,
        pluginDir: string,
        organizationId: string
    ): Promise<void> {
        const migrationsDir = path.join(pluginDir, 'migrations');

        // Check if migrations directory exists
        try {
            await fs.access(migrationsDir);
        } catch {
            this.logger.debug(`No migrations directory for plugin ${pluginId}`);
            return;
        }

        // Get all migration files
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files
            .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
            .sort();

        if (!sqlFiles.length) {
            return;
        }

        // Get applied migrations
        const applied = await db.select()
            .from(pluginMigrations)
            .where(
                and(
                    eq(pluginMigrations.pluginId, pluginId),
                    eq(pluginMigrations.organizationId, organizationId)
                )
            )
            .orderBy(desc(pluginMigrations.appliedAt));

        const appliedNames = new Set(applied.map(m => m.migrationFile));

        // Apply pending migrations
        for (const file of sqlFiles) {
            if (appliedNames.has(file)) {
                continue;
            }

            const filePath = path.join(migrationsDir, file);
            const sqlContent = await fs.readFile(filePath, 'utf-8');
            const checksum = this.calculateChecksum(sqlContent);

            // Split SQL into individual statements and execute one by one
            const statements = this.splitSqlStatements(sqlContent);

            try {
                for (const stmt of statements) {
                    await db.execute(sql.raw(stmt));
                }

                await db.insert(pluginMigrations).values({
                    pluginId,
                    organizationId,
                    migrationFile: file,
                    checksum,
                });

                this.logger.log(`✅ Applied migration ${file} for plugin ${pluginId}`);
            } catch (error) {
                this.logger.error(`❌ Failed to apply migration ${file}: ${error}`);
                throw error;
            }
        }
    }

    /**
     * Rollback the last migration for a plugin
     */
    async rollbackLastMigration(
        pluginId: string,
        pluginDir: string,
        organizationId: string
    ): Promise<boolean> {
        const [lastMigration] = await db.select()
            .from(pluginMigrations)
            .where(
                and(
                    eq(pluginMigrations.pluginId, pluginId),
                    eq(pluginMigrations.organizationId, organizationId)
                )
            )
            .orderBy(desc(pluginMigrations.appliedAt))
            .limit(1);

        if (!lastMigration) {
            return false;
        }

        const baseName = lastMigration.migrationFile.replace('.sql', '');
        const rollbackFile = path.join(pluginDir, 'migrations', `${baseName}.down.sql`);

        try {
            const rollbackSql = await fs.readFile(rollbackFile, 'utf-8');
            const statements = this.splitSqlStatements(rollbackSql);
            for (const stmt of statements) {
                await db.execute(sql.raw(stmt));
            }

            await db.delete(pluginMigrations).where(
                eq(pluginMigrations.id, lastMigration.id)
            );

            this.logger.log(`✅ Rolled back migration ${lastMigration.migrationFile}`);
            return true;
        } catch {
            this.logger.warn(`No rollback file found: ${rollbackFile}`);
            return false;
        }
    }

    /**
     * Split SQL content into individual statements
     *
     * Handles:
     * - Semicolon-separated statements
     * - DO $$ ... $$ blocks (PL/pgSQL)
     * - Comments (-- and /* *\/)
     */
    private splitSqlStatements(content: string): string[] {
        const statements: string[] = [];
        let current = '';
        let inDollarBlock = false;

        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('--')) {
                continue;
            }

            // Detect DO $$ blocks
            if (trimmed.toUpperCase().startsWith('DO $$') || trimmed.toUpperCase().startsWith('DO $')) {
                inDollarBlock = true;
            }
            if (inDollarBlock && trimmed.endsWith('$$;')) {
                current += line + '\n';
                statements.push(current.trim().replace(/;$/, ''));
                current = '';
                inDollarBlock = false;
                continue;
            }

            if (inDollarBlock) {
                current += line + '\n';
                continue;
            }

            // Regular statement - accumulate until semicolon
            current += line + '\n';
            if (trimmed.endsWith(';')) {
                const stmt = current.trim().replace(/;$/, '');
                if (stmt) {
                    statements.push(stmt);
                }
                current = '';
            }
        }

        // Handle trailing statement without semicolon
        const remaining = current.trim().replace(/;$/, '');
        if (remaining) {
            statements.push(remaining);
        }

        return statements;
    }

    /**
     * Calculate checksum for migration content
     */
    private calculateChecksum(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
