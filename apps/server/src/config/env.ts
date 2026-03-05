import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root
dotenv.config({ path: join(__dirname, '../../../../.env') });

/**
 * Environment configuration schema
 *
 * All environment variables are validated at startup.
 */
const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    APP_URL: z.string().url().optional(),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url().optional(),

    // CORS
    CORS_ORIGINS: z.string().optional(),

    // Plugin
    PLUGIN_DIR: z.string().default('./plugins'),
    PLUGIN_MODE: z.enum(['development', 'production']).default('development'),

    // Safe Mode (skip non-core plugins)
    WORDRHYME_SAFE_MODE: z.coerce.boolean().default(false),

    // Stripe (optional — only needed when Stripe adapter is enabled)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 *
 * Throws at startup if required env vars are missing.
 */
export const env = envSchema.parse(process.env);
