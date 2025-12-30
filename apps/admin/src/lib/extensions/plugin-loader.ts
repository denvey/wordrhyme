/**
 * Plugin Loader
 *
 * Dynamically loads plugin UI modules via Module Federation 2.0.
 * Handles error recovery, timeouts, and extension registration.
 */
import { ExtensionRegistry } from './extension-registry';
import type { PluginRemoteModule } from './extension-types';

/** Plugin manifest from server */
interface PluginManifest {
    pluginId: string;
    version: string;
    admin?: {
        enabled: boolean;
        remoteEntry: string;
        moduleName: string;
    };
}

/** Load result */
interface LoadResult {
    pluginId: string;
    success: boolean;
    error?: string;
    extensionCount?: number;
}

/** Default load timeout (10 seconds) */
const DEFAULT_TIMEOUT_MS = 10000;

/** Track if MF runtime has been initialized */
let mfInitialized = false;

/** Track initialized remotes */
const initializedRemotes = new Set<string>();

/** Track already loaded plugins to prevent duplicate loading */
const loadedPlugins = new Set<string>();


/**
 * Load a plugin's Admin UI module via Module Federation
 */
export async function loadPluginModule(
    manifest: PluginManifest,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<LoadResult> {
    const { pluginId } = manifest;

    // Skip if already loaded
    if (loadedPlugins.has(pluginId)) {
        console.log(`[Plugin] Plugin ${pluginId} already loaded, skipping...`);
        return {
            pluginId,
            success: true,
            extensionCount: 0,
        };
    }

    if (!manifest.admin?.enabled || !manifest.admin?.remoteEntry) {
        return {
            pluginId: manifest.pluginId,
            success: false,
            error: 'Plugin does not have an admin UI',
        };
    }

    const { remoteEntry, moduleName } = manifest.admin;

    try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Plugin load timeout')), timeoutMs);
        });

        // Load the remote entry script
        const loadPromise = loadRemoteModule(remoteEntry, moduleName, pluginId);
        const module = await Promise.race([loadPromise, timeoutPromise]) as PluginRemoteModule;

        // Initialize the plugin if it has an init function
        if (module.init) {
            await module.init();
        }

        // Register extensions
        if (module.extensions && module.extensions.length > 0) {
            ExtensionRegistry.registerAll(module.extensions);
            console.log(`[Plugin] Registered ${module.extensions.length} extensions for ${pluginId}`);
        }

        // Mark plugin as loaded to prevent duplicate loading
        loadedPlugins.add(pluginId);

        return {
            pluginId,
            success: true,
            extensionCount: module.extensions?.length ?? 0,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to load plugin ${pluginId}:`, error);

        return {
            pluginId,
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Construct the full URL for a plugin's remoteEntry
 * 
 * Plugin directory structure:
 *   plugins/hello-world/dist/admin/remoteEntry.js
 * 
 * URL served by server:
 *   /plugins/hello-world/dist/admin/remoteEntry.js
 * 
 * In dev mode, remoteEntry may be an absolute URL (e.g., http://localhost:3002/remoteEntry.js)
 */
function getRemoteEntryUrl(remoteEntry: string, pluginId: string): string {
    // If already an absolute URL (dev mode), return as-is
    if (remoteEntry.startsWith('http://') || remoteEntry.startsWith('https://')) {
        return remoteEntry;
    }

    // remoteEntry from manifest is like "./dist/admin/remoteEntry.js"
    // We need to convert to: /plugins/{dirName}/dist/admin/remoteEntry.js
    // The directory name is typically the last part of pluginId (e.g., hello-world from com.wordrhyme.hello-world)
    const dirName = pluginId.split('.').pop() || pluginId;
    const relativePath = remoteEntry.replace(/^\.\//, '');

    // Use window location origin in browser, fallback for SSR
    const serverUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';
    return `${serverUrl}/plugins/${dirName}/${relativePath}`;
}

/**
 * Load remote module using Module Federation runtime API
 */
async function loadRemoteModule(
    remoteEntry: string,
    moduleName: string,
    pluginId: string
): Promise<PluginRemoteModule> {
    // Module Federation 2.0 dynamic loading
    const mfRuntime = await import('@module-federation/enhanced/runtime');

    // Remote name derived from module name (already should be underscore format)
    const remoteName = moduleName.replace(/[.-]/g, '_');
    const remoteUrl = getRemoteEntryUrl(remoteEntry, pluginId);

    console.log(`[Plugin] Loading remote: ${remoteName} from ${remoteUrl}`);

    // Initialize MF runtime once, then use registerRemotes for additional remotes
    if (!mfInitialized) {
        mfRuntime.init({
            name: 'admin_host',
            remotes: [],
        });
        mfInitialized = true;
    }

    // Register this remote if not already registered
    if (!initializedRemotes.has(remoteName)) {
        console.log(`[Plugin] Registering remote: ${remoteName}`);
        mfRuntime.registerRemotes([
            {
                name: remoteName,
                entry: remoteUrl,
            },
        ]);
        initializedRemotes.add(remoteName);
    }

    // Load the remote module (exposed as /admin)
    const module = await mfRuntime.loadRemote<PluginRemoteModule>(`${remoteName}/admin`);

    if (!module) {
        throw new Error(`Failed to load remote module: ${remoteName}/admin`);
    }

    console.log(`[Plugin] Successfully loaded module:`, module);
    return module;
}

/**
 * Unload a plugin's UI extensions
 */
export function unloadPlugin(pluginId: string): number {
    loadedPlugins.delete(pluginId);
    return ExtensionRegistry.unregisterPlugin(pluginId);
}

/**
 * Load multiple plugins
 */
export async function loadPlugins(
    manifests: PluginManifest[]
): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    for (const manifest of manifests) {
        const result = await loadPluginModule(manifest);
        results.push(result);
    }

    return results;
}
