/**
 * @wordrhyme/plugin - Plugin SDK for WordRhyme
 *
 * This package provides types and utilities for building WordRhyme plugins.
 */

// Types
export type {
    PluginContext,
    PluginLogger,
    PluginDatabaseCapability,
    PluginPermissionCapability,
    PluginPermissionDef,
    // Queue types
    PluginQueueCapability,
    PluginJobOptions,
    PluginJobStatus,
    // Notification types
    PluginNotificationCapability,
    PluginNotificationInput,
    PluginNotificationResult,
    PluginNotificationTemplate,
    PluginNotificationChannel,
    PluginNotificationEvent,
    PluginNotificationSendParams,
    PluginNotificationSendResult,
    PluginNotificationActor,
    PluginNotificationTarget,
    // Settings types
    PluginSettingsCapability,
    PluginSettingOptions,
    PluginSettingEntry,
    // Media types (unified)
    PluginMediaCapability,
    PluginMediaUploadInput,
    PluginMediaInfo,
    PluginMediaUpdateData,
    PluginMediaVariant,
    PluginMediaQuery,
    // File types (deprecated, use Media types)
    PluginFileCapability,
    PluginFileUploadInput,
    PluginFileInfo,
    PluginFileQuery,
    // Asset types (deprecated, use Media types)
    PluginAssetCapability,
    PluginAssetCreateOptions,
    PluginAssetUpdateData,
    PluginAssetInfo,
    PluginAssetVariant,
    PluginAssetQuery,
    // Storage types
    PluginStorageCapability,
    PluginStorageProviderConfig,
    PluginStorageProviderInfo,
    PluginStorageProvider,
    PluginStorageUploadInput,
    PluginStorageUploadResult,
    // Generic types
    PluginPaginatedResult,
    // Observability types
    PluginMetricsAllowedLabels,
    PluginMetricsCapability,
    PluginTraceCapability,
    // Hook types
    PluginHookCapability,
    HookHandlerOptions,
    // Usage/billing types
    PluginUsageCapability,
} from './types';
export { HookPriority, HookAbortError } from './types';
export type { PluginManifest, PluginStatus, PluginCapabilities, PluginNotificationType, AggregationStrategy } from './manifest';

// Schemas (for validation)
export {
    pluginManifestSchema,
    adminExtensionSchema,
    targetSchema,
    navTargetSchema,
    settingsTargetSchema,
    dashboardTargetSchema,
} from './manifest';

// tRPC builders — server-only, import from '@wordrhyme/plugin/server'
// Do NOT re-export here to keep this barrel browser-safe.

// Utilities
export { definePlugin } from './define-plugin';

// Runtime helpers
export { createLogger, checkPermission, requirePermission, hasCapability } from './helpers';

// Dev utilities (for build configs)
export { getPluginDevPort, getPluginDevRemoteEntry, getPluginMfName } from './dev-utils';

// Extension helpers (for plugin admin UI)
export { navExtension, settingsExtension, dashboardExtension, multiSlotExtension } from './extension-helpers';
export type { UIExtensionDef, Target, NavTarget, SettingsTarget, DashboardTarget, GenericTarget, SlotContext } from './extension-helpers';
