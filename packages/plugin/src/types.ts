/**
 * Plugin Context - Injected into plugin handlers
 *
 * All plugin code receives this context, which provides:
 * - Identity (pluginId, organizationId, userId)
 * - Capabilities (logger, db, permissions, queue, notifications, settings, media, storage)
 * - Observability (metrics, trace)
 */
export interface PluginContext {
    /** Plugin ID from manifest */
    pluginId: string;

    /** Current organization ID (from request context) */
    organizationId?: string | undefined;

    /** Current user ID (from request context) */
    userId?: string | undefined;

    /** Scoped logger */
    logger: PluginLogger;

    /**
     * Database capability (scoped to plugin's private tables)
     *
     * Runtime type: ScopedDb (Drizzle-compatible) with plugin table prefix isolation.
     * Supports both Drizzle SQL-like API (db.select().from(table)) and Query API (db.query.tableName).
     * Automatically enforces LBAC, tenant filtering, and plugin table prefix validation.
     *
     * @deprecated PluginDatabaseCapability (string-based API) — migrate to Drizzle API with pgTable definitions
     */
    db?: any;

    /** Permission capability */
    permissions: PluginPermissionCapability;

    /** Queue capability (for async job processing) */
    queue?: PluginQueueCapability | undefined;

    /** Notification capability (for sending notifications) */
    notifications?: PluginNotificationCapability | undefined;

    /** Settings capability (for plugin configuration) */
    settings: PluginSettingsCapability;

    /** Media capability (for unified file and asset management) */
    media?: PluginMediaCapability | undefined;

    /** Storage capability (for registering custom storage providers) */
    storage?: PluginStorageCapability | undefined;

    /** Metrics capability (for recording usage metrics) */
    metrics?: PluginMetricsCapability | undefined;

    /** Trace capability (for accessing trace context) */
    trace?: PluginTraceCapability | undefined;

    /** Hook capability (for registering hook handlers) */
    hooks?: PluginHookCapability | undefined;

    /** Usage capability (for explicit billing consumption in dynamic scenarios) */
    usage?: PluginUsageCapability | undefined;
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
     * Count rows in plugin private table
     * @param options.table - Short table name
     * @param options.where - Filter conditions (same as query)
     * @returns Row count matching conditions
     */
    count(options: {
        table: string;
        where?: Record<string, unknown>;
    }): Promise<number>;

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
 * Plugin Notification Capability - Send notifications (Unified Contract v2)
 *
 * Plugins can send notifications to users via Core's notification system.
 * All notifications are tagged with sourcePluginId and validated against manifest.
 *
 * Key features:
 * - Type validation: notification type must be declared in manifest
 * - Rate limiting: plugin-level and user-level limits enforced
 * - Aggregation: automatic grouping based on manifest-declared strategy
 * - Webhooks: async callbacks for click/archive events
 */
export interface PluginNotificationCapability {
    /**
     * Send a notification using the unified contract
     *
     * The notification type must be declared in the plugin's manifest.
     * Rate limits are enforced (plugin: 100/min, 1000/hr, 10000/day; user: 10/min, 50/hr).
     *
     * @param params - Notification parameters
     * @returns Promise resolving to notification ID
     * @throws PluginNotificationValidationError if type not declared in manifest
     * @throws RateLimitExceededError if rate limit exceeded
     * @throws PermissionDeniedError if notification:send not declared
     */
    send(params: PluginNotificationSendParams): Promise<PluginNotificationSendResult>;

    /**
     * Register a notification template (legacy, still supported)
     * Templates are namespaced: plugin_{pluginId}_{templateKey}
     */
    registerTemplate(template: PluginNotificationTemplate): Promise<void>;

    /**
     * Register a notification channel (legacy, still supported)
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

// ============================================================================
// Unified Notification Contract v2 Types
// ============================================================================

/**
 * Plugin Notification Send Parameters (Unified Contract v2)
 *
 * Simplified API where plugins declare "intent", platform handles "execution".
 */
export interface PluginNotificationSendParams {
    /**
     * Notification type ID - must match a type declared in manifest.notifications.types
     * @example "task_reminder", "content_liked"
     */
    type: string;

    /**
     * Target user ID to receive the notification
     */
    userId: string;

    /**
     * Actor who triggered the notification (optional)
     * If not provided, the plugin itself is treated as the actor
     */
    actor?: PluginNotificationActor;

    /**
     * Target object the notification is about
     */
    target: PluginNotificationTarget;

    /**
     * Custom data for template rendering
     * These values are passed to i18n templates as variables
     */
    data?: Record<string, unknown>;

    /**
     * Locale for i18n (e.g., 'en-US', 'zh-CN')
     * Falls back to user preference or 'en-US'
     */
    locale?: string;
}

/**
 * Notification Actor - who triggered the notification
 */
export interface PluginNotificationActor {
    /** Actor ID (user ID or plugin ID) */
    id: string;
    /** Actor type */
    type: 'user' | 'plugin';
    /** Display name */
    name: string;
    /** Avatar URL (optional) */
    avatarUrl?: string;
}

/**
 * Notification Target - what the notification is about
 */
export interface PluginNotificationTarget {
    /** Target type (e.g., 'post', 'comment', 'task') */
    type: string;
    /** Target ID */
    id: string;
    /** URL to navigate when notification is clicked */
    url: string;
    /** Preview image URL (optional, for rich notifications) */
    previewImage?: string;
}

/**
 * Plugin Notification Send Result
 */
export interface PluginNotificationSendResult {
    /** The created notification ID */
    notificationId: string;
}

/**
 * Rate Limit Configuration (read from manifest or platform defaults)
 */
export interface PluginRateLimitConfig {
    perPlugin: {
        maxPerMinute: number;   // default: 100
        maxPerHour: number;     // default: 1000
        maxPerDay: number;      // default: 10000
    };
    perUser: {
        maxPerMinute: number;   // default: 10
        maxPerHour: number;     // default: 50
    };
    circuitBreaker: {
        failureThreshold: number;  // consecutive failures to trigger
        cooldownSeconds: number;   // cooldown period
    };
}

/**
 * Rate Limit Result
 */
export interface PluginRateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: string;        // ISO 8601
    retryAfter?: number;    // seconds until retry allowed
    reason?: 'RATE_LIMIT_EXCEEDED' | 'CIRCUIT_BREAKER_OPEN';
}

/**
 * Notification Webhook Payload - sent to plugin webhooks
 */
export interface NotificationWebhookPayload {
    /** Event type */
    event: 'clicked' | 'archived';
    /** Notification ID */
    notificationId: string;
    /** User who performed the action */
    userId: string;
    /** Organization ID */
    organizationId: string;
    /** Notification type (as declared in manifest) */
    type: string;
    /** Target object */
    target: { type: string; id: string; url?: string };
    /** Event timestamp (ISO 8601) */
    timestamp: string;
}

// ============================================================================
// Legacy Types (still supported for backward compatibility)
// ============================================================================

/**
 * Plugin Notification Input (Legacy - use PluginNotificationSendParams instead)
 * @deprecated Use PluginNotificationSendParams for new implementations
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
 * Plugin Notification Result (Legacy)
 * @deprecated Use PluginNotificationSendResult for new implementations
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
        organizationId: string;
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
// Media/Storage Capabilities
// ============================================================================

/**
 * Plugin Media Capability - Unified file and asset management
 *
 * Provides plugins with the ability to upload, manage, and organize media.
 * Replaces the separate File and Asset capabilities.
 * All operations are scoped to the current tenant.
 */
export interface PluginMediaCapability {
    /**
     * Upload a media file
     * @param input - Media upload input
     * @returns Uploaded media info
     */
    upload(input: PluginMediaUploadInput): Promise<PluginMediaInfo>;

    /**
     * Get media info by ID
     * @param mediaId - Media ID
     * @returns Media info or null if not found
     */
    get(mediaId: string): Promise<PluginMediaInfo | null>;

    /**
     * Update media metadata
     * @param mediaId - Media ID
     * @param data - Update data
     */
    update(mediaId: string, data: PluginMediaUpdateData): Promise<PluginMediaInfo>;

    /**
     * Download media content
     * @param mediaId - Media ID
     * @returns Media content as Buffer
     */
    download(mediaId: string): Promise<Buffer>;

    /**
     * Get signed URL for media access
     * @param mediaId - Media ID
     * @param options - URL options
     * @returns Signed URL with expiration
     */
    getSignedUrl(
        mediaId: string,
        options?: { expiresIn?: number }
    ): Promise<{ url: string; expiresIn: number }>;

    /**
     * Delete a media (soft delete)
     * @param mediaId - Media ID
     */
    delete(mediaId: string): Promise<void>;

    /**
     * List media with filtering and pagination
     * @param query - Query options
     */
    list(query?: PluginMediaQuery): Promise<PluginPaginatedResult<PluginMediaInfo>>;

    /**
     * Get URL for a media variant
     * @param mediaId - Media ID
     * @param variant - Variant name (e.g., 'thumbnail', 'medium')
     */
    getVariantUrl(mediaId: string, variant: string): Promise<string>;

    /**
     * Get all variants for a media
     * @param mediaId - Media ID
     */
    getVariants(mediaId: string): Promise<PluginMediaVariant[]>;
}

/**
 * Plugin Media Upload Input
 */
export interface PluginMediaUploadInput {
    /** File content */
    content: Buffer;
    /** Original filename */
    filename: string;
    /** MIME type */
    mimeType: string;
    /** Is publicly accessible */
    isPublic?: boolean;
    /** Alt text for accessibility */
    alt?: string;
    /** Title */
    title?: string;
    /** Tags for organization */
    tags?: string[];
    /** Folder path */
    folderPath?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Plugin Media Info
 */
export interface PluginMediaInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    alt?: string;
    title?: string;
    tags: string[];
    folderPath?: string;
    width?: number;
    height?: number;
    format?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Plugin Media Update Data
 */
export interface PluginMediaUpdateData {
    alt?: string;
    title?: string;
    tags?: string[];
    folderPath?: string;
}

/**
 * Plugin Media Variant
 */
export interface PluginMediaVariant {
    name: string;
    mediaId: string;
    width?: number;
    height?: number;
    format?: string;
}

/**
 * Plugin Media Query
 */
export interface PluginMediaQuery {
    /** Filter by MIME type or category (e.g., 'image/*') */
    mimeType?: string;
    /** Tag filter */
    tags?: string[];
    /** Folder path filter (prefix match) */
    folderPath?: string;
    /** Search in filename/alt/title */
    search?: string;
    /** Sort field */
    sortBy?: 'createdAt' | 'updatedAt' | 'filename';
    /** Sort order */
    sortOrder?: 'asc' | 'desc';
    /** Page number */
    page?: number;
    /** Page size */
    pageSize?: number;
}

// ---- Legacy aliases (deprecated) ----
/** @deprecated Use PluginMediaCapability */
export type PluginFileCapability = {
    upload(input: PluginFileUploadInput): Promise<PluginFileInfo>;
    get(fileId: string): Promise<PluginFileInfo | null>;
    download(fileId: string): Promise<Buffer>;
    getSignedUrl(fileId: string, options?: { expiresIn?: number }): Promise<{ url: string; expiresIn: number }>;
    delete(fileId: string): Promise<void>;
    list(query?: PluginFileQuery): Promise<PluginPaginatedResult<PluginFileInfo>>;
};
/** @deprecated Use PluginMediaUploadInput */
export interface PluginFileUploadInput {
    content: Buffer;
    filename: string;
    mimeType: string;
    isPublic?: boolean;
    metadata?: Record<string, unknown>;
}
/** @deprecated Use PluginMediaInfo */
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
/** @deprecated Use PluginMediaQuery */
export interface PluginFileQuery {
    search?: string;
    mimeType?: string;
    page?: number;
    pageSize?: number;
}
/** @deprecated Use PluginMediaCapability */
export type PluginAssetCapability = {
    create(fileId: string, options?: PluginAssetCreateOptions): Promise<PluginAssetInfo>;
    get(assetId: string): Promise<PluginAssetInfo | null>;
    update(assetId: string, data: PluginAssetUpdateData): Promise<PluginAssetInfo>;
    delete(assetId: string): Promise<void>;
    list(query?: PluginAssetQuery): Promise<PluginPaginatedResult<PluginAssetInfo>>;
    getVariantUrl(assetId: string, variant: string): Promise<string>;
    getVariants(assetId: string): Promise<PluginAssetVariant[]>;
};
/** @deprecated Use PluginMediaUpdateData */
export interface PluginAssetCreateOptions {
    type?: 'image' | 'video' | 'document' | 'other';
    alt?: string;
    title?: string;
    tags?: string[];
    folderPath?: string;
}
/** @deprecated Use PluginMediaUpdateData */
export interface PluginAssetUpdateData {
    alt?: string;
    title?: string;
    tags?: string[];
    folderPath?: string;
}
/** @deprecated Use PluginMediaInfo */
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
/** @deprecated Use PluginMediaVariant */
export interface PluginAssetVariant {
    name: string;
    fileId: string;
    width: number;
    height: number;
    format: string;
}
/** @deprecated Use PluginMediaQuery */
export interface PluginAssetQuery {
    type?: 'image' | 'video' | 'document' | 'other';
    tags?: string[];
    folderPath?: string;
    search?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'title';
    sortOrder?: 'asc' | 'desc';
    page?: number;
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
 * - Plugins CANNOT block Core execution (except via HookAbortError in filters)
 * - Plugins CANNOT access other plugins' handlers
 */

/**
 * Hook Event Map — Extensible type registry for TypeScript autocompletion
 *
 * Plugins can augment this interface to declare their hooks:
 *
 * ```typescript
 * // plugins/crm/src/shared/hook-types.ts
 * declare module '@wordrhyme/plugin' {
 *     interface HookEventMap {
 *         'crm.customer.promoted': { customerId: string; organizationId: string };
 *         'crm.customer.beforeCreate': { name: string; organizationId: string };
 *         'crm.createProspect': { name: string; organizationId: string; id?: string; status?: string };
 *     }
 * }
 * ```
 *
 * This enables:
 * - Hook ID autocompletion in on() and emit()
 * - Automatic payload type inference
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HookEventMap {}

export interface PluginHookCapability {
    /**
     * Register a hook handler
     *
     * Subscribes to a hook. When someone calls `emit()` for this hookId,
     * your handler will be called with the data.
     *
     * - Handler can optionally return modified data (for pipe mode)
     * - Handler can throw HookAbortError to abort the operation
     * - Returns an unsubscribe function
     *
     * @param hookId - The hook ID (e.g., 'crm.customer.afterCreate')
     * @param handler - Handler function, optionally returns modified data
     * @param options - Handler options (priority, timeout)
     * @returns Unsubscribe function
     *
     * @example
     * // Notification handler (no return needed)
     * ctx.hooks.on('crm.customer.promoted', async (data) => {
     *   await sendWelcomeEmail(data.customerId);
     * });
     *
     * @example
     * // Service handler (returns result)
     * ctx.hooks.on('crm.createProspect', async (data) => {
     *   const id = await db.insert(customers).values(data);
     *   return { ...data, id, status: 'prospect' };
     * });
     *
     * @example
     * // Abort handler (blocks operation)
     * ctx.hooks.on('crm.customer.beforeCreate', async (data) => {
     *   if (!data.name) throw new HookAbortError('名字不能为空');
     * });
     */
    // Type-safe overload: auto-infer payload from HookEventMap
    on<K extends keyof HookEventMap>(
        hookId: K,
        handler: (data: HookEventMap[K], ctx: PluginContext) => HookEventMap[K] | void | Promise<HookEventMap[K] | void>,
        options?: HookHandlerOptions
    ): () => void;
    // Generic overload: any string hookId
    on<T = unknown>(
        hookId: string,
        handler: (data: T, ctx: PluginContext) => T | void | Promise<T | void>,
        options?: HookHandlerOptions
    ): () => void;

    /**
     * Emit a hook (trigger all registered handlers)
     *
     * Default mode: handlers run in **parallel**, return value from the
     * first handler that returns something (service call pattern).
     *
     * Pipe mode (`{ pipe: true }`): handlers run **serially**, each receives
     * the previous handler's output (data transformation pattern).
     *
     * @param hookId - The hook ID
     * @param data - Data to pass to handlers
     * @param options - Emit options
     * @returns The handler result (or original data if no handler returns)
     *
     * @example
     * // Parallel (default) — notification, no return needed
     * await ctx.hooks.emit('crm.customer.promoted', { customerId: 'xxx' });
     *
     * @example
     * // Parallel — service call, get return value
     * const customer = await ctx.hooks.emit('crm.createProspect', { name: 'Acme' });
     *
     * @example
     * // Pipe mode — serial data transformation
     * const enrichedData = await ctx.hooks.emit('crm.customer.beforeCreate', data, { pipe: true });
     */
    // Type-safe overload: auto-infer payload from HookEventMap
    emit<K extends keyof HookEventMap>(
        hookId: K,
        data: HookEventMap[K],
        options?: HookEmitOptions
    ): Promise<HookEventMap[K]>;
    // Generic overload: any string hookId
    emit<T = unknown>(hookId: string, data: T, options?: HookEmitOptions): Promise<T>;

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
        description: string;
    }>>;

    // ── Deprecated aliases (backward compatibility) ──

    /** @deprecated Use `on()` instead */
    addAction<T = unknown>(
        hookId: string,
        handler: (data: T, ctx: PluginContext) => void | Promise<void>,
        options?: HookHandlerOptions
    ): () => void;

    /** @deprecated Use `on()` instead */
    addFilter<T = unknown>(
        hookId: string,
        handler: (data: T, ctx: PluginContext) => T | Promise<T>,
        options?: HookHandlerOptions
    ): () => void;

    /** @deprecated Use `emit(hookId, data, { pipe: true })` instead */
    applyFilter<T = unknown>(hookId: string, initialValue: T): Promise<T>;
}

/**
 * Hook emit options
 */
export interface HookEmitOptions {
    /** If true, handlers run serially (pipeline mode). Default: false (parallel) */
    pipe?: boolean;
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

// ============================================================================
// Usage/Billing Capabilities
// ============================================================================

/**
 * Plugin Usage Capability - Explicit billing consumption
 *
 * Used by plugins that need dynamic consumption amounts per request
 * (e.g., token count, file size MB). For fixed consumption (1 unit per call),
 * use manifest `capabilities.billing.procedures` instead (zero-code).
 */
export interface PluginUsageCapability {
    /**
     * Consume usage for a specific billing subject
     *
     * @param subject - Billing capability subject (must use {pluginId}.* prefix)
     * @param amount - Amount to consume (default: 1)
     * @throws EntitlementDeniedError if capability not approved or no quota
     */
    consume(subject: string, amount?: number): Promise<void>;
}
export type ApiPayload<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] extends Date | undefined ? string | undefined : T[K] };
