/**
 * Rsbuild configuration for Hello World Plugin
 *
 * Uses Module Federation 2.0 to expose admin UI as a remote module.
 * Port and MF name are automatically calculated from manifest.json's pluginId.
 */
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { getPluginDevPort, getPluginMfName } from '@wordrhyme/plugin/src/dev-utils';
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';

// Read pluginId from manifest.json - single source of truth
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
const PLUGIN_ID = manifest.pluginId;

// Auto-calculated values
const MF_NAME = getPluginMfName(PLUGIN_ID);
const DEV_PORT = getPluginDevPort(PLUGIN_ID);
const DEV_PUBLIC_PATH = `http://localhost:${DEV_PORT}/`;
const DIR_NAME = basename(__dirname);
const PROD_PUBLIC_PATH = `/plugins/${DIR_NAME}/dist/admin/`;

export default defineConfig(({ command }) => {
    const isDevServer = command === 'dev';
    const publicPath = isDevServer ? DEV_PUBLIC_PATH : PROD_PUBLIC_PATH;

    return {
        plugins: [pluginReact()],
        source: {
            entry: {
                admin: './src/admin/index.tsx',
            },
            define: {
                __WR_PLUGIN_ID__: JSON.stringify(PLUGIN_ID),
            },
        },
        server: {
            port: DEV_PORT,
            cors: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
        },
        dev: {
            hmr: true,
            liveReload: true,
            client: {
                protocol: 'ws',
                host: 'localhost',
                port: DEV_PORT,
            },
        },
        output: {
            distPath: {
                root: 'dist/admin',
            },
            assetPrefix: publicPath,
        },
        tools: {
            rspack: {
                output: {
                    publicPath: publicPath,
                    uniqueName: MF_NAME,
                },
                plugins: [
                    new ModuleFederationPlugin({
                        name: MF_NAME,
                        filename: 'remoteEntry.js',
                        getPublicPath: `return ${JSON.stringify(publicPath)};`,
                        dts: false,
                        manifest: false,
                        exposes: {
                            './admin': './src/admin/index.tsx',
                        },
                        shared: {
                            react: {
                                singleton: true,
                                import: false,
                                requiredVersion: '^18.0.0 || ^19.0.0',
                            },
                            'react-dom': {
                                singleton: true,
                                import: false,
                                requiredVersion: '^18.0.0 || ^19.0.0',
                            },
                            'lucide-react': {
                                singleton: true,
                                import: false,
                            },
                            '@wordrhyme/ui': {
                                singleton: true,
                                import: false,
                            },
                        },
                    }),
                ],
            },
        },
    };
});
