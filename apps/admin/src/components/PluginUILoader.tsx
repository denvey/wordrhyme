/**
 * PluginUILoader Component
 *
 * Loads plugin UIs from the server via Module Federation and injects
 * them into the appropriate extension points.
 */
import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { trpc } from '../lib/trpc';
import { loadPlugins, unloadPlugin } from '../lib/extensions/plugin-loader';
import { ExtensionRegistry, type Extension } from '../lib/extensions';
import { Skeleton } from '@wordrhyme/ui';
import { getPluginDevRemoteEntry, getPluginMfName } from '@wordrhyme/plugin/dev-utils';

interface LoadingState {
    isLoading: boolean;
    error: string | null;
    loadedPlugins: string[];
}

/**
 * Plugin UI Loader - fetches plugin manifests and loads their UIs
 */
export function PluginUILoader({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<LoadingState>({
        isLoading: true,
        error: null,
        loadedPlugins: [],
    });

    // Fetch enabled plugins from server
    const { data: plugins, isLoading: isQueryLoading, error: queryError } = trpc.plugin.list.useQuery();

    // Debug logging
    console.log('[PluginUILoader] Query state:', { isLoading: isQueryLoading, plugins, error: queryError });

    // Load plugin UIs when plugins data changes
    useEffect(() => {
        console.log('[PluginUILoader] Effect triggered:', { isQueryLoading, plugins });
        if (isQueryLoading || !plugins) {
            console.log('[PluginUILoader] Waiting for plugins data...');
            return;
        }

        const loadPluginUIs = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            try {
                // Check if we're in development mode
                const isDev = import.meta.env.DEV;

                // Convert server plugin data to manifest format for loader
                const manifestsWithAdmin = plugins
                    .filter((p: { manifest: { admin?: { remoteEntry?: string } } }) =>
                        p.manifest.admin?.remoteEntry
                    )
                    .map((p: {
                        manifest: {
                            pluginId: string;
                            version: string;
                            admin?: {
                                remoteEntry: string;
                            }
                        }
                    }) => {
                        // In dev mode, use auto-calculated port; in prod, use manifest path
                        const remoteEntry = isDev
                            ? getPluginDevRemoteEntry(p.manifest.pluginId)
                            : p.manifest.admin!.remoteEntry;

                        return {
                            pluginId: p.manifest.pluginId,
                            version: p.manifest.version,
                            admin: {
                                enabled: true,
                                remoteEntry,
                                // Auto-generate MF module name from pluginId
                                moduleName: getPluginMfName(p.manifest.pluginId),
                            },
                        };
                    });

                console.log('[PluginUILoader] Plugins to load:', manifestsWithAdmin);


                if (manifestsWithAdmin.length > 0) {
                    const results = await loadPlugins(manifestsWithAdmin);

                    const successfulPlugins = results
                        .filter(r => r.success)
                        .map(r => r.pluginId);

                    const failedPlugins = results.filter(r => !r.success);
                    if (failedPlugins.length > 0) {
                        console.warn('Some plugins failed to load:', failedPlugins);
                    }

                    setState({
                        isLoading: false,
                        error: null,
                        loadedPlugins: successfulPlugins,
                    });
                } else {
                    setState({
                        isLoading: false,
                        error: null,
                        loadedPlugins: [],
                    });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                setState({
                    isLoading: false,
                    error: message,
                    loadedPlugins: [],
                });
            }
        };

        loadPluginUIs();

        // Cleanup loaded plugins on unmount
        return () => {
            for (const pluginId of state.loadedPlugins) {
                unloadPlugin(pluginId);
            }
        };
    }, [plugins, isQueryLoading]);

    // Show loading state
    if (isQueryLoading || state.isLoading) {
        return (
            <>
                {children}
            </>
        );
    }

    // Error is logged but doesn't block rendering
    if (state.error) {
        console.error('Plugin UI loading error:', state.error);
    }

    return <>{children}</>;
}

/**
 * Error Boundary for Plugin Components
 */
interface ErrorBoundaryProps {
    pluginId: string;
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class PluginErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`Plugin ${this.props.pluginId} crashed:`, error, errorInfo);
    }

    override render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                    <p className="text-destructive text-sm">
                        Plugin "{this.props.pluginId}" failed to load
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                        {this.state.error?.message}
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Hook to subscribe to extension changes
 */
export function useExtensions(): Extension[] {
    const [extensions, setExtensions] = useState<Extension[]>(() =>
        ExtensionRegistry.getAllExtensions()
    );

    useEffect(() => {
        return ExtensionRegistry.subscribe(setExtensions);
    }, []);

    return extensions;
}

/**
 * Plugin Component Wrapper - renders a plugin component with error boundary
 */
export function PluginComponent({
    pluginId,
    component: Component,
}: {
    pluginId: string;
    component: React.ComponentType;
}) {
    return (
        <PluginErrorBoundary pluginId={pluginId}>
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <Component />
            </Suspense>
        </PluginErrorBoundary>
    );
}
