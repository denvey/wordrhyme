import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/client.ts', 'src/server.ts', 'src/trpc.ts', 'src/dev-utils.ts', 'src/react.ts', 'src/admin/index.ts'],
    format: ['esm'],
    external: ['react'],
    dts: {
        resolve: true,
        compilerOptions: {
            composite: false,
        },
    },
    clean: true,
    sourcemap: true,
});
