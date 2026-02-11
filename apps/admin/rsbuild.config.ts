import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import tailwindcss from '@tailwindcss/postcss';

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
                            requiredVersion: '^18.0.0 || ^19.0.0',
                        },
                        'react-dom': {
                            singleton: true,
                            eager: true,
                            requiredVersion: '^18.0.0 || ^19.0.0',
                        },
                        'react-router-dom': {
                            singleton: true,
                            requiredVersion: '^6.0.0',
                        },
                        'lucide-react': {
                            singleton: true,
                            eager: true,
                        },
                        '@wordrhyme/ui': {
                            singleton: true,
                            eager: true,
                        },
                        '@wordrhyme/auto-crud': {
                            singleton: true,
                            eager: true,
                        },
                    },
                }),
            ]);
        },
    },
});
