import { z } from 'zod';

// ========== Notification Schema Components ==========

/**
 * Aggregation Strategy - how to group notifications from plugins
 */
export const aggregationStrategySchema = z.enum(['none', 'by_target', 'by_actor', 'by_type']);
export type AggregationStrategy = z.infer<typeof aggregationStrategySchema>;

/**
 * Notification Category - determines retention policy and view strategy
 */
export const notificationCategorySchema = z.enum(['system', 'collaboration', 'social']);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/**
 * Plugin Notification Type - declares a type of notification the plugin can send
 */
export const notificationTypeSchema = z.object({
    id: z.string().min(1).regex(/^[a-z0-9_]+$/, 'type id must be lowercase alphanumeric with underscores'),
    category: notificationCategorySchema,
    aggregation: aggregationStrategySchema.default('none'),
    i18n: z.record(
        z.string(), // locale key (e.g., 'en-US', 'zh-CN')
        z.object({
            title: z.string().min(1),
            description: z.string().optional(),
        })
    ),
});
export type PluginNotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * Notification Webhooks - async callbacks for notification events
 */
export const notificationWebhooksSchema = z.object({
    onClicked: z.string().url().optional(),
    onArchived: z.string().url().optional(),
}).optional();

/**
 * Notification Rate Limit - plugin-declared limits (platform may enforce lower)
 */
export const notificationRateLimitSchema = z.object({
    maxPerMinute: z.number().int().positive().max(10000).default(100),
    maxPerHour: z.number().int().positive().max(20000).default(1000),
    maxPerDay: z.number().int().positive().max(100000).default(10000),
}).partial();

/**
 * Notification Permission Types
 */
export const notificationPermissionSchema = z.enum([
    'notification:send',
    'notification:send:batch',
    'notification:read:own',
]);

/**
 * Plugin Notifications Configuration
 */
export const notificationsConfigSchema = z.object({
    types: z.array(notificationTypeSchema).min(1),
    permissions: z.array(notificationPermissionSchema).optional(),
    rateLimit: notificationRateLimitSchema.optional(),
    webhooks: notificationWebhooksSchema,
}).optional();

// ========== Main Plugin Manifest Schema ==========

/**
 * Plugin Manifest Schema - Validated at plugin load time
 *
 * This is the authoritative schema for manifest.json files.
 */
export const pluginManifestSchema = z.object({
    // === Identity ===
    pluginId: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'pluginId must be reverse-domain format (e.g., com.vendor.plugin-name)'),
    version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver format'),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    vendor: z.string().min(1).max(100),

    // === Runtime ===
    runtime: z.enum(['node']).default('node'),

    // Note: surfaces is auto-generated from server/admin/web presence
    // Used by plugin marketplace for filtering

    // === Compatibility ===
    engines: z.object({
        wordrhyme: z.string(), // semver range, e.g., "^0.1.0"
        node: z.string().optional(), // e.g., ">=20.0.0"
    }),

    // === Capabilities Declared ===
    capabilities: z.object({
        ui: z.object({
            adminPage: z.boolean().optional(),
            webPage: z.boolean().optional(),
            settingsTab: z.boolean().optional(),
        }).optional(),
        data: z.object({
            read: z.boolean().optional(),
            write: z.boolean().optional(),
            rawSql: z.boolean().optional(),
        }).optional(),
        provides: z.array(z.string()).optional(), // e.g., ["logger-adapter", "cache-adapter"]
    }).optional(),

    // === Exports ===
    exports: z.object({
        loggerAdapter: z.string().optional(), // e.g., "./dist/logger-adapter.js"
        cacheAdapter: z.string().optional(),
    }).optional(),

    // === Permissions Defined ===
    permissions: z.object({
        definitions: z.array(z.object({
            key: z.string().regex(/^[a-z0-9_.]+$/, 'Permission key must be lowercase with dots/underscores'),
            description: z.string().optional(),
        })).optional(),
        required: z.array(z.string()).optional(),
    }).optional(),

    // === Server Entry ===
    server: z.object({
        entry: z.string(), // e.g., "./dist/server/index.js"
        router: z.boolean().optional(), // Exports tRPC router
        nestModule: z.string().optional(), // NestJS module for advanced plugins, e.g., "./dist/server/hello.module.js"
        hooks: z.array(z.enum(['onInstall', 'onEnable', 'onDisable', 'onUninstall'])).optional(),
    }).optional(),

    // === Admin UI Entry ===
    admin: z.object({
        remoteEntry: z.string(), // e.g., "./dist/admin/remoteEntry.js"
        devRemoteEntry: z.string().optional(), // Dev mode: e.g., "http://localhost:3010/remoteEntry.js"
        moduleName: z.string().optional(), // MF2.0 module name
        exposes: z.record(z.string()).optional(),
        menus: z.array(z.object({
            label: z.string(),
            icon: z.string().optional(),
            path: z.string(),
            order: z.number().optional(),
            parentId: z.string().optional(),
            requiredPermission: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
        })).optional(),
    }).optional(),

    // === Web UI Entry ===
    web: z.object({
        entry: z.string().optional(),
        routes: z.array(z.object({
            path: z.string(),
            component: z.string(),
        })).optional(),
        components: z.array(z.string()).optional(),
    }).optional(),

    // === Dependencies ===
    dependencies: z.array(z.string()).optional(), // Other plugin IDs
    conflicts: z.array(z.string()).optional(), // Conflicting plugin IDs
    peerDependencies: z.record(z.string()).optional(), // e.g., { react: "^18.0.0" }
    compatibilityMode: z.enum(['strict', 'lenient', 'fallback']).optional(),

    // === Data Retention ===
    dataRetention: z.object({
        onDisable: z.enum(['retain']).optional(),
        onUninstall: z.enum(['delete', 'archive', 'retain']).optional(),
        tables: z.array(z.string()).optional(),
    }).optional(),

    // === Notifications ===
    notifications: notificationsConfigSchema,
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/**
 * Plugin Surface Type - Auto-generated from manifest configuration
 *
 * Indicates on which surfaces this plugin runs:
 * - 'server': Has server-side logic (backend API, database, queue jobs, etc.)
 * - 'admin': Has admin UI components (management dashboard)
 * - 'web': Has frontend/customer-facing UI (public website, user portal)
 */
export type PluginSurface = 'server' | 'admin' | 'web';

/**
 * Get plugin surfaces from manifest
 *
 * Auto-generates surfaces array based on which sections are present.
 * Used by plugin marketplace for filtering and display.
 *
 * @param manifest - Plugin manifest
 * @returns Array of surfaces, e.g., ['server', 'admin']
 *
 * @example
 * // Full-stack plugin
 * getPluginSurfaces(manifest) // ['server', 'admin', 'web']
 *
 * // Backend-only plugin (e.g., LBAC, payment gateway)
 * getPluginSurfaces(manifest) // ['server']
 *
 * // Frontend-only plugin (e.g., theme, widget)
 * getPluginSurfaces(manifest) // ['admin', 'web']
 */
export function getPluginSurfaces(manifest: PluginManifest): PluginSurface[] {
    const surfaces: PluginSurface[] = [];

    if (manifest.server) {
        surfaces.push('server');
    }

    if (manifest.admin) {
        surfaces.push('admin');
    }

    if (manifest.web) {
        surfaces.push('web');
    }

    return surfaces;
}

/**
 * Check if plugin has specific surface
 *
 * @param manifest - Plugin manifest
 * @param surface - Surface to check
 * @returns true if plugin has this surface
 */
export function hasSurface(manifest: PluginManifest, surface: PluginSurface): boolean {
    return getPluginSurfaces(manifest).includes(surface);
}

/**
 * Get plugin type for backwards compatibility
 *
 * @deprecated Use getPluginSurfaces() instead for more granular control
 * @param manifest - Plugin manifest
 * @returns Plugin type classification
 */
export function getPluginType(manifest: PluginManifest): 'backend' | 'frontend' | 'full' {
    const surfaces = getPluginSurfaces(manifest);
    const hasServer = surfaces.includes('server');
    const hasUI = surfaces.includes('admin') || surfaces.includes('web');

    if (hasServer && hasUI) return 'full';
    if (hasServer) return 'backend';
    return 'frontend';
}

/**
 * Plugin Status - Runtime state of a plugin
 */
export type PluginStatus = 'enabled' | 'disabled' | 'crashed' | 'invalid' | 'archived' | 'uninstalled';

/**
 * Plugin Capabilities - What the plugin declared it needs
 */
export interface PluginCapabilities {
    ui?: {
        adminPage?: boolean;
        webPage?: boolean;
        settingsTab?: boolean;
    };
    data?: {
        read?: boolean;
        write?: boolean;
        rawSql?: boolean;
    };
}
