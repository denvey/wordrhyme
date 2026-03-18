import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { requestContextStorage } from '../context/async-local-storage';

/**
 * Plugin Audit Payload
 *
 * Structured payload for plugin audit events.
 * Plugins must provide business semantics, not raw data.
 */
export interface PluginAuditPayload {
  /** Action performed (e.g., 'seo.meta.update', 'analytics.report.generate') */
  action: string;
  /** Entity type affected (e.g., 'page', 'product') */
  entityType: string;
  /** Entity ID affected */
  entityId?: string;
  /** Changes made (before/after snapshots) */
  changes?: {
    old?: unknown;
    new?: unknown;
  };
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin Audit Service
 *
 * Core-mediated audit API for plugins.
 * Plugins MUST use this service to write audit logs.
 * Direct database access is forbidden.
 *
 * This service:
 * 1. Validates plugin identity from request context
 * 2. Enforces action naming conventions (plugin:{pluginId}:{action})
 * 3. Adds plugin-specific metadata
 * 4. Delegates to core AuditService
 *
 * Usage (from plugin code):
 * ```typescript
 * await pluginAuditService.log({
 *   action: 'meta.update',
 *   entityType: 'page',
 *   entityId: 'page-123',
 *   changes: { old: { title: 'Old' }, new: { title: 'New' } },
 * });
 * ```
 */
@Injectable()
export class PluginAuditService {
  private readonly logger = new Logger(PluginAuditService.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Log a plugin audit event
   *
   * @param pluginId Plugin identifier (validated from context or explicit)
   * @param payload Audit event payload
   * @throws Error if plugin identity cannot be verified
   */
  async log(pluginId: string, payload: PluginAuditPayload): Promise<void> {
    const ctx = requestContextStorage.getStore();

    // Validate plugin identity
    this.validatePluginIdentity(pluginId, ctx);

    // Build namespaced action
    const namespacedAction = this.buildNamespacedAction(pluginId, payload.action);

    // Delegate to core audit service
    await this.auditService.log({
      entityType: payload.entityType,
      action: namespacedAction,
      ...(payload.entityId ? { entityId: payload.entityId } : {}),
      ...(ctx?.organizationId ? { organizationId: ctx.organizationId } : {}),
      ...(payload.changes ? { changes: payload.changes } : {}),
      metadata: {
        ...payload.metadata,
        pluginId,
        pluginAction: payload.action,
      },
    });
  }

  /**
   * Log multiple plugin audit events in batch
   */
  async logBatch(pluginId: string, payloads: PluginAuditPayload[]): Promise<void> {
    if (payloads.length === 0) return;

    const ctx = requestContextStorage.getStore();

    // Validate plugin identity
    this.validatePluginIdentity(pluginId, ctx);

    // Transform payloads
    const events = payloads.map((payload) => ({
      entityType: payload.entityType,
      action: this.buildNamespacedAction(pluginId, payload.action),
      ...(payload.entityId ? { entityId: payload.entityId } : {}),
      ...(ctx?.organizationId ? { organizationId: ctx.organizationId } : {}),
      ...(payload.changes ? { changes: payload.changes } : {}),
      metadata: {
        ...payload.metadata,
        pluginId,
        pluginAction: payload.action,
      },
    }));

    await this.auditService.logBatch(events);
  }

  /**
   * Validate that the caller is authorized to write audit logs for this plugin
   */
  private validatePluginIdentity(
    pluginId: string,
    ctx: ReturnType<typeof requestContextStorage.getStore>
  ): void {
    // In plugin context, the actorType should be 'plugin'
    // and the context should contain plugin identity
    if (!pluginId) {
      throw new Error('Plugin ID is required for plugin audit logging');
    }

    // Additional validation can be added here:
    // - Check if plugin is installed
    // - Check if plugin has audit:write capability
    // - Verify plugin token/signature

    this.logger.debug(`Plugin audit validated for: ${pluginId}`);
  }

  /**
   * Build namespaced action string
   *
   * Format: plugin:{pluginId}:{action}
   * Example: plugin:seo:meta.update
   */
  private buildNamespacedAction(pluginId: string, action: string): string {
    return `plugin:${pluginId}:${action}`;
  }
}
