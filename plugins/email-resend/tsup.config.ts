import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/server/index.ts',
        'src/server/resend.service.ts',
    ],
    outDir: 'dist/server',
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['@wordrhyme/plugin', 'resend'],
    esbuildOptions(options) {
        options.keepNames = true;
    },
});
