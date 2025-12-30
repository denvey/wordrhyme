/**
 * Plugin Page Component
 *
 * Dynamically loads and renders plugin pages based on URL parameters.
 * Supports routes like /p/:pluginId/* where the wildcard is passed to the plugin.
 *
 * @task 5.2.14 - Implement dynamic plugin route handling
 */
import { useParams, useLocation } from 'react-router-dom';
import { Suspense, useMemo } from 'react';
import { Skeleton } from '@wordrhyme/ui';
import { useExtensions, PluginErrorBoundary } from '../components/PluginUILoader';
import { ExtensionPoint, type SidebarExtension } from '../lib/extensions';

/**
 * Plugin page that renders based on pluginId URL parameter
 */
export function PluginPage() {
    const { pluginId, '*': subPath } = useParams<{ pluginId: string; '*': string }>();
    const location = useLocation();
    const extensions = useExtensions();

    // Find the plugin's sidebar extension (which has the page component)
    const pluginExtension = useMemo(() => {
        if (!pluginId) return null;

        // Look for a sidebar extension that matches this plugin
        const sidebarExtensions = extensions.filter(
            (ext): ext is SidebarExtension =>
                ext.type === ExtensionPoint.SIDEBAR && ext.pluginId === pluginId
        );

        // Find the best matching extension based on path
        // Priority: exact path match > root path > first available
        const currentPath = `/p/${pluginId}${subPath ? `/${subPath}` : ''}`;

        const exactMatch = sidebarExtensions.find(ext => ext.path === currentPath);
        if (exactMatch) return exactMatch;

        const rootMatch = sidebarExtensions.find(ext => ext.path === `/p/${pluginId}`);
        if (rootMatch) return rootMatch;

        return sidebarExtensions[0] ?? null;
    }, [pluginId, subPath, extensions]);

    // Plugin not found or not loaded
    if (!pluginId) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">Plugin Not Found</h2>
                <p>No plugin ID specified in the URL.</p>
            </div>
        );
    }

    // Plugin extension not found - could be loading or doesn't exist
    if (!pluginExtension) {
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

    const Component = pluginExtension.component;

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

/**
 * Skeleton loader for plugin pages
 */
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
