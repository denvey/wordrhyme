/**
 * Production Database Migration Runner
 *
 * 使用 drizzle-orm 的程序化迁移 API 执行 SQL 迁移。
 * 不依赖 drizzle-kit CLI，不需要 drizzle.config.ts，不需要源码。
 *
 * 用法:
 *   node dist/db/migrate-prod.js              — 执行迁移
 *   RUN_MIGRATE=true node dist/main.js        — server 启动时自动迁移
 *
 * 环境变量:
 *   DATABASE_URL — PostgreSQL 连接字符串 (必需)
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    // Migration SQL files location: apps/server/drizzle/
    // In Docker: /app/apps/server/drizzle/
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');

    console.log('📦 Running database migrations...');
    console.log(`   Migrations folder: ${migrationsFolder}`);

    const db = drizzle(databaseUrl);

    try {
        await migrate(db, { migrationsFolder });
        console.log('✅ Database migrations completed successfully');
    } catch (error) {
        console.error('❌ Database migration failed:', error);
        throw error;
    }
}

// 直接执行时运行迁移
const isDirectRun = process.argv[1]?.endsWith('migrate-prod.js');
if (isDirectRun) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
