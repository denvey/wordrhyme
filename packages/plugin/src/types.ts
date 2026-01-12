/**
 * Plugin Context - Injected into plugin handlers
 *
 * All plugin code receives this context, which provides:
 * - Identity (pluginId, tenantId, userId)
 * - Capabilities (logger, db, permissions, queue, notifications, settings, files, assets, storage)
 * - Observability (metrics, trace)
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

    /** Queue capability (for async job processing) */
    queue?: PluginQueueCapability | undefined;

    /** Notification capability (for sending notifications) */
    notifications?: PluginNotificationCapability | undefined;

    /** Settings capability (for plugin configuration) */
    settings: PluginSettingsCapability;

    /** File capability (for file upload and management) */
    files?: PluginFileCapability | undefined;

    /** Asset capability (for CMS asset management) */
    assets?: PluginAssetCapability | undefined;

    /** Storage capability (for registering custom storage providers) */
    storage?: PluginStorageCapability | undefined;

    /** Metrics capability (for recording usage metrics) */
    metrics?: PluginMetricsCapability | undefined;

    /** Trace capability (for accessing trace context) */
    trace?: PluginTraceCapability | undefined;

    /** Hook capability (for registering hook handlers) */
    hooks?: PluginHookCapability | undefined;
}

/**
 * Plugin Permission Definition (CASL format)
 *
 * Defines a permission that a plugin registers for use in the CASL permission system.
 * Plugins use this to declare what permissions they provide.
 *
 * @example
 * // Simple permission (manage is default action)
 * { subject: 'settings' }
 *
 * // Permission with specific actions
 * { subject: 'analytics', actions: ['read', 'export'] }
 *
 * // Permission with field-level access
 * { subject: 'report', actions: ['read'], fields: ['summary', 'chart'] }
 */
export interface PluginPermissionDef {
    /** Subject name (will be prefixed with plugin:{pluginId}:) */
    subject: string;
    /** Actions supported (default: ['manage']) */
    actions?: string[];
    /** Field-level restrictions (default: null = all fields) */
    fields?: string[] | null;
    /** Human-readable description for Admin UI */
    description?: string;
}

/**
 * Plugin Logger - Scoped logging interface
 *
 * Per OBSERVABILITY_GOVERNANCE §3.3:
 * - info, warn, error: Always available
 * - debug: Optional, only available when explicitly enabled by tenant admin
 */
export interface PluginLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    /**
     * Debug logging - only available when debug mode is enabled by tenant admin.
     * Calls are silently ignored when debug mode is disabled.
     */
    debug?(message: string, meta?: Record<string, unknown>): void;
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

/**
 * Plugin Queue Capability - Async job processing
 *
 * All jobs are namespaced with plugin_{pluginId}_{jobName}
 * Subject to rate limits and payload size restrictions.
 */
export interface PluginQueueCapability {
    /**
     * Add a job to the queue
     * @param jobName - Job name (will be prefixed with plugin_{pluginId}_)
     * @param data - Job payload (must be JSON-serializable, max 64KB)
     * @param options - Job options
     */
    addJob<T = unknown>(
        jobName: string,
        data: T,
        options?: PluginJobOptions
    ): Promise<{ jobId: string }>;

    /**
     * Get job status
     * @param jobId - Job ID returned from addJob
     */
    getJobStatus(jobId: string): Promise<PluginJobStatus>;

    /**
     * Cancel a pending job
     * @param jobId - Job ID to cancel
     */
    cancelJob(jobId: string): Promise<boolean>;
}

/**
 * Plugin Job Options
 */
export interface PluginJobOptions {
    /** Job priority: 'low' | 'normal' | 'high' | 'critical' */
    priority?: 'low' | 'normal' | 'high' | 'critical';
    /** Delay in milliseconds before processing */
    delay?: number;
    /** Number of retry attempts on failure */
    attempts?: number;
    /** Backoff strategy for retries */
    backoff?: {
        type: 'fixed' | 'exponential';
        delay: number;
    };
    /** Remove job after completion */
    removeOnComplete?: boolean;
    /** Remove job after failure */
    removeOnFail?: boolean;
}

/**
 * Plugin Job Status
 */
export interface PluginJobStatus {
    id: string;
    name: string;
    state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
    progress?: number;
    returnValue?: unknown;
    failedReason?: string;
    timestamp: number;
    processedOn?: number;
    finishedOn?: number;
}

/**
 * Plugin Notification Capability - Send notifications
 *
 * Plugins can send notifications to users via Core's notification system.
 * All notifications are tagged with sourcePluginId.
 */
export interface PluginNotificationCapability {
    /**
     * Send a notification using a registered template
     * @param input - Notification input
     */
    send(input: PluginNotificationInput): Promise<PluginNotificationResult>;

    /**
     * Register a notification template
     * Templates are namespaced: plugin_{pluginId}_{templateKey}
     */
    registerTemplate(template: PluginNotificationTemplate): Promise<void>;

    /**
     * Register a notification channel
     * Channels are namespaced: plugin_{pluginId}_{channelKey}
     */
    registerChannel(channel: PluginNotificationChannel): Promise<void>;

    /**
     * Subscribe to notification.created events
     * Allows plugins to enhance notifications (e.g., send to external services)
     */
    onNotificationCreated(
        handler: (event: PluginNotificationEvent) => void | Promise<void>
    ): () => void;
}

/**
 * Plugin Notification Input
 */
export interface PluginNotificationInput {
    /** Target user ID */
    userId: string;
    /** Template key (will be prefixed with plugin_{pluginId}_ if not already) */
    templateKey: string;
    /** Variables for template interpolation */
    variables: Record<string, unknown>;
    /** Notification type */
    type?: 'info' | 'success' | 'warning' | 'error';
    /** Link to navigate when clicked */
    link?: string;
    /** Actor ID (who triggered the notification) */
    actorId?: string;
    /** Entity reference */
    entityId?: string;
    entityType?: string;
    /** Grouping key for bundling */
    groupKey?: string;
    /** Idempotency key to prevent duplicates */
    idempotencyKey?: string;
    /** Priority override */
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    /** Channel overrides */
    channels?: string[];
    /** Locale for i18n */
    locale?: string;
}

/**
 * Plugin Notification Result
 */
export interface PluginNotificationResult {
    notificationId: string;
    channels: string[];
    decisionTrace: Array<{
        channel: string;
        included: boolean;
        reason: string;
    }>;
}

/**
 * Plugin Notification Template
 */
export interface PluginNotificationTemplate {
    /** Template key (will be prefixed with plugin_{pluginId}_) */
    key: string;
    /** Display name */
    name: string;
    /** Description */
    description?: string;
    /** i18n title templates */
    title: Record<string, string>;
    /** i18n message templates */
    message: Record<string, string>;
    /** Variables that can be interpolated */
    variables?: string[];
    /** Default channels */
    defaultChannels?: string[];
    /** Default priority */
    priority?: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * Plugin Notification Channel
 */
export interface PluginNotificationChannel {
    /** Channel key (will be prefixed with plugin_{pluginId}_) */
    key: string;
    /** i18n display name */
    name: Record<string, string>;
    /** i18n description */
    description?: Record<string, string>;
    /** Icon name */
    icon?: string;
    /** User configuration schema (JSON Schema) */
    configSchema?: Record<string, unknown>;
}

/**
 * Plugin Notification Event (for onNotificationCreated)
 */
export interface PluginNotificationEvent {
    notification: {
        id: string;
        userId: string;
        tenantId: string;
        templateKey?: string;
        type: string;
        title: string;
        message: string;
        link?: string;
        priority: 'low' | 'normal' | 'high' | 'urgent';
        actorId?: string;
        entityId?: string;
        entityType?: string;
        groupKey?: string;
        sourcePluginId?: string;
    };
    user: {
        id: string;
        email?: string;
        preferences: {
            enabledChannels: string[];
            emailFrequency: 'instant' | 'hourly' | 'daily';
        };
    };
    channels: string[];
}

/**
 * Plugin Settings Capability - Configuration management for plugins
 *
 * All settings are automatically scoped to the plugin's namespace:
 * - plugin_global: Plugin-wide settings (shared across all tenants)
 * - plugin_tenant: Per-tenant plugin settings
 *
 * Plugins cannot access Core settings or other plugins' settings.
 */
export interface PluginSettingsCapability {
    /**
     * Get a setting value
     * Resolution order: plugin_tenant → plugin_global → defaultValue
     *
     * @param key - Setting key (without plugin prefix)
     * @param defaultValue - Default value if not found
     * @returns The setting value or default
     */
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | null>;

    /**
     * Set a setting value
     *
     * @param key - Setting key (without plugin prefix)
     * @param value - Value to store
     * @param options - Additional options
     */
    set(key: string, value: unknown, options?: PluginSettingOptions): Promise<void>;

    /**
     * Delete a setting
     *
     * @param key - Setting key to delete
     * @param options - Scope options
     */
    delete(key: string, options?: { global?: boolean }): Promise<boolean>;

    /**
     * List all settings for the plugin
     *
     * @param options - Filter options
     * @returns Array of settings
     */
    list(options?: {
        global?: boolean;
        keyPrefix?: string;
    }): Promise<PluginSettingEntry[]>;

    /**
     * Check if a feature flag is enabled for the current context
     *
     * @param flagKey - Feature flag key
     * @returns true if enabled, false otherwise
     */
    isFeatureEnabled(flagKey: string): Promise<boolean>;
}

/**
 * Plugin Setting Options
 */
export interface PluginSettingOptions {
    /** Store as global (plugin_global) instead of tenant-scoped (plugin_tenant) */
    global?: boolean;
    /** Encrypt the value (for sensitive data like API keys) */
    encrypted?: boolean;
    /** Description for admin UI */
    description?: string;
}

/**
 * Plugin Setting Entry (for list operation)
 */
export interface PluginSettingEntry {
    key: string;
    value: unknown;
    scope: 'plugin_global' | 'plugin_tenant';
    encrypted: boolean;
    description?: string | undefined;
}

// ============================================================================
// File/Asset/Storage Capabilities
// ============================================================================

/**
 * Plugin File Capability - File upload and management
 *
 * Provides plugins with the ability to upload, download, and manage files.
 * All operations are scoped to the current tenant.
 */
export interface PluginFileCapability {
    /**
     * Upload a file
     * @param input - File upload input
     * @returns Uploaded file info
     */
    upload(input: PluginFileUploadInput): Promise<PluginFileInfo>;

    /**
     * Get file info by ID
     * @param fileId - File ID
     * @returns File info or null if not found
     */
    get(fileId: string): Promise<PluginFileInfo | null>;

    /**
     * Download file content
     * @param fileId - File ID
     * @returns File content as Buffer
     */
    download(fileId: string): Promise<Buffer>;

    /**
     * Get signed URL for file access
     * @param fileId - File ID
     * @param options - URL options
     * @returns Signed URL with expiration
     */
    getSignedUrl(
        fileId: string,
        options?: { expiresIn?: number }
    ): Promise<{ url: string; expiresIn: number }>;

    /**
     * Delete a file (soft delete)
     * @param fileId - File ID
     */
    delete(fileId: string): Promise<void>;

    /**
     * List files with filtering
     * @param query - Query options
     */
    list(query?: PluginFileQuery): Promise<PluginPaginatedResult<PluginFileInfo>>;
}

/**
 * Plugin File Upload Input
 */
export interface PluginFileUploadInput {
    /** File content */
    content: Buffer;
    /** Original filename */
    filename: string;
    /** MIME type */
    mimeType: string;
    /** Is publicly accessible */
    isPublic?: boolean;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Plugin File Info
 */
export interface PluginFileInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Plugin File Query
 */
export interface PluginFileQuery {
    /** Search in filename */
    search?: string;
    /** Filter by MIME type or category (e.g., 'image/*') */
    mimeType?: string;
    /** Page number */
    page?: number;
    /** Page size */
    pageSize?: number;
}

/**
 * Plugin Asset Capability - CMS asset management
 *
 * Provides plugins with the ability to manage media assets with
 * metadata, tags, folders, and image variants.
 */
export interface PluginAssetCapability {
    /**
     * Create an asset from a file
     * @param fileId - Source file ID
     * @param options - Asset options
     */
    create(fileId: string, options?: PluginAssetCreateOptions): Promise<PluginAssetInfo>;

    /**
     * Get asset by ID
     * @param assetId - Asset ID
     */
    get(assetId: string): Promise<PluginAssetInfo | null>;

    /**
     * Update asset metadata
     * @param assetId - Asset ID
     * @param data - Update data
     */
    update(assetId: string, data: PluginAssetUpdateData): Promise<PluginAssetInfo>;

    /**
     * Delete an asset (soft delete)
     * @param assetId - Asset ID
     */
    delete(assetId: string): Promise<void>;

    /**
     * List assets with filtering and pagination
     * @param query - Query options
     */
    list(query?: PluginAssetQuery): Promise<PluginPaginatedResult<PluginAssetInfo>>;

    /**
     * Get URL for an asset variant
     * @param assetId - Asset ID
     * @param variant - Variant name (e.g., 'thumbnail', 'medium')
     */
    getVariantUrl(assetId: string, variant: string): Promise<string>;

    /**
     * Get all variants for an asset
     * @param assetId - Asset ID
     */
    getVariants(assetId: string): Promise<PluginAssetVariant[]>;
}

/**
 * Plugin Asset Create Options
 */
export interface PluginAssetCreateOptions {
    /** Asset type override */
    type?: 'image' | 'video' | 'document' | 'other';
    /** Alt text for accessibility */
    alt?: string;
    /** Title */
    title?: string;
    /** Tags for organization */
    tags?: string[];
    /** Folder path */
    folderPath?: string;
}

/**
 * Plugin Asset Update Data
 */
export interface PluginAssetUpdateData {
    alt?: string;
    title?: string;
    tags?: string[];
    folderPath?: string;
}

/**
 * Plugin Asset Info
 */
export interface PluginAssetInfo {
    id: string;
    fileId: string;
    type: 'image' | 'video' | 'document' | 'other';
    alt?: string;
    title?: string;
    tags: string[];
    folderPath?: string;
    width?: number;
    height?: number;
    format?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Plugin Asset Variant
 */
export interface PluginAssetVariant {
    name: string;
    fileId: string;
    width: number;
    height: number;
    format: string;
}

/**
 * Plugin Asset Query
 */
export interface PluginAssetQuery {
    /** Asset type filter */
    type?: 'image' | 'video' | 'document' | 'other';
    /** Tag filter */
    tags?: string[];
    /** Folder path filter (prefix match) */
    folderPath?: string;
    /** Search in alt/title */
    search?: string;
    /** Sort field */
    sortBy?: 'createdAt' | 'updatedAt' | 'title';
    /** Sort order */
    sortOrder?: 'asc' | 'desc';
    /** Page number */
    page?: number;
    /** Page size */
    pageSize?: number;
}

/**
 * Plugin Storage Capability - Custom storage provider registration
 *
 * Allows plugins to register custom storage providers (e.g., S3, OSS, R2).
 * Providers registered by plugins are automatically namespaced with plugin ID.
 */
export interface PluginStorageCapability {
    /**
     * Register a custom storage provider
     * The provider type will be prefixed: plugin_{pluginId}_{type}
     * @param config - Provider configuration
     */
    registerProvider(config: PluginStorageProviderConfig): Promise<void>;

    /**
     * List registered storage providers by this plugin
     */
    listProviders(): Promise<PluginStorageProviderInfo[]>;

    /**
     * Unregister a storage provider
     * @param type - Provider type (without plugin prefix)
     */
    unregisterProvider(type: string): Promise<void>;
}

/**
 * Plugin Storage Provider Config
 */
export interface PluginStorageProviderConfig {
    /** Provider type (will be prefixed with plugin_{pluginId}_) */
    type: string;
    /** Display name for admin UI */
    name: string;
    /** Description */
    description?: string;
    /** Configuration schema (JSON Schema) */
    configSchema: Record<string, unknown>;
    /** Provider factory function */
    factory: (config: Record<string, unknown>) => PluginStorageProvider;
}

/**
 * Plugin Storage Provider Info
 */
export interface PluginStorageProviderInfo {
    type: string;
    name: string;
    description?: string;
    pluginId: string;
}

/**
 * Plugin Storage Provider Interface
 * Plugins implementing custom storage must implement this interface.
 */
export interface PluginStorageProvider {
    /** Provider type identifier */
    readonly type: string;

    /** Upload a file */
    upload(input: PluginStorageUploadInput): Promise<PluginStorageUploadResult>;

    /** Download file content */
    download(key: string): Promise<Buffer>;

    /** Delete a file */
    delete(key: string): Promise<void>;

    /** Check if file exists */
    exists(key: string): Promise<boolean>;

    /** Get signed URL */
    getSignedUrl(
        key: string,
        options: { expiresIn: number; operation: 'get' | 'put'; contentType?: string }
    ): Promise<string>;

    /** Initiate multipart upload */
    initiateMultipartUpload(key: string): Promise<string>;

    /** Upload a part */
    uploadPart(
        uploadId: string,
        partNumber: number,
        body: Buffer
    ): Promise<{ partNumber: number; etag: string }>;

    /** Complete multipart upload */
    completeMultipartUpload(
        uploadId: string,
        parts: Array<{ partNumber: number; etag: string }>
    ): Promise<void>;

    /** Abort multipart upload */
    abortMultipartUpload(uploadId: string): Promise<void>;
}

/**
 * Plugin Storage Upload Input
 */
export interface PluginStorageUploadInput {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
}

/**
 * Plugin Storage Upload Result
 */
export interface PluginStorageUploadResult {
    key: string;
    size: number;
    etag?: string;
}

/**
 * Generic paginated result
 */
export interface PluginPaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ============================================================================
// Observability Capabilities
// ============================================================================

/**
 * Allowed labels for plugin metrics
 *
 * Per OBSERVABILITY_GOVERNANCE §4.1:
 * Only these labels are allowed to prevent cardinality explosion
 */
export type PluginMetricsAllowedLabels = {
    model?: string;
    type?: string;
    status?: 'success' | 'failure';
};

/**
 * Plugin Metrics Capability - Usage metrics recording
 *
 * Per OBSERVABILITY_GOVERNANCE §4.1:
 * - Only increment() for discrete event counters
 * - No histogram/gauge/observe/set methods
 * - Labels are restricted to a whitelist
 */
export interface PluginMetricsCapability {
    /**
     * Increment a counter metric
     *
     * @param name - Metric name (will be prefixed with plugin_)
     * @param labels - Optional labels (whitelist enforced: model, type, status)
     * @param value - Increment value (default: 1)
     *
     * @example
     * ctx.metrics.increment('content_generated', { model: 'gpt-4', status: 'success' });
     */
    increment(name: string, labels?: PluginMetricsAllowedLabels, value?: number): void;
}

/**
 * Plugin Trace Capability - Read-only trace context access
 *
 * Per OBSERVABILITY_GOVERNANCE §5:
 * - Plugins can only read trace context
 * - Plugins cannot create spans or modify trace context
 */
export interface PluginTraceCapability {
    /**
     * Get the current trace ID (W3C format, 32 hex chars)
     * @returns The trace ID or undefined if not available
     */
    getTraceId(): string | undefined;

    /**
     * Get the current span ID (16 hex chars)
     * @returns The span ID or undefined if not available
     */
    getSpanId(): string | undefined;
}

// ============================================================================
// Hook Capabilities
// ============================================================================

/**
 * Hook Priority Enum
 * Controls execution order within a hook
 */
export enum HookPriority {
    EARLIEST = 0,      // System-level, plugins should not use
    EARLY = 25,        // Plugins needing early execution
    NORMAL = 50,       // Default priority
    LATE = 75,         // Plugins needing late execution
    LATEST = 100,      // Final execution (e.g., logging)
}

/**
 * Hook Handler Options
 */
export interface HookHandlerOptions {
    /** Handler priority (default: NORMAL) */
    priority?: HookPriority;
    /** Handler timeout in ms (default: 5000) */
    timeout?: number;
}

/**
 * Plugin Hook Capability - Register hook handlers
 *
 * Plugins can register handlers for Core-defined hooks to:
 * - Actions: Perform async side-effects (logging, notifications, external sync)
 * - Filters: Transform data in the pipeline (validation, enrichment, masking)
 *
 * Per EVENT_HOOK_GOVERNANCE (Frozen v1):
 * - Plugins CANNOT define new hooks (Core only)
 * - Plugins CANNOT block Core execution (except via HookAbortError in filters)
 * - Plugins CANNOT access other plugins' handlers
 */
export interface PluginHookCapability {
    /**
     * Register an action handler (async side-effect)
     *
     * Actions are executed in parallel after the main operation.
     * They cannot modify data or block the operation.
     *
     * @param hookId - The hook ID (e.g., 'user.afterLogin')
     * @param handler - Handler function
     * @param options - Handler options
     * @returns Unsubscribe function
     *
     * @example
     * ctx.hooks.addAction('user.afterLogin', async (data, ctx) => {
     *   await externalService.notifyLogin(data.userId);
     * });
     */
    addAction<T = unknown>(
        hookId: string,
        handler: (data: T, ctx: PluginContext) => void | Promise<void>,
        options?: HookHandlerOptions
    ): () => void;

    /**
     * Register a filter handler (data transformation)
     *
     * Filters are executed serially, each receiving the output of the previous.
     * They must return the (possibly modified) data.
     *
     * @param hookId - The hook ID (e.g., 'content.beforeCreate')
     * @param handler - Handler function that receives and returns data
     * @param options - Handler options
     * @returns Unsubscribe function
     *
     * @example
     * ctx.hooks.addFilter('content.beforeCreate', async (data, ctx) => {
     *   return { ...data, sanitizedTitle: sanitize(data.title) };
     * });
     *
     * @example
     * // Abort operation with HookAbortError
     * ctx.hooks.addFilter('content.beforeCreate', async (data, ctx) => {
     *   if (data.title.includes('forbidden')) {
     *     throw new HookAbortError('Content contains forbidden words');
     *   }
     *   return data;
     * });
     */
    addFilter<T = unknown>(
        hookId: string,
        handler: (data: T, ctx: PluginContext) => T | Promise<T>,
        options?: HookHandlerOptions
    ): () => void;

    /**
     * List all available hooks
     *
     * Returns the list of hook definitions that plugins can subscribe to.
     * Useful for discovery and validation.
     *
     * @returns Array of hook definitions
     */
    listHooks(): Promise<Array<{
        id: string;
        type: 'action' | 'filter';
        description: string;
    }>>;
}

/**
 * Hook Abort Error - Thrown by filters to block operations
 *
 * When a filter handler throws this error, the operation is aborted
 * and the error message is returned to the caller.
 */
export class HookAbortError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HookAbortError';
    }
}
