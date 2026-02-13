import { defineConfig } from 'tsup';

export default defineConfig([
    // Main entry point for backend (keeps external dependencies)
    {
        entry: [
            'src/index.ts',
            'src/schema/index.ts',
            'src/relations/index.ts',
            'src/types/index.ts',
        ],
        format: ['esm'],
        dts: false,
        clean: true,
        sourcemap: true,
    },
    // Pure Zod entry point for frontend (inlines and tree-shakes drizzle)
    {
        entry: {
            'zod/index': 'src/zod/index.ts',
        },
        format: ['esm'],
        dts: false,
        clean: false, // Don't clean to avoid removing the first build
        noExternal: ['drizzle-zod', 'drizzle-orm'],
        minify: true,
        splitting: true,
        treeshake: 'smallest',
        sourcemap: true,
        // Define process.env.NODE_ENV to allow more tree-shaking
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
    }
]);
