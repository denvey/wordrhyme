import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/schema/index.ts',
        'src/relations/index.ts',
        'src/types/index.ts',
        'src/zod/index.ts',
    ],
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
});
