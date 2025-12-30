/**
 * Plugin Context - Injected into plugin handlers
 *
 * All plugin code receives this context, which provides:
 * - Identity (pluginId, tenantId, userId)
 * - Capabilities (logger, db, permissions)
 */
export interface PluginContext {
    /** Plugin ID from manifest */
    pluginId: string;

    /** Current tenant/organization ID (from request context) */
    tenantId?: string | undefined;

    /** Current user ID (from request context) */
    userId?: string | undefined;

    /** Scoped logger */
    logger: PluginLogger;

    /** Database capability (scoped to plugin's private tables) */
    db?: PluginDatabaseCapability | undefined;

    /** Permission capability */
    permissions: PluginPermissionCapability;
}

/**
 * Plugin Logger - Scoped logging interface
 */
export interface PluginLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Plugin Permission Capability - Permission checking interface
 *
 * All permission checks are scoped to:
 * - Permissions declared in the plugin manifest
 * - Permissions granted to the current user
 */
export interface PluginPermissionCapability {
    /**
     * Check if current user has a capability
     * @param capability - Capability in format `resource:action:scope`
     * @returns true if allowed, false if denied
     */
    can(capability: string): Promise<boolean>;

    /**
     * Require a capability - throws if denied
     * @param capability - Capability to require
     * @throws PermissionDeniedError if permission denied
     */
    require(capability: string): Promise<void>;

    /**
     * Check if plugin has access to a capability
     * (Plugin must have declared this capability in manifest)
     * @param capability - Capability to check
     */
    hasDeclared(capability: string): boolean;
}

/**
 * Plugin Database Capability - Scoped database access
 *
 * All operations are automatically scoped to:
 * - Plugin's private tables (prefixed with plugin_{pluginId}_)
 * - Current tenant (tenantId filter)
 */
export interface PluginDatabaseCapability {
    /**
     * Query plugin private table
     * @param options.table - Short table name (e.g., 'events', NOT 'plugin_xxx_events')
     */
    query<T>(options: {
        table: string;
        where?: Record<string, unknown>;
        limit?: number;
        offset?: number;
    }): Promise<T[]>;

    /**
     * Insert data into plugin private table
     */
    insert<T>(options: {
        table: string;
        data: T | T[];
    }): Promise<void>;

    /**
     * Update plugin private table
     */
    update<T>(options: {
        table: string;
        where: Record<string, unknown>;
        data: Partial<T>;
    }): Promise<void>;

    /**
     * Delete from plugin private table
     */
    delete(options: {
        table: string;
        where: Record<string, unknown>;
    }): Promise<void>;

    /**
     * Execute raw SQL (requires explicit permission in manifest)
     */
    raw<T>(sql: string, params?: unknown[]): Promise<T>;

    /**
     * Transaction support
     */
    transaction<T>(callback: (tx: PluginDatabaseCapability) => Promise<T>): Promise<T>;
}

