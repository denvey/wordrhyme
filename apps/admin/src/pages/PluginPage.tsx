/**
 * Plugin Page Component
 *
 * Dynamically loads and renders plugin pages based on URL parameters.
 * Supports routes like /p/:pluginId/* where the wildcard is passed to the plugin.
 */
import { useParams } from 'react-router-dom';
import { Suspense, useMemo } from 'react';
import { Skeleton } from '@wordrhyme/ui';
import { useSlotExtensions, PluginErrorBoundary } from '../lib/extensions';
import type { NavTarget } from '../lib/extensions';

export function PluginPage() {
    const { pluginId, '*': subPath } = useParams<{ pluginId: string; '*': string }>();
    const entries = useSlotExtensions('nav.sidebar');

    const matchedEntry = useMemo(() => {
        if (!pluginId) return null;

        const pluginEntries = entries.filter(
            (e) => e.extension.pluginId === pluginId
        );

        const currentPath = `/p/${pluginId}${subPath ? `/${subPath}` : ''}`;

        const exactMatch = pluginEntries.find(
            (e) => (e.target as NavTarget).path === currentPath
        );
        if (exactMatch) return exactMatch;

        const rootMatch = pluginEntries.find(
            (e) => (e.target as NavTarget).path === `/p/${pluginId}`
        );
        if (rootMatch) return rootMatch;

        return pluginEntries[0] ?? null;
    }, [pluginId, subPath, entries]);

    if (!pluginId) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">Plugin Not Found</h2>
                <p>No plugin ID specified in the URL.</p>
            </div>
        );
    }

    if (!matchedEntry) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">Plugin Page Not Available</h2>
                <p>
                    The plugin <code className="bg-muted px-2 py-1 rounded">{pluginId}</code>{' '}
                    does not have a registered page or is not loaded.
                </p>
            </div>
        );
    }

    const Component = matchedEntry.extension.component;

    if (!Component) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">Plugin Page Not Available</h2>
                <p>The plugin does not have a local component registered.</p>
            </div>
        );
    }

    return (
        <div className="plugin-page">
            <PluginErrorBoundary pluginId={pluginId}>
                <Suspense fallback={<PluginPageSkeleton />}>
                    <Component />
                </Suspense>
            </PluginErrorBoundary>
        </div>
    );
}

function PluginPageSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <div className="grid gap-4 mt-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        </div>
    );
}
