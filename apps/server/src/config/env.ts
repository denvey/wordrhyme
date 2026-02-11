import { z } from 'zod';

/**
 * Environment configuration schema
 *
 * All environment variables are validated at startup.
 */
const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),

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
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 *
 * Throws at startup if required env vars are missing.
 */
export const env = envSchema.parse(process.env);
