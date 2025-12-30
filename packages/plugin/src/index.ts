/**
 * @wordrhyme/plugin - Plugin SDK for WordRhyme
 *
 * This package provides types and utilities for building WordRhyme plugins.
 */

// Types
export type { PluginContext, PluginLogger, PluginDatabaseCapability, PluginPermissionCapability } from './types';
export type { PluginManifest, PluginStatus, PluginCapabilities } from './manifest';

// Schemas (for validation)
export { pluginManifestSchema } from './manifest';

// tRPC builders (re-exported from ./trpc.ts)
export { pluginRouter, pluginProcedure, createPluginContext } from './trpc';

// Utilities
export { definePlugin } from './define-plugin';

// Runtime helpers
export { createLogger, checkPermission, requirePermission, hasCapability } from './helpers';

// Dev utilities (for build configs)
export { getPluginDevPort, getPluginDevRemoteEntry, getPluginMfName } from './dev-utils';
