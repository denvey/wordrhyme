/**
 * @wordrhyme/plugin/client - Browser-safe exports for plugin admin UIs
 *
 * This entry point excludes server-only code (tRPC, Node.js APIs)
 * so it can be safely imported in browser/Module Federation contexts.
 */

// Extension helpers (for plugin admin UI)
export { navExtension, settingsExtension, dashboardExtension, multiSlotExtension } from './extension-helpers';
export type { UIExtensionDef, Target, NavTarget, SettingsTarget, DashboardTarget, GenericTarget, SlotContext } from './extension-helpers';

// Schemas (pure Zod, no server deps)
export {
    pluginManifestSchema,
    adminExtensionSchema,
    targetSchema,
    navTargetSchema,
    settingsTargetSchema,
    dashboardTargetSchema,
} from './manifest';

// Type-only exports (safe for browser - erased at compile time)
export type {
    PluginManifest,
    PluginStatus,
    PluginCapabilities,
    PluginNotificationType,
    AggregationStrategy,
} from './manifest';
