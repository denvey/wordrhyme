/**
 * System Hooks
 *
 * Hook definitions for System, Database, Plugin, Integration, and Security.
 */

import { HookDefinition } from '../hook.types';

// ============================================================================
// System Hooks
// ============================================================================

export const SYSTEM_HOOKS: HookDefinition[] = [
  { id: 'system.onStartup', type: 'action', description: 'After system startup', defaultTimeout: 30000 },
  { id: 'system.onShutdown', type: 'action', description: 'Before system shutdown', defaultTimeout: 10000 },
  { id: 'system.onError', type: 'action', description: 'Global uncaught error', defaultTimeout: 5000 },
  { id: 'system.health.check', type: 'filter', description: 'Health probe', defaultTimeout: 5000 },
  { id: 'system.config.onChange', type: 'action', description: 'Config changed', defaultTimeout: 5000 },
  { id: 'system.cache.beforeClear', type: 'filter', description: 'Before cache clear', defaultTimeout: 5000 },
  { id: 'system.cache.afterClear', type: 'action', description: 'After cache clear', defaultTimeout: 5000 },
  { id: 'system.cron.beforeRun', type: 'filter', description: 'Before cron job', defaultTimeout: 5000 },
  { id: 'system.cron.afterRun', type: 'action', description: 'After cron job', defaultTimeout: 5000 },
];

// ============================================================================
// Database Hooks
// ============================================================================

export const DB_HOOKS: HookDefinition[] = [
  { id: 'db.migration.beforeApply', type: 'filter', description: 'Before migration', defaultTimeout: 30000 },
  { id: 'db.migration.afterApply', type: 'action', description: 'After migration', defaultTimeout: 10000 },
];

// ============================================================================
// Plugin Hooks
// ============================================================================

export const PLUGIN_HOOKS: HookDefinition[] = [
  { id: 'plugin.beforeInstall', type: 'filter', description: 'Before install (by other plugins)', defaultTimeout: 10000 },
  { id: 'plugin.afterInstall', type: 'action', description: 'After install', defaultTimeout: 10000 },
  { id: 'plugin.beforeEnable', type: 'filter', description: 'Before enable', defaultTimeout: 5000 },
  { id: 'plugin.afterEnable', type: 'action', description: 'After enable', defaultTimeout: 5000 },
  { id: 'plugin.beforeDisable', type: 'filter', description: 'Before disable', defaultTimeout: 5000 },
  { id: 'plugin.afterDisable', type: 'action', description: 'After disable', defaultTimeout: 5000 },
  { id: 'plugin.beforeUninstall', type: 'filter', description: 'Before uninstall', defaultTimeout: 10000 },
  { id: 'plugin.afterUninstall', type: 'action', description: 'After uninstall', defaultTimeout: 10000 },
  { id: 'plugin.beforeUpgrade', type: 'filter', description: 'Before upgrade', defaultTimeout: 10000 },
  { id: 'plugin.onUpgrade', type: 'action', description: 'After upgrade', defaultTimeout: 10000 },
  { id: 'plugin.onError', type: 'action', description: 'Runtime error', defaultTimeout: 5000 },
  { id: 'plugin.onConflictDetected', type: 'action', description: 'Conflict detected', defaultTimeout: 5000 },
];

// ============================================================================
// Integration Hooks
// ============================================================================

export const INTEGRATION_HOOKS: HookDefinition[] = [
  { id: 'webhook.beforeSend', type: 'filter', description: 'Before send - signing', defaultTimeout: 5000 },
  { id: 'webhook.afterSend', type: 'action', description: 'After send - logging', defaultTimeout: 5000 },
  { id: 'webhook.onFailed', type: 'action', description: 'Send failed', defaultTimeout: 5000 },
  { id: 'webhook.onReceive', type: 'filter', description: 'Receive external webhook', defaultTimeout: 10000 },
  { id: 'api.beforeRequest', type: 'filter', description: 'Before API request', defaultTimeout: 5000 },
  { id: 'api.afterResponse', type: 'filter', description: 'After API response', defaultTimeout: 5000 },
];

// ============================================================================
// Security Hooks
// ============================================================================

export const SECURITY_HOOKS: HookDefinition[] = [
  { id: 'audit.onLog', type: 'action', description: 'Audit log written', defaultTimeout: 5000 },
  { id: 'security.onThreatDetected', type: 'action', description: 'Threat detected', defaultTimeout: 5000 },
  { id: 'security.onSuspiciousBehavior', type: 'action', description: 'Suspicious behavior', defaultTimeout: 5000 },
  { id: 'security.onRateLimitHit', type: 'action', description: 'Rate limit hit', defaultTimeout: 3000 },
  { id: 'security.beforeSensitiveAction', type: 'filter', description: 'Before sensitive action', defaultTimeout: 5000 },
];

// ============================================================================
// Combined System Hooks
// ============================================================================

export const ALL_SYSTEM_HOOKS: HookDefinition[] = [
  ...SYSTEM_HOOKS,
  ...DB_HOOKS,
  ...PLUGIN_HOOKS,
  ...INTEGRATION_HOOKS,
  ...SECURITY_HOOKS,
];
