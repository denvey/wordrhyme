/**
 * Billing Guard (Plugin API Billing Middleware)
 *
 * Three-layer capability resolution for plugin procedure billing:
 *
 *   L3: Procedure Decl.   — unified startup scan (meta.billing/meta.subject)
 *   L3b: Manifest         — manifest.capabilities.billing.procedures[proc]
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
 * - initBillingGuard(settings, getManifest) at startup → loads module defaults + policy
 * - refreshBillingSettings() on Admin Settings change
 */
import type { SettingsService } from '../settings/settings.service';
import type { PluginManifest } from '@wordrhyme/plugin';
import { getBillingSubjectForPath } from '../trpc/permission-registry';

// ─── Types ───

export type BillingDefaultPolicy = 'allow' | 'deny' | 'audit';

interface BillingResolution {
  subject: string | null;
  source: 'L3' | 'L3b' | 'L2' | 'default';
  free: boolean;
}

// ─── Module State ───

let _settings: SettingsService | null = null;
let _getManifest: ((pluginId: string) => PluginManifest | undefined) | null = null;

/**
 * L2 module default cache: `{pluginId}` → subject
 */
const l2ModuleDefaultCache = new Map<string, string>();

/**
 * Default policy cache
 */
let defaultPolicyCache: BillingDefaultPolicy = 'deny';

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
    defaultValue: 'deny',
  });
  if (policy === 'allow' || policy === 'deny' || policy === 'audit') {
    defaultPolicyCache = policy;
  } else {
    defaultPolicyCache = 'deny';
  }
}

// ─── Refresh ───

/**
 * Refresh all billing settings. Called when Admin changes billing configuration.
 */
export async function refreshBillingSettings(): Promise<void> {
  await loadAllBillingSettings();
}

// ─── Resolution ───

/**
 * Resolve billing subject for a plugin procedure through the declaration cascade.
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
  const path = `pluginApis.${normalizedPluginId}.${procedureName}`;

  // L3: Procedure declaration from unified startup scan
  const l3Registry = getBillingSubjectForPath(path);
  if (l3Registry) {
    if (l3Registry === 'free') {
      return { subject: null, source: 'L3', free: true };
    }
    return { subject: l3Registry, source: 'L3', free: false };
  }

  // L3b: Manifest Declaration
  const manifest = _getManifest?.(originalPluginId);
  const l3Value = manifest?.capabilities?.billing?.procedures?.[procedureName];
  if (l3Value) {
    if (l3Value === 'free') {
      return { subject: null, source: 'L3b', free: true };
    }
    return { subject: l3Value, source: 'L3b', free: false };
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

/**
 * Get L2 module default subject for a plugin (for drift detection).
 * Returns the subject string or null if no module default exists.
 */
export function getL2ModuleDefault(pluginId: string): string | null {
  return l2ModuleDefaultCache.get(pluginId) ?? null;
}
