import postgres from 'postgres';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(process.env.DATABASE_URL);

  await sql.unsafe(`
    create table if not exists plugin_instances (
      id text primary key,
      plugin_id text not null,
      version text not null,
      status text not null,
      manifest jsonb not null,
      installed_at timestamp not null default now(),
      updated_at timestamp not null default now()
    )
  `);

  await sql.unsafe(`
    create unique index if not exists unique_plugin_per_instance
    on plugin_instances (plugin_id)
  `);

  await sql.unsafe(`
    alter table plugins add column if not exists installation_status text
  `);

  await sql.unsafe(`
    alter table plugins add column if not exists activation_status text
  `);

  await sql.unsafe(`
    update plugins
    set
      installation_status = case
        when status = 'uninstalled' then 'uninstalled'
        else 'installed'
      end,
      activation_status = case
        when status = 'enabled' then 'enabled'
        else 'disabled'
      end
    where installation_status is null
       or activation_status is null
  `);

  await sql.unsafe(`
    alter table plugins
    alter column installation_status set default 'installed'
  `);

  await sql.unsafe(`
    alter table plugins
    alter column activation_status set default 'enabled'
  `);

  await sql.unsafe(`
    alter table plugins
    alter column installation_status set not null
  `);

  await sql.unsafe(`
    alter table plugins
    alter column activation_status set not null
  `);

  console.log('plugin schema patched');
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
