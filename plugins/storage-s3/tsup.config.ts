import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/server/index.ts',
        'src/server/router.ts',
        'src/server/s3-storage.provider.ts',
    ],
    outDir: 'dist/server',
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['@wordrhyme/plugin', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    esbuildOptions(options) {
        options.keepNames = true;
    },
});
