import React, { useEffect, useState, Suspense } from 'react';
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

export function PluginUILoader({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<LoadingState>({
        isLoading: true,
        error: null,
        loadedPlugins: [],
    });

    const { data: plugins, isLoading: isQueryLoading, error: queryError } = trpc.plugin.list.useQuery();

    useEffect(() => {
        if (isQueryLoading || !plugins) return;

        const controller = new AbortController();

        const loadPluginUIs = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            try {
                const isDev = import.meta.env.DEV;
                const createTimeoutSignal = (timeoutMs: number) => {
                    const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
                    if (timeout) {
                        return { signal: timeout(timeoutMs), cleanup: () => {} };
                    }
                    const probeController = new AbortController();
                    const timeoutId = window.setTimeout(() => probeController.abort(), timeoutMs);
                    return { signal: probeController.signal, cleanup: () => window.clearTimeout(timeoutId) };
                };

                const manifestsWithAdmin = plugins
                    .filter((p: {
                        status?: string;
                        effectiveStatus?: string;
                        manifest: { admin?: { remoteEntry?: string } };
                    }) => {
                        const effectiveStatus = p.effectiveStatus ?? p.status ?? 'enabled';
                        return effectiveStatus === 'enabled' && p.manifest.admin?.remoteEntry;
                    },
                    )
                    .map((p: {
                        manifest: {
                            pluginId: string;
                            version: string;
                            admin?: { remoteEntry: string };
                        };
                    }) => ({
                        pluginId: p.manifest.pluginId,
                        version: p.manifest.version,
                        manifestRemoteEntry: p.manifest.admin!.remoteEntry,
                    }));

                // Dev 模式：探测每个插件的 dev server 是否在线，不在线则回退到静态 bundle
                const resolvedManifests = await Promise.all(
                    manifestsWithAdmin.map(async (p) => {
                        let remoteEntry: string;
                        if (isDev) {
                            const devUrl = getPluginDevRemoteEntry(p.pluginId);
                            const { signal, cleanup } = createTimeoutSignal(1500);
                            try {
                                const res = await fetch(devUrl, {
                                    method: 'HEAD',
                                    signal,
                                });
                                if (res.ok) {
                                    remoteEntry = devUrl;
                                } else if (res.status === 405) {
                                    const getRes = await fetch(devUrl, {
                                        method: 'GET',
                                        signal,
                                    });
                                    remoteEntry = getRes.ok ? devUrl : p.manifestRemoteEntry;
                                } else {
                                    remoteEntry = p.manifestRemoteEntry;
                                }
                                if (remoteEntry !== devUrl) {
                                    console.log(`[Plugin] ${p.pluginId}: dev server 不在线，使用预构建静态文件`);
                                }
                            } catch {
                                remoteEntry = p.manifestRemoteEntry;
                                console.log(`[Plugin] ${p.pluginId}: dev server 不在线，使用预构建静态文件`);
                            } finally {
                                cleanup();
                            }
                        } else {
                            remoteEntry = p.manifestRemoteEntry;
                        }

                        return {
                            pluginId: p.pluginId,
                            version: p.version,
                            admin: {
                                enabled: true,
                                remoteEntry,
                                moduleName: getPluginMfName(p.pluginId),
                            },
                        };
                    }),
                );

                if (resolvedManifests.length > 0) {
                    const results = await loadPlugins(resolvedManifests, controller.signal);

                    if (controller.signal.aborted) return;

                    const successfulPlugins = results
                        .filter(r => r.success)
                        .map(r => r.pluginId);

                    const failedPlugins = results.filter(r => !r.success && r.error !== 'Aborted');
                    if (failedPlugins.length > 0) {
                        console.warn('Some plugins failed to load:', failedPlugins);
                    }

                    setState({
                        isLoading: false,
                        error: null,
                        loadedPlugins: successfulPlugins,
                    });
                } else {
                    setState({ isLoading: false, error: null, loadedPlugins: [] });
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                const message = error instanceof Error ? error.message : 'Unknown error';
                setState({ isLoading: false, error: message, loadedPlugins: [] });
            }
        };

        loadPluginUIs();

        // Cleanup: abort in-flight loads and unregister all loaded plugins
        return () => {
            controller.abort();
            // Use the current manifests reference for cleanup
            for (const p of plugins) {
                unloadPlugin(p.manifest.pluginId);
            }
        };
    }, [plugins, isQueryLoading]);

    if (isQueryLoading || state.isLoading) {
        return <>{children}</>;
    }

    if (state.error) {
        console.error('Plugin UI loading error:', state.error);
    }

    return <>{children}</>;
}

/**
 * Error Boundary for Plugin Components
 * @deprecated Use PluginErrorBoundary from lib/extensions/plugin-slot instead
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
 * @deprecated Use useSlotExtensions from lib/extensions/use-slot-extensions instead
 */
export function useExtensions(): Extension[] {
    const [extensions, setExtensions] = useState<Extension[]>(() =>
        ExtensionRegistry.getAllExtensions(),
    );

    useEffect(() => {
        const update = () => setExtensions(ExtensionRegistry.getAllExtensions());
        return ExtensionRegistry.subscribe(update);
    }, []);

    return extensions;
}

/**
 * Plugin Component Wrapper
 * @deprecated Use PluginSlot or manual rendering with useSlotExtensions instead
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
