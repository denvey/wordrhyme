import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/trpc.ts', 'src/dev-utils.ts', 'src/react.ts'],
    format: ['esm'],
    dts: {
        resolve: true,
        compilerOptions: {
            composite: false,
        },
    },
    clean: true,
    sourcemap: true,
});
