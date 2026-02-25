import { ExtensionRegistry } from './extension-registry';
import type { PluginRemoteModule, UIExtension } from './extension-types';

interface PluginManifest {
    pluginId: string;
    version: string;
    admin?: {
        enabled: boolean;
        remoteEntry: string;
        moduleName: string;
    };
}

interface LoadResult {
    pluginId: string;
    success: boolean;
    error?: string;
    extensionCount?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

let mfInitialized = false;
const initializedRemotes = new Set<string>();
const loadedPlugins = new Set<string>();

export async function loadPluginModule(
    manifest: PluginManifest,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    signal?: AbortSignal,
): Promise<LoadResult> {
    const { pluginId } = manifest;

    if (loadedPlugins.has(pluginId)) {
        return { pluginId, success: true, extensionCount: 0 };
    }

    if (!manifest.admin?.enabled || !manifest.admin?.remoteEntry) {
        return { pluginId, success: false, error: 'Plugin does not have an admin UI' };
    }

    if (signal?.aborted) {
        return { pluginId, success: false, error: 'Aborted' };
    }

    const { remoteEntry, moduleName } = manifest.admin;

    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Plugin load timeout')), timeoutMs);
        });

        const loadPromise = loadRemoteModule(remoteEntry, moduleName, pluginId);
        const module = await Promise.race([loadPromise, timeoutPromise]) as PluginRemoteModule;

        if (signal?.aborted) {
            return { pluginId, success: false, error: 'Aborted' };
        }

        if (module.init) {
            await module.init();
        }

        if (signal?.aborted) {
            return { pluginId, success: false, error: 'Aborted' };
        }

        if (module.extensions && module.extensions.length > 0) {
            const enriched: UIExtension[] = module.extensions.map(ext => ({
                ...ext,
                pluginId,
            }));
            ExtensionRegistry.registerAll(enriched);
            console.log(`[Plugin] Registered ${enriched.length} extensions for ${pluginId}`);
        }

        loadedPlugins.add(pluginId);

        return {
            pluginId,
            success: true,
            extensionCount: module.extensions?.length ?? 0,
        };
    } catch (error) {
        if (signal?.aborted) {
            return { pluginId, success: false, error: 'Aborted' };
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to load plugin ${pluginId}:`, error);
        return { pluginId, success: false, error: errorMessage };
    }
}

function getRemoteEntryUrl(remoteEntry: string, pluginId: string): string {
    if (remoteEntry.startsWith('http://') || remoteEntry.startsWith('https://')) {
        return remoteEntry;
    }

    const dirName = pluginId.split('.').pop() || pluginId;
    const relativePath = remoteEntry.replace(/^\.\//, '');

    const serverUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';
    return `${serverUrl}/plugins/${dirName}/${relativePath}`;
}

async function loadRemoteModule(
    remoteEntry: string,
    moduleName: string,
    pluginId: string,
): Promise<PluginRemoteModule> {
    const mfRuntime = await import('@module-federation/enhanced/runtime');

    const remoteName = moduleName.replace(/[.-]/g, '_');
    const remoteUrl = getRemoteEntryUrl(remoteEntry, pluginId);

    console.log(`[Plugin] Loading remote: ${remoteName} from ${remoteUrl}`);

    if (!mfInitialized) {
        mfRuntime.init({
            name: 'admin_host',
            remotes: [],
        });
        mfInitialized = true;
    }

    if (!initializedRemotes.has(remoteName)) {
        mfRuntime.registerRemotes([{ name: remoteName, entry: remoteUrl }]);
        initializedRemotes.add(remoteName);
    }

    const module = await mfRuntime.loadRemote<PluginRemoteModule>(`${remoteName}/admin`);

    if (!module) {
        throw new Error(`Failed to load remote module: ${remoteName}/admin`);
    }

    return module;
}

export function unloadPlugin(pluginId: string): number {
    loadedPlugins.delete(pluginId);
    return ExtensionRegistry.unregisterPlugin(pluginId);
}

export async function loadPlugins(
    manifests: PluginManifest[],
    signal?: AbortSignal,
): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    for (const manifest of manifests) {
        if (signal?.aborted) break;
        const result = await loadPluginModule(manifest, DEFAULT_TIMEOUT_MS, signal);
        results.push(result);
    }

    return results;
}
