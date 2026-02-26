/**
 * Audit Context - Per-request audit state via AsyncLocalStorage
 *
 * Manages the three-layer audit model:
 * - Layer 1: Infrastructure (automatic, from scoped-db)
 * - Layer 2: Business (via tRPC .meta())
 * - Layer 3: Mandatory (future, via configuration)
 *
 * Uses "In-Memory Buffer" + "Flush" pattern:
 * - DB operations only collect audit entries to buffer (zero IO)
 * - tRPC middleware flushes buffer after successful response
 * - On error, buffer is discarded (no ghost logs)
 *
 * @see docs/architecture/AUDIT_GOVERNANCE.md
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ============================================================
// Types
// ============================================================

/**
 * Audit level for Layer 2 business audit
 */
export type AuditLevel = 'FULL' | 'META';

/**
 * Business audit metadata (declared via tRPC .meta())
 */
export interface BusinessAuditMeta {
  /** Business action name (e.g., 'MENU_UPDATE', 'ROLE_CREATE') */
  action: string;
  /** Audit detail level */
  level?: AuditLevel;
  /** Additional business context */
  metadata?: Record<string, unknown>;
}

/**
 * tRPC Meta type for audit
 * Used in initTRPC.meta<AuditMeta>()
 */
export interface AuditMeta {
  audit?: BusinessAuditMeta;
  /** Permission metadata for RBAC enforcement + ScopedDb ABAC injection */
  permission?: { action: string; subject: string };
}

/**
 * Pending audit log entry (collected during request)
 */
export interface PendingAuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  changes: {
    old?: Record<string, unknown>;
    new?: Record<string, unknown>;
  };
  layer: 1 | 2;
  level?: AuditLevel;
  metadata?: Record<string, unknown>;
}

/**
 * Full audit context stored in AsyncLocalStorage
 */
export interface AuditContextData {
  /** Layer 2 business audit metadata */
  businessAudit?: BusinessAuditMeta;
  /** Actor ID (user ID or API token ID) */
  actorId?: string;
  /** Client IP address */
  clientIp?: string;
  /** Request timestamp */
  timestamp: Date;
  /** Organization ID */
  organizationId?: string;
  /** Pending audit logs (flushed at request end) */
  pendingLogs: PendingAuditEntry[];
}

// ============================================================
// AsyncLocalStorage Instance
// ============================================================

/**
 * AsyncLocalStorage for audit context
 * Automatically propagates through async operations
 */
export const auditContextStorage = new AsyncLocalStorage<AuditContextData>();

// ============================================================
// Context Access Functions
// ============================================================

/**
 * Get current audit context
 * Returns empty object if not in a request scope
 */
export function getAuditContext(): AuditContextData {
  return auditContextStorage.getStore() ?? { timestamp: new Date(), pendingLogs: [] };
}

/**
 * Check if business audit is declared (Layer 2)
 */
export function hasBusinessAudit(): boolean {
  const ctx = auditContextStorage.getStore();
  return ctx?.businessAudit?.action !== undefined;
}

/**
 * Get business audit action if declared
 */
export function getBusinessAuditAction(): string | undefined {
  return auditContextStorage.getStore()?.businessAudit?.action;
}

/**
 * Get business audit level
 */
export function getBusinessAuditLevel(): AuditLevel | undefined {
  return auditContextStorage.getStore()?.businessAudit?.level;
}

/**
 * Get business audit metadata
 */
export function getBusinessAuditMetadata(): Record<string, unknown> | undefined {
  return auditContextStorage.getStore()?.businessAudit?.metadata;
}

// ============================================================
// Pending Log Management (In-Memory Buffer)
// ============================================================

/**
 * Maximum number of pending audit logs before warning
 * This prevents memory issues in large batch operations
 */
const MAX_PENDING_LOGS = 1000;

/**
 * Add a pending audit log entry
 *
 * This is called by scoped-db during DB operations.
 * The log is NOT sent immediately - it's buffered until request ends.
 *
 * @param entry Audit entry to buffer
 */
export function addPendingLog(entry: PendingAuditEntry): void {
  const store = auditContextStorage.getStore();
  if (store) {
    store.pendingLogs.push(entry);

    // Warn if buffer is getting too large
    if (store.pendingLogs.length === MAX_PENDING_LOGS) {
      console.warn(
        `[audit-context] Pending logs reached ${MAX_PENDING_LOGS} entries. ` +
        'Consider flushing or reducing batch size to prevent memory issues.'
      );
    }
  }
}

/**
 * Get all pending audit logs
 */
export function getPendingLogs(): PendingAuditEntry[] {
  return auditContextStorage.getStore()?.pendingLogs ?? [];
}

/**
 * Clear pending logs (called after flush or on error)
 */
export function clearPendingLogs(): void {
  const store = auditContextStorage.getStore();
  if (store) {
    store.pendingLogs = [];
  }
}

// ============================================================
// Context Management Functions
// ============================================================

/**
 * Run a function with audit context
 *
 * @param data Audit context data (from tRPC middleware)
 * @param fn Function to run within the context
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * // In tRPC global middleware
 * return runWithAuditContext(
 *   {
 *     businessAudit: meta?.audit,
 *     actorId: ctx.userId,
 *     clientIp: ctx.ip,
 *     timestamp: new Date(),
 *     pendingLogs: [],
 *   },
 *   () => next()
 * );
 * ```
 */
export function runWithAuditContext<T>(
  data: AuditContextData,
  fn: () => T
): T {
  return auditContextStorage.run(data, fn);
}

/**
 * Create audit context data from tRPC meta and request context
 *
 * @param meta tRPC procedure meta
 * @param actorId User ID or API token ID
 * @param clientIp Client IP address
 * @param organizationId Organization ID
 */
export function createAuditContextData(
  meta: AuditMeta | undefined,
  actorId: string | undefined,
  clientIp: string | undefined,
  organizationId?: string
): AuditContextData {
  return {
    businessAudit: meta?.audit,
    actorId,
    clientIp,
    organizationId,
    timestamp: new Date(),
    pendingLogs: [],
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Determine the appropriate audit action
 *
 * If Layer 2 business audit is declared, use that action.
 * Otherwise, fall back to Layer 1 infrastructure action.
 *
 * @param fallbackAction Layer 1 action (e.g., 'DB_INSERT')
 * @returns The action to use for audit logging
 */
export function resolveAuditAction(fallbackAction: string): string {
  const businessAction = getBusinessAuditAction();
  return businessAction ?? fallbackAction;
}

/**
 * Determine the audit layer
 *
 * @returns 1 for infrastructure, 2 for business
 */
export function getAuditLayer(): 1 | 2 {
  return hasBusinessAudit() ? 2 : 1;
}
