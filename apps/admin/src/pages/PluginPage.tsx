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
import { usePlugins } from '../hooks/usePlugins';

function resolvePluginId(
    rawPluginId: string | undefined,
    candidates: string[],
): string | undefined {
    if (!rawPluginId) return rawPluginId;

    if (candidates.includes(rawPluginId)) {
        return rawPluginId;
    }

    const prefixed = `com.wordrhyme.${rawPluginId}`;
    if (candidates.includes(prefixed)) {
        return prefixed;
    }

    const normalized = rawPluginId.replace(/\./g, '-');
    const matches = new Set<string>();
    for (const candidateId of candidates) {
        const candidate = candidateId
            .replace(/^com\.wordrhyme\./, '')
            .replace(/\./g, '-');
        if (candidate === normalized) {
            matches.add(candidateId);
        }
    }

    if (matches.size === 1) {
        return Array.from(matches)[0];
    }

    return rawPluginId;
}

export function PluginPage() {
    const { pluginId, '*': subPath } = useParams<{ pluginId: string; '*': string }>();
    const entries = useSlotExtensions('nav.sidebar');
    const { plugins } = usePlugins();
    const entryPluginIds = useMemo(
        () => entries.map((entry) => entry.extension.pluginId),
        [entries],
    );
    const listPluginIds = useMemo(
        () => plugins.map((plugin) => plugin.id),
        [plugins],
    );
    const resolvedByEntries = useMemo(
        () => resolvePluginId(pluginId, entryPluginIds),
        [pluginId, entryPluginIds],
    );
    const resolvedByList = useMemo(
        () => resolvePluginId(pluginId, listPluginIds),
        [pluginId, listPluginIds],
    );
    const resolvedPluginId = resolvedByEntries ?? resolvedByList ?? pluginId;
    const pluginRecord = useMemo(
        () => plugins.find((plugin) => plugin.id === resolvedPluginId),
        [plugins, resolvedPluginId],
    );

    const matchedEntry = useMemo(() => {
        if (!pluginId) return null;

        const effectivePluginId = resolvedPluginId ?? pluginId;
        const pluginEntries = entries.filter(
            (e) => e.extension.pluginId === effectivePluginId
        );

        const currentPath = `/p/${pluginId}${subPath ? `/${subPath}` : ''}`;
        const resolvedPath = effectivePluginId !== pluginId
            ? `/p/${effectivePluginId}${subPath ? `/${subPath}` : ''}`
            : null;

        const exactMatch = pluginEntries.find(
            (e) => (e.target as NavTarget).path === currentPath
                || (resolvedPath && (e.target as NavTarget).path === resolvedPath)
        );
        if (exactMatch) return exactMatch;

        const rootMatch = pluginEntries.find(
            (e) => (e.target as NavTarget).path === `/p/${pluginId}`
                || (resolvedPath && (e.target as NavTarget).path === `/p/${effectivePluginId}`)
        );
        if (rootMatch) return rootMatch;

        return pluginEntries[0] ?? null;
    }, [pluginId, subPath, entries, resolvedPluginId]);

    const accessNotice = useMemo(() => {
        if (!pluginRecord) return null;

        if (pluginRecord.instanceStatus !== 'loaded') {
            const description = pluginRecord.instanceStatus === 'failed'
                ? '插件在当前平台实例加载失败，请联系平台管理员检查日志。'
                : pluginRecord.instanceStatus === 'installed'
                    ? '插件已安装但在当前平台实例被停用。'
                    : '插件在当前平台实例未安装。';
            return {
                title: '平台已禁用或不可用',
                description,
            };
        }

        if (pluginRecord.installationStatus !== 'installed') {
            return {
                title: '当前组织未安装',
                description: '该插件尚未在当前组织建立安装关系。',
            };
        }

        if (pluginRecord.activationStatus !== 'enabled') {
            return {
                title: '当前组织已停用',
                description: '该插件已被当前组织停用，启用后即可访问。',
            };
        }

        return null;
    }, [pluginRecord]);

    if (!pluginId) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">Plugin Not Found</h2>
                <p>No plugin ID specified in the URL.</p>
            </div>
        );
    }

    if (accessNotice) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <h2 className="text-xl font-semibold mb-2">{accessNotice.title}</h2>
                <p>{accessNotice.description}</p>
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
            <PluginErrorBoundary pluginId={resolvedPluginId ?? pluginId}>
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
