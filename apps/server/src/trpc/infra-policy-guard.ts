/**
 * Infrastructure Policy Guard (v2: Path-Driven, Settings-Only)
 *
 * Replaced v1's subject-based registry with path-driven module detection.
 * No registration needed — module is extracted from the tRPC request path.
 *
 * Flow:
 * 1. getModuleFromPath(path) — extract module from request path
 * 2. getMode(module) — synchronous, reads from in-memory cache
 * 3. enforceInfraPolicy() — WRITE guard
 * 4. resolveEffectiveOrg() — READ context swap
 *
 * Lifecycle:
 * - initInfraPolicySettings() at startup → loads all policy modes
 * - refreshPolicyMode(module) on Settings change or plugin install/uninstall
 */
import { TRPCError } from '@trpc/server';
import type { SettingsService } from '../settings/settings.service';

// ─── Types ───

export type InfraPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

const VALID_MODES: ReadonlySet<string> = new Set(['unified', 'allow_override', 'require_tenant']);

function parseMode(raw: unknown): InfraPolicyMode | null {
  const value = typeof raw === 'object' && raw !== null && 'mode' in raw
    ? (raw as { mode: unknown }).mode
    : raw;
  return typeof value === 'string' && VALID_MODES.has(value)
    ? value as InfraPolicyMode
    : null;
}

// ─── Path Extraction ───

/**
 * Extract module name from tRPC procedure path.
 *
 * - pluginApis.lbac-teams.members.invite → 'lbac-teams'
 * - currency.list                        → 'currency'
 * - billing.plans.create                 → 'billing'
 */
export function getModuleFromPath(path: string): string | null {
  const pluginMatch = path.match(/^pluginApis\.([^.]+)/);
  if (pluginMatch) return pluginMatch[1] ?? null;

  const dotIndex = path.indexOf('.');
  if (dotIndex > 0) return path.substring(0, dotIndex);

  return null;
}

/**
 * Extract procedure name (last segment) from tRPC path.
 * Used for meta-operation bypass (switchToCustom, resetToPlatform).
 */
export function getProcedureNameFromPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot > 0 ? path.substring(lastDot + 1) : path;
}

/**
 * Normalize a manifest pluginId to the module key used in tRPC paths.
 * Must stay in sync with router.ts registerPluginRouter normalization.
 *
 * "com.wordrhyme.storage-s3" → "storage-s3"
 * "hello-world" → "hello-world"
 */
export function normalizeModuleId(pluginId: string): string {
  return pluginId
    .replace(/^com\.wordrhyme\./, '')
    .replace(/\./g, '-');
}

/**
 * Procedure names exempt from infra policy guard.
 * Meta-operations that modify policy state itself — cannot be blocked by their own guard.
 */
export const BYPASS_PROCEDURES = new Set(['switchToCustom', 'resetToPlatform']);

// ─── Settings Integration ───

let _settings: SettingsService | null = null;

/**
 * In-memory policy mode cache.
 * Loaded at startup, refreshed on plugin install/uninstall and Admin Settings change.
 */
const policyModeCache = new Map<string, InfraPolicyMode>();

/**
 * Initialize infra policy with SettingsService and load all policy modes into memory.
 * Must be called during module bootstrap before any request is processed.
 */
export async function initInfraPolicySettings(settings: SettingsService): Promise<void> {
  _settings = settings;
  await loadAllPolicyModes();
}

/**
 * Fail-fast if SettingsService is not initialized.
 * Prevents silent fallback to require_tenant which would disable the guard.
 */
function assertSettingsReady(): SettingsService {
  if (!_settings) {
    throw new Error(
      '[InfraPolicy] SettingsService not initialized. Call initInfraPolicySettings() in module bootstrap.'
    );
  }
  return _settings;
}

/**
 * Load all infra policy modes from Settings into memory cache.
 * Called at startup and on plugin install/uninstall (full reload).
 */
async function loadAllPolicyModes(): Promise<void> {
  const settings = assertSettingsReady();
  const allSettings = await settings.list('global', { keyPrefix: 'infra.policy.' });
  policyModeCache.clear();
  for (const s of allSettings) {
    const module = s.key.replace('infra.policy.', '');
    const mode = parseMode(s.value);
    if (mode) {
      policyModeCache.set(module, mode);
    }
  }
}

/**
 * Refresh policy mode for a single module.
 * Called when Admin changes a module's infra policy setting.
 */
export async function refreshPolicyMode(module: string): Promise<void> {
  const settings = assertSettingsReady();
  const raw = await settings.get('global', `infra.policy.${module}`, {
    defaultValue: null,
  });
  if (!raw) {
    policyModeCache.delete(module);
  } else {
    const mode = parseMode(raw);
    if (mode) {
      policyModeCache.set(module, mode);
    }
  }
}

/**
 * Reload all policy modes from Settings (full refresh).
 * Exposed for plugin install/uninstall events.
 */
export async function reloadAllPolicyModes(): Promise<void> {
  await loadAllPolicyModes();
}

/**
 * Get infra policy mode for a module. Synchronous — reads from in-memory cache.
 * Returns 'require_tenant' if not configured (= no infra policy effect).
 */
export function getMode(module: string): InfraPolicyMode {
  return policyModeCache.get(module) ?? 'require_tenant';
}

/**
 * Check if a tenant has customized data for a module.
 * Uses Settings flag set by switchToCustom / cleared by resetToPlatform.
 *
 * This is async (queries Settings with ~300s TTL cache) because it's tenant-level
 * data that varies per tenant and changes at runtime.
 */
export async function hasCustomData(module: string, organizationId: string): Promise<boolean> {
  const settings = assertSettingsReady();
  const value = await settings.get('tenant', `infra.customized.${module}`, {
    organizationId,
    defaultValue: false,
  });
  return Boolean(value);
}

/**
 * Set or clear the customization flag for a module + tenant.
 * Called by switchToCustom (true) and resetToPlatform (false).
 */
export async function setCustomizationFlag(
  module: string,
  organizationId: string,
  value: boolean,
): Promise<void> {
  const settings = assertSettingsReady();
  await settings.set('tenant', `infra.customized.${module}`, value, {
    organizationId,
  });
}

// ─── Guard ───

export const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'manage']);

/**
 * Enforce infra policy mutation guard.
 * Blocks WRITE operations when policy disallows tenant modifications.
 *
 * Called by the global middleware — module developers never call this directly.
 */
export async function enforceInfraPolicy(
  module: string,
  organizationId: string | undefined,
  action: string | undefined,
): Promise<void> {
  if (!organizationId || organizationId === 'platform') return;
  if (!action || !WRITE_ACTIONS.has(action)) return;

  const mode = getMode(module);

  if (mode === 'unified') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Configuration is managed by the platform',
    });
  }

  if (mode === 'allow_override') {
    const hasCustom = await hasCustomData(module, organizationId);
    if (!hasCustom) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Switch to custom configuration first',
      });
    }
  }

  // require_tenant: always allow writes
}

// ─── Effective Org Resolution ───

/**
 * Resolve the effective organization ID based on infra policy mode.
 *
 * Used by the global middleware for READ Context Swap:
 * - unified → 'platform' (tenant reads platform data)
 * - require_tenant → organizationId (tenant reads own data)
 * - allow_override + has custom → organizationId
 * - allow_override + no custom → 'platform'
 */
export async function resolveEffectiveOrg(
  module: string,
  organizationId: string,
): Promise<string> {
  if (organizationId === 'platform') return 'platform';

  const mode = getMode(module);
  switch (mode) {
    case 'unified': return 'platform';
    case 'require_tenant': return organizationId;
    case 'allow_override': {
      const hasCustom = await hasCustomData(module, organizationId);
      return hasCustom ? organizationId : 'platform';
    }
  }
}
