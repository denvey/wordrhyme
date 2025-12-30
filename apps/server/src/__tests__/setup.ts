/**
 * Test Setup
 *
 * Global setup file for Vitest tests.
 * Loads environment variables and configures test environment.
 */
import { config } from 'dotenv';
import path from 'path';

// Load test environment variables
config({ path: path.join(process.cwd(), '.env.test') });

// Set default test environment if not specified
if (!process.env['DATABASE_URL']) {
    // Use test database URL
    process.env['DATABASE_URL'] = 'postgresql://wordrhyme:wordrhyme@localhost:5432/wordrhyme_test';
}

// Silence NestJS logger in tests
process.env['LOG_LEVEL'] = 'error';
