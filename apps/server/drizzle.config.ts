import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root
dotenv.config({ path: join(__dirname, '../../.env') });

export default defineConfig({
  // Use packages/db as the single source of truth for schema
  schema: '../../packages/db/src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
