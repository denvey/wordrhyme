/**
 * Plugin Development Utilities
 * 
 * Shared utilities for plugin development, including automatic port assignment.
 */

/**
 * Calculate a deterministic dev port for a plugin based on its ID.
 * 
 * This allows multiple plugins to run simultaneously without port conflicts,
 * while keeping the port assignment automatic and predictable.
 * 
 * Port range: 3010-3109 (100 possible ports)
 * 
 * @param pluginId - Full plugin ID (e.g., "com.wordrhyme.hello-world")
 * @returns Port number for the plugin's dev server
 * 
 * @example
 * getPluginDevPort('com.wordrhyme.hello-world')  // e.g., 3042
 * getPluginDevPort('com.wordrhyme.analytics')    // e.g., 3015
 */
export function getPluginDevPort(pluginId: string): number {
    const BASE_PORT = 3010;
    const PORT_RANGE = 100;

    // Simple hash based on character codes
    const hash = pluginId.split('').reduce((acc, char) => {
        return acc + char.charCodeAt(0);
    }, 0);

    return BASE_PORT + (hash % PORT_RANGE);
}

/**
 * Get the dev remote entry URL for a plugin.
 * 
 * @param pluginId - Full plugin ID
 * @returns Full URL to the plugin's remoteEntry.js in dev mode
 */
export function getPluginDevRemoteEntry(pluginId: string): string {
    const port = getPluginDevPort(pluginId);
    return `http://localhost:${port}/remoteEntry.js`;
}

/**
 * Normalize plugin ID to a valid Module Federation name.
 * 
 * MF names must be valid JavaScript identifiers.
 * "com.wordrhyme.hello-world" → "plugin_hello_world"
 * 
 * @param pluginId - Full plugin ID
 * @returns Valid MF module name
 */
export function getPluginMfName(pluginId: string): string {
    // Extract the last segment and convert to underscore format
    const shortId = pluginId.replace(/^com\.wordrhyme\./, '');
    return `plugin_${shortId.replace(/-/g, '_')}`;
}
