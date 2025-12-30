/**
 * Extensions Module
 *
 * Re-exports all extension-related types and utilities.
 */
export * from './extension-types';
export { ExtensionRegistry } from './extension-registry';
export { loadPluginModule, unloadPlugin, loadPlugins } from './plugin-loader';
