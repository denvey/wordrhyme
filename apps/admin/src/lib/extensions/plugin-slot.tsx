import React, { type ComponentType, Suspense } from 'react';
import { Skeleton } from '@wordrhyme/ui';
import { Button } from '@wordrhyme/ui';
import { useSlotExtensions } from './use-slot-extensions';
import type { SlotEntry } from './extension-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wordrhyme/ui';

// ─── Remote Component Cache ───

const remoteComponentCache = new Map<string, React.LazyExoticComponent<ComponentType<Record<string, unknown>>>>();

function getOrCreateRemoteComponent(remote: string) {
    let cached = remoteComponentCache.get(remote);
    if (!cached) {
        cached = React.lazy(async () => {
            const mfRuntime = await import('@module-federation/enhanced/runtime');
            const mod = await mfRuntime.loadRemote<{ default: ComponentType }>(remote);
            if (!mod?.default) throw new Error(`Remote ${remote} has no default export`);
            return mod as { default: ComponentType };
        });
        remoteComponentCache.set(remote, cached);
    }
    return cached;
}

export function clearRemoteComponentCache(pluginId?: string): void {
    if (!pluginId) {
        remoteComponentCache.clear();
        return;
    }
    for (const key of remoteComponentCache.keys()) {
        if (key.startsWith(pluginId.replace(/\./g, '_'))) {
            remoteComponentCache.delete(key);
        }
    }
}

// ─── Error Boundary ───

interface ErrorBoundaryProps {
    pluginId: string;
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class PluginErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    resetError = () => this.setState({ error: null });

    override render() {
        if (this.state.error) {
            return (
                <div className="p-4 border border-destructive/20 rounded-md text-sm">
                    <p className="text-muted-foreground">
                        Extension unavailable ({this.props.pluginId})
                    </p>
                    <Button variant="ghost" size="sm" onClick={this.resetError}>
                        Retry
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Remote Component Renderer ───

function RemoteComponent({ remote, ...props }: { remote: string } & Record<string, unknown>) {
    const Component = getOrCreateRemoteComponent(remote);
    return <Component {...props} />;
}

// ─── Entry Renderer ───

function SlotEntryRenderer({
    entry,
    context,
}: {
    entry: SlotEntry;
    context?: Record<string, unknown> | undefined;
}) {
    const { extension: ext } = entry;
    const Comp = ext.component;

    if (Comp) {
        return <Comp {...(context ?? {})} />;
    }

    if (ext.remoteComponent) {
        return <RemoteComponent remote={ext.remoteComponent} {...(context ?? {})} />;
    }

    return null;
}

// ─── PluginSlot ───

export interface PluginSlotProps {
    name: string;
    context?: Record<string, unknown>;
    layout?: 'inline' | 'stack' | 'tabs' | 'grid';
    className?: string;
    fallback?: React.ReactNode;
    renderItem?: (entry: SlotEntry, index: number) => React.ReactNode;
    permissionFilter?: (entry: SlotEntry) => boolean;
}

export function PluginSlot({
    name,
    context,
    layout = 'stack',
    className,
    fallback = null,
    renderItem,
    permissionFilter,
}: PluginSlotProps) {
    let entries = useSlotExtensions(name);

    if (permissionFilter) {
        entries = entries.filter(permissionFilter);
    }

    if (entries.length === 0) {
        return <>{fallback}</>;
    }

    const renderEntry = (entry: SlotEntry, index: number) => {
        if (renderItem) {
            return (
                <PluginErrorBoundary key={entry.extension.id} pluginId={entry.extension.pluginId}>
                    {renderItem(entry, index)}
                </PluginErrorBoundary>
            );
        }

        return (
            <PluginErrorBoundary key={entry.extension.id} pluginId={entry.extension.pluginId}>
                <Suspense fallback={<Skeleton className="h-16 w-full min-h-[64px]" />}>
                    <SlotEntryRenderer entry={entry} context={context} />
                </Suspense>
            </PluginErrorBoundary>
        );
    };

    if (layout === 'tabs') {
        return (
            <Tabs defaultValue={entries[0]?.extension.id ?? ''} className={className ?? undefined}>
                <TabsList>
                    {entries.map(entry => (
                        <TabsTrigger key={entry.extension.id} value={entry.extension.id}>
                            {entry.extension.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {entries.map((entry, index) => (
                    <TabsContent key={entry.extension.id} value={entry.extension.id}>
                        {renderEntry(entry, index)}
                    </TabsContent>
                ))}
            </Tabs>
        );
    }

    if (layout === 'grid') {
        return (
            <div
                className={className}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '1rem',
                }}
            >
                {entries.map((entry, index) => (
                    <div
                        key={entry.extension.id}
                        style={{
                            gridColumn: `span ${'colSpan' in entry.target ? entry.target.colSpan ?? 1 : 1}`,
                        }}
                    >
                        {renderEntry(entry, index)}
                    </div>
                ))}
            </div>
        );
    }

    if (layout === 'inline') {
        return (
            <div className={className} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {entries.map((entry, index) => renderEntry(entry, index))}
            </div>
        );
    }

    // layout === 'stack' (default)
    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {entries.map((entry, index) => renderEntry(entry, index))}
        </div>
    );
}
