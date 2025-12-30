import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/server/index.ts',
        'src/server/hello.module.ts',
        'src/server/hello.service.ts',
    ],
    outDir: 'dist/server',
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    // NestJS decorators require these settings
    esbuildOptions(options) {
        options.keepNames = true;
    },
});
