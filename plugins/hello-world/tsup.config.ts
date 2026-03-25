import { defineConfig } from 'tsup';
import { readPluginId } from '../_build/plugin-build';

const pluginId = readPluginId(import.meta.dirname);

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
    noExternal: ['@wordrhyme/db'],
    sourcemap: true,
    define: {
        __WR_PLUGIN_ID__: JSON.stringify(pluginId),
    },
    // NestJS decorators require these settings
    esbuildOptions(options) {
        options.keepNames = true;
    },
});
