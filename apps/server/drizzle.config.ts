import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

// Load .env from monorepo root
dotenv.config({ path: '../../.env' });

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
