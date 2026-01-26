/**
 * 开发环境数据库重置脚本
 *
 * ⚠️ 警告：此脚本会删除所有数据！仅用于开发环境！
 *
 * 功能：
 * 1. 清空所有表数据
 * 2. 重置序列
 * 3. 保留表结构
 *
 * 运行：pnpm --filter @wordrhyme/server script:reset-dev
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

async function askConfirmation(): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('\n⚠️  这将删除所有数据！确定要继续吗？(yes/no): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes');
        });
    });
}

async function resetDatabase() {
    console.log('\n=== 开发环境数据库重置 ===\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    // 安全检查：确保不是生产环境
    if (databaseUrl.includes('prod') || databaseUrl.includes('production')) {
        console.error('❌ 检测到生产环境数据库！脚本已终止。');
        process.exit(1);
    }

    const confirmed = await askConfirmation();
    if (!confirmed) {
        console.log('\n❌ 操作已取消');
        process.exit(0);
    }

    const client = postgres(databaseUrl);

    try {
        console.log('\n🔄 开始清空数据...\n');

        // 禁用外键约束
        await client`SET session_replication_role = 'replica'`;

        // 获取所有表名（排除系统表）
        const tables = await client`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename NOT LIKE 'pg_%'
            AND tablename NOT LIKE 'sql_%'
        `;

        console.log(`找到 ${tables.length} 个表\n`);

        // 清空每个表
        for (const { tablename } of tables) {
            try {
                await client`TRUNCATE TABLE ${client(tablename)} CASCADE`;
                console.log(`  ✓ 清空表: ${tablename}`);
            } catch (error) {
                console.log(`  ⚠ 跳过表: ${tablename} (${error instanceof Error ? error.message : String(error)})`);
            }
        }

        // 重新启用外键约束
        await client`SET session_replication_role = 'origin'`;

        console.log('\n✅ 数据库已重置！');
        console.log('\n下一步：');
        console.log('  1. 运行 seed 脚本初始化数据');
        console.log('  2. tsx apps/server/seed-initial-data.ts');

    } catch (error) {
        console.error('\n❌ 重置失败:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

resetDatabase();
