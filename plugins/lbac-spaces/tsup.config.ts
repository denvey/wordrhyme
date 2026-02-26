import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/server/index.ts'],
    format: ['cjs'],
    dts: true,
    clean: true,
    outDir: 'dist/server',
    external: ['@wordrhyme/plugin', 'drizzle-orm', 'drizzle-orm/pg-core'],
});
