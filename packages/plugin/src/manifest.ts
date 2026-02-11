import { z } from 'zod';

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
    type: z.enum(['backend', 'frontend', 'full']).default('full'),
    runtime: z.enum(['node']).default('node'),

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
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

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
