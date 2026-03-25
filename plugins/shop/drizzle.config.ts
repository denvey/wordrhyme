import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import { resolve, join } from 'path';
import { readPluginId } from '../_build/plugin-build';

// Load .env from monorepo root
dotenv.config({ path: '../../.env' });

const pluginRoot = resolve(import.meta.dirname);
process.env.WR_PLUGIN_ID = readPluginId(pluginRoot);

export default defineConfig({
  schema: join(pluginRoot, 'src/shared/schema.ts'),
  // Use relative path — drizzle-kit resolves relative to config file location
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
