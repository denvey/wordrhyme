import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [pluginReact()],
    html: {
        template: './public/index.html',
    },
    server: {
        port: 3001,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/trpc': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/plugins': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    dev: {
        hmr: true,
        liveReload: true,
    },
    tools: {
        postcss: (config, { addPlugins }) => {
            addPlugins(tailwindcss());
        },
        rspack: (config, { appendPlugins }) => {
            // Ensure workspace packages are resolved correctly
            config.resolve = config.resolve || {};
            config.resolve.alias = {
                ...config.resolve.alias,
                '@wordrhyme/plugin': path.resolve(__dirname, '../../packages/plugin/src'),
            };

            appendPlugins([
                new ModuleFederationPlugin({
                    name: 'admin_host',
                    remotes: {
                        // Plugins loaded dynamically at runtime
                    },
                    // Disable MF liveReload for host (remotes handle their own HMR)
                    dev: {
                        disableLiveReload: true,
                    },
                    shared: {
                        react: {
                            singleton: true,
                            eager: true,
                            requiredVersion: '^19.0.0',
                        },
                        'react-dom': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '^19.0.0',
                        },
                        'react-router-dom': {
                            singleton: true,
                            requiredVersion: '^6.0.0',
                        },
                        'lucide-react': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@wordrhyme/ui': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@wordrhyme/auto-crud': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@trpc/client': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@trpc/react-query': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@tanstack/react-query': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                        '@wordrhyme/plugin/react': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '*',
                        },
                    },
                }),
            ]);
        },
    },
});
