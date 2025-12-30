import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Vitest Configuration for WordRhyme Server
 *
 * Uses SWC for fast TypeScript compilation and NestJS decorator support.
 */
export default defineConfig({
    test: {
        // Use SWC for NestJS decorators
        globals: true,
        root: './',
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        exclude: ['node_modules', 'dist'],

        // Test environment
        environment: 'node',

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'src/**/*.d.ts',
                'src/main.ts',
            ],
        },

        // Test timeout
        testTimeout: 30000,

        // Setup files
        setupFiles: ['./src/__tests__/setup.ts'],
    },

    plugins: [
        // Use SWC for TypeScript compilation with decorators
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                },
                transform: {
                    decoratorMetadata: true,
                    legacyDecorator: true,
                },
            },
        }),
    ],

    resolve: {
        alias: {
            // Aliases if needed
        },
    },
});
