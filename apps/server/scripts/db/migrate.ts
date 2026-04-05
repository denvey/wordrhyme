import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { config } from 'dotenv';

type MigrationMeta = {
  folder: string;
  createdAt: number;
  hash: string;
  statements: string[];
};

type DbMigration = {
  id: number;
  hash: string;
  created_at: string;
};

const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

function parseFolderMillis(folder: string): number {
  const timestamp = folder.slice(0, 14);
  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error(`Invalid migration folder name: ${folder}`);
  }

  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(4, 6)) - 1;
  const day = Number(timestamp.slice(6, 8));
  const hour = Number(timestamp.slice(8, 10));
  const minute = Number(timestamp.slice(10, 12));
  const second = Number(timestamp.slice(12, 14));

  return Date.UTC(year, month, day, hour, minute, second);
}

async function loadLocalMigrations(drizzleDir: string): Promise<MigrationMeta[]> {
  const entries = await fs.readdir(drizzleDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const migrations = await Promise.all(
    folders.map(async (folder) => {
      const migrationPath = path.join(drizzleDir, folder, 'migration.sql');
      const sql = await fs.readFile(migrationPath, 'utf8');

      return {
        folder,
        createdAt: parseFolderMillis(folder),
        hash: crypto.createHash('sha256').update(sql).digest('hex'),
        statements: sql
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter(Boolean),
      } satisfies MigrationMeta;
    })
  );

  return migrations;
}

async function main() {
  config({ path: path.resolve(process.cwd(), '../../.env') });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in environment');
  }

  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const localMigrations = await loadLocalMigrations(drizzleDir);
  const sql = postgres(databaseUrl);

  try {
    // Bootstrap migration journal for clean databases. This keeps db:migrate usable
    // outside the pre-provisioned local DB case that already has drizzle metadata.
    await sql.unsafe(`create schema if not exists "${MIGRATIONS_SCHEMA}"`);
    await sql.unsafe(`
      create table if not exists "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);

    const dbMigrations = await sql<DbMigration[]>`
      select id, hash, created_at
      from "drizzle"."__drizzle_migrations"
      order by created_at asc
    `;

    const dbMigrationMap = new Map(
      dbMigrations.map((migration) => [Number(migration.created_at), migration])
    );

    for (const migration of localMigrations) {
      const applied = dbMigrationMap.get(migration.createdAt);
      if (applied && applied.hash !== migration.hash) {
        throw new Error(
          `Migration drift detected for ${migration.folder}: ` +
            `database hash ${applied.hash} != local hash ${migration.hash}`
        );
      }
    }

    const pendingMigrations = localMigrations.filter(
      (migration) => !dbMigrationMap.has(migration.createdAt)
    );

    if (pendingMigrations.length === 0) {
      console.log('[db:migrate] No pending migrations');
      return;
    }

    for (const migration of pendingMigrations) {
      console.log(`[db:migrate] Applying ${migration.folder}`);
      await sql.begin(async (tx) => {
        for (const statement of migration.statements) {
          await tx.unsafe(statement);
        }

        await tx`
          insert into "drizzle"."__drizzle_migrations" (hash, created_at)
          values (${migration.hash}, ${migration.createdAt})
        `;
      });
    }

    console.log(`[db:migrate] Applied ${pendingMigrations.length} migration(s)`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('[db:migrate] Failed:', error);
  process.exit(1);
});
