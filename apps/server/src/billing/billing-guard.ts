/**
 * Billing Guard (Plugin API Billing Middleware)
 *
 * Four-layer capability resolution for plugin procedure billing:
 *
 *   L4: Admin Override    — Settings `billing.override.pluginApis.{pluginId}.{proc}`
 *   L3: Manifest          — manifest.capabilities.billing.procedures[proc]
 *   L2: Module Default    — Settings `billing.module.{pluginId}.subject`
 *   Default Policy        — Settings `billing.defaultUndeclaredPolicy` (allow/deny/audit)
 *
 * After resolving subject:
 *   L1: Legitimacy check  — capability must exist in DB with status='approved'
 *   EntitlementService    — boolean: requireAccess / metered: requireAndConsume
 *
 * Special value "free" at any layer bypasses all billing checks.
 *
 * Lifecycle:
 * - initBillingGuard(settings, getManifest) at startup → loads overrides + defaults
 * - refreshBillingOverrides() on Admin Settings change
 */
import type { SettingsService } from '../settings/settings.service';
import type { PluginManifest } from '@wordrhyme/plugin';

// ─── Types ───

export type BillingDefaultPolicy = 'allow' | 'deny' | 'audit';

interface BillingResolution {
  subject: string | null;
  source: 'L4' | 'L3' | 'L2' | 'default';
  free: boolean;
}

// ─── Module State ───

let _settings: SettingsService | null = null;
let _getManifest: ((pluginId: string) => PluginManifest | undefined) | null = null;

/**
 * L4 overrides cache: `{pluginId}.{procedureName}` → subject or "free"
 */
const l4OverrideCache = new Map<string, string>();

/**
 * L2 module default cache: `{pluginId}` → subject
 */
const l2ModuleDefaultCache = new Map<string, string>();

/**
 * Default policy cache
 */
let defaultPolicyCache: BillingDefaultPolicy = 'allow';

// ─── Initialization ───

/**
 * Initialize billing guard with SettingsService and manifest accessor.
 * Must be called during module bootstrap before any request is processed.
 */
export async function initBillingGuard(
  settings: SettingsService,
  getManifest: (pluginId: string) => PluginManifest | undefined,
): Promise<void> {
  _settings = settings;
  _getManifest = getManifest;
  await loadAllBillingSettings();
}

function assertReady() {
  if (!_settings || !_getManifest) {
    throw new Error(
      '[BillingGuard] Not initialized. Call initBillingGuard() in module bootstrap.'
    );
  }
}

/**
 * Load all billing-related settings into memory caches.
 */
async function loadAllBillingSettings(): Promise<void> {
  assertReady();
  const settings = _settings!;

  // Load L4 overrides: billing.override.pluginApis.*
  l4OverrideCache.clear();
  const l4Settings = await settings.list('global', {
    keyPrefix: 'billing.override.pluginApis.',
  });
  for (const s of l4Settings) {
    // key format: billing.override.pluginApis.{pluginId}.{procedureName}
    const suffix = s.key.replace('billing.override.pluginApis.', '');
    if (suffix && typeof s.value === 'string') {
      l4OverrideCache.set(suffix, s.value);
    }
  }

  // Load L2 module defaults: billing.module.{pluginId}.subject
  l2ModuleDefaultCache.clear();
  const l2Settings = await settings.list('global', {
    keyPrefix: 'billing.module.',
  });
  for (const s of l2Settings) {
    // key format: billing.module.{pluginId}.subject
    const match = s.key.match(/^billing\.module\.(.+)\.subject$/);
    if (match && match[1] && typeof s.value === 'string') {
      l2ModuleDefaultCache.set(match[1], s.value);
    }
  }

  // Load default policy
  const policy = await settings.get('global', 'billing.defaultUndeclaredPolicy', {
    defaultValue: 'allow',
  });
  if (policy === 'allow' || policy === 'deny' || policy === 'audit') {
    defaultPolicyCache = policy;
  } else {
    defaultPolicyCache = 'allow';
  }
}

// ─── Refresh ───

/**
 * Refresh all billing settings. Called when Admin changes billing configuration.
 */
export async function refreshBillingSettings(): Promise<void> {
  await loadAllBillingSettings();
}

/**
 * Refresh a single L4 override.
 */
export async function refreshL4Override(pluginId: string, procedureName: string): Promise<void> {
  assertReady();
  const key = `billing.override.pluginApis.${pluginId}.${procedureName}`;
  const value = await _settings!.get('global', key, { defaultValue: null });
  const cacheKey = `${pluginId}.${procedureName}`;
  if (typeof value === 'string') {
    l4OverrideCache.set(cacheKey, value);
  } else {
    l4OverrideCache.delete(cacheKey);
  }
}

// ─── Four-Layer Resolution ───

/**
 * Resolve billing subject for a plugin procedure through the four-layer cascade.
 *
 * @param normalizedPluginId - Normalized plugin ID (e.g., "hello-world")
 * @param originalPluginId - Original plugin ID (e.g., "com.wordrhyme.hello-world")
 * @param procedureName - The procedure being called (e.g., "sayHello")
 * @returns Resolution result with subject, source layer, and free flag
 */
export function resolveBillingSubject(
  normalizedPluginId: string,
  originalPluginId: string,
  procedureName: string,
): BillingResolution {
  // L4: Admin Override (Settings)
  const l4Key = `${normalizedPluginId}.${procedureName}`;
  const l4Value = l4OverrideCache.get(l4Key);
  if (l4Value) {
    if (l4Value === 'free') {
      return { subject: null, source: 'L4', free: true };
    }
    return { subject: l4Value, source: 'L4', free: false };
  }

  // L3: Manifest Declaration
  const manifest = _getManifest?.(originalPluginId);
  const l3Value = manifest?.capabilities?.billing?.procedures?.[procedureName];
  if (l3Value) {
    if (l3Value === 'free') {
      return { subject: null, source: 'L3', free: true };
    }
    return { subject: l3Value, source: 'L3', free: false };
  }

  // L2: Module Default (Settings)
  const l2Value = l2ModuleDefaultCache.get(normalizedPluginId);
  if (l2Value) {
    if (l2Value === 'free') {
      return { subject: null, source: 'L2', free: true };
    }
    return { subject: l2Value, source: 'L2', free: false };
  }

  // Default Policy: no subject resolved
  return { subject: null, source: 'default', free: false };
}

/**
 * Get the current default policy for undeclared procedures.
 */
export function getDefaultPolicy(): BillingDefaultPolicy {
  return defaultPolicyCache;
}

/**
 * Check if billing guard is initialized and ready.
 */
export function isBillingGuardReady(): boolean {
  return _settings !== null && _getManifest !== null;
}
