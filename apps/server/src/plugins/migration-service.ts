import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { pluginMigrations } from '../db/schema/plugin-migrations';
import { eq, and, desc } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * PluginMigrationService - Manages plugin database migrations
 * 
 * Scans plugin migration files and applies them in order.
 * Tracks applied migrations to ensure idempotency.
 */
@Injectable()
export class PluginMigrationService {
    private readonly logger = new Logger(PluginMigrationService.name);

    /**
     * Run migrations for a plugin
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
            .filter(f => f.endsWith('.sql'))
            .sort(); // Sort by filename (001_, 002_, etc.)

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
                continue; // Already applied
            }

            const filePath = path.join(migrationsDir, file);
            const sql = await fs.readFile(filePath, 'utf-8');
            const checksum = this.calculateChecksum(sql);

            try {
                // Execute migration SQL
                await db.execute(sql as unknown as TemplateStringsArray);

                // Record migration
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
        // Get the last applied migration
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
            return false; // No migrations to rollback
        }

        // Look for rollback file (e.g., 001_create_table.down.sql)
        const baseName = lastMigration.migrationFile.replace('.sql', '');
        const rollbackFile = path.join(pluginDir, 'migrations', `${baseName}.down.sql`);

        try {
            const rollbackSql = await fs.readFile(rollbackFile, 'utf-8');
            await db.execute(rollbackSql as unknown as TemplateStringsArray);

            // Remove migration record
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
     * Calculate checksum for migration content
     */
    private calculateChecksum(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
