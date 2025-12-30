import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';

interface Plugin {
    id: string;
    name: string;
    version: string;
    status: 'enabled' | 'disabled' | 'error';
    description?: string;
}

/**
 * Hook for loading plugins from server via tRPC
 */
export function usePlugins() {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function loadPlugins() {
            try {
                // TODO: Enable when tRPC is fully connected
                // const data = await trpc.plugin.list.query();
                // setPlugins(data);

                // For now, use mock data
                setPlugins([
                    { id: 'hello-world', name: 'Hello World', version: '1.0.0', status: 'enabled', description: 'Example plugin' },
                ]);
            } catch (err) {
                setError(err as Error);
                setPlugins([]);
            } finally {
                setIsLoading(false);
            }
        }
        loadPlugins();
    }, []);

    return { plugins, isLoading, error };
}

/**
 * Hook for plugin operations
 */
export function usePluginActions() {
    const [isLoading, setIsLoading] = useState(false);

    const enablePlugin = async (pluginId: string) => {
        setIsLoading(true);
        try {
            // TODO: await trpc.plugin.enable.mutate({ pluginId });
            console.log('Enable plugin:', pluginId);
        } finally {
            setIsLoading(false);
        }
    };

    const disablePlugin = async (pluginId: string) => {
        setIsLoading(true);
        try {
            // TODO: await trpc.plugin.disable.mutate({ pluginId });
            console.log('Disable plugin:', pluginId);
        } finally {
            setIsLoading(false);
        }
    };

    return { enablePlugin, disablePlugin, isLoading };
}
