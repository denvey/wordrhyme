/**
 * Permission Registry (v2: Startup Scan + RBAC Auto-Inference)
 *
 * Scans all tRPC procedures at startup, builds an in-memory registry
 * for Admin UI display and runtime permission resolution.
 *
 * Two-layer model:
 * - PermissionRegistry (in-memory, read-only) — startup scan results
 * - Settings rbac.override.{path} (persistent) — admin overrides (runtime priority)
 *
 * Source priority:
 * 1. explicit — developer declared meta.permission { action, subject }
 * 2. auto-crud — procedure name in AUTO_CRUD_OPERATIONS, subject from module
 * 3. pending  — no declaration, auto-derived from module + procedure name
 */
import { getModuleFromPath } from './infra-policy-guard';
import type { SettingsService } from '../settings/settings.service';

// ─── Types ───

export type RbacDefaultPolicy = 'audit' | 'deny' | 'allow';

export interface PermissionRegistryEntry {
  path: string;
  name: string;
  type: 'query' | 'mutation';
  permission: {
    action: string;
    subject: string;
  };
  /**
   * Billing declaration discovered during startup scan.
   * Priority: meta.billing.subject > meta.subject > meta.permission.subject
   */
  billingSubject: string | null;
  source: 'explicit' | 'auto-crud' | 'pending';
  module: string | null;
}

// ─── AUTO_CRUD_OPERATIONS ───

/**
 * Standard CRUD operation names from @wordrhyme/auto-crud-server.
 * Each operation maps directly to its own action (not collapsed to read/write).
 * This enables granular per-operation authorization in Admin UI.
 */
export const AUTO_CRUD_OPERATIONS = new Set([
  'list',
  'get',
  'create',
  'update',
  'delete',
  'deleteMany',
  'updateMany',
  'createMany',
  'upsert',
  'export',
  'import',
]);

// ─── Action Inference (Task 6.2) ───

/**
 * Infer RBAC action from procedure name.
 * Always returns the procedure name as the action — no synthetic 'read' fallback.
 * AUTO_CRUD_OPERATIONS is retained for source classification (auto-crud vs pending).
 */
export function inferAction(procedureName: string, _type: 'query' | 'mutation'): string {
  return procedureName;
}

// ─── Subject Inference (Task 6.3) ───

/**
 * Simple singularize for common English noun patterns.
 * Covers the table naming conventions used in this project.
 */
function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Convert database table name to PascalCase subject.
 * Singularizes the last segment (table names are typically plural).
 *
 * Examples:
 * - currencies       → Currency
 * - exchange_rates   → ExchangeRate
 * - i18n_languages   → I18nLanguage
 * - api_tokens       → ApiToken
 */
export function tableNameToSubject(tableName: string): string {
  const parts = tableName.split('_');
  return parts
    .map((word, i) => {
      const processed = i === parts.length - 1 ? singularize(word) : word;
      return processed.charAt(0).toUpperCase() + processed.slice(1);
    })
    .join('');
}

/**
 * Convert module name (from tRPC path) to PascalCase subject.
 * Used when no explicit subject is declared.
 *
 * Examples:
 * - currency       → Currency
 * - exchange-rate  → ExchangeRate
 * - infraPolicy    → InfraPolicy
 */
export function moduleToSubject(module: string | null): string {
  if (!module) return 'Unknown';
  return module
    .split(/[-_.]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

// ─── Subject Title (Task 6.4) ───

/**
 * Resolve display title for a permission subject.
 * Fallback chain: t(subject) → humanize PascalCase
 *
 * Examples:
 * - getSubjectTitle('Currency', t) → t('Currency') or 'Currency'
 * - getSubjectTitle('ExchangeRate') → 'Exchange Rate'
 * - getSubjectTitle('I18nLanguage') → 'I18n Language'
 */
export function getSubjectTitle(subject: string, t?: (key: string) => string): string {
  if (t) {
    const translated = t(subject);
    if (translated !== subject) return translated;
  }
  return subject.replace(/([A-Z])/g, ' $1').trim();
}

// ─── Registry Storage ───

let _registry: Map<string, PermissionRegistryEntry> | null = null;

/**
 * Get the permission registry. Throws if not initialized.
 */
export function getPermissionRegistry(): ReadonlyMap<string, PermissionRegistryEntry> {
  if (!_registry) {
    throw new Error(
      '[PermissionRegistry] Not initialized. Call initPermissionRegistry() at startup.'
    );
  }
  return _registry;
}

/**
 * Check if the permission registry is initialized.
 */
export function isPermissionRegistryReady(): boolean {
  return _registry !== null;
}

// ─── Default Policy (Task 6.5) ───

const VALID_POLICIES: ReadonlySet<string> = new Set(['audit', 'deny', 'allow']);

let _settingsService: SettingsService | null = null;
let _defaultPolicy: RbacDefaultPolicy = 'audit'; // Safe default: allow + log

/**
 * Set SettingsService reference for RBAC.
 * Called once at startup from TrpcModule.
 */
export function setRbacSettingsService(settingsService: SettingsService): void {
  _settingsService = settingsService;
}

/**
 * Load the RBAC default policy from Settings.
 * Called at startup after SettingsService is available.
 */
export async function loadRbacDefaultPolicy(): Promise<void> {
  if (!_settingsService) return;
  const raw = await _settingsService.get('global', 'rbac.defaultPolicy');
  if (typeof raw === 'string' && VALID_POLICIES.has(raw)) {
    _defaultPolicy = raw as RbacDefaultPolicy;
  }
}

/**
 * Refresh the RBAC default policy from Settings.
 * Called when admin changes the setting.
 */
export async function refreshRbacDefaultPolicy(): Promise<void> {
  return loadRbacDefaultPolicy();
}

/**
 * Set the RBAC default policy and persist to Settings.
 * Called from Admin API when changing the default policy.
 */
export async function setRbacDefaultPolicyValue(policy: RbacDefaultPolicy): Promise<void> {
  if (!_settingsService) throw new Error('[RBAC] SettingsService not initialized');
  await _settingsService.set('global', 'rbac.defaultPolicy', policy);
  _defaultPolicy = policy;
}

/**
 * Get the current RBAC default policy (synchronous, from cache).
 */
export function getRbacDefaultPolicy(): RbacDefaultPolicy {
  return _defaultPolicy;
}

// ─── Runtime Permission Resolution (Task 6.6 + 6.9) ───

export interface ResolvedPermission {
  action: string;
  subject: string;
  source: 'explicit' | 'auto-crud' | 'pending' | 'admin';
}

// ─── Admin Override Cache (Task 6.9) ───

const _overrideCache = new Map<string, { action: string; subject: string }>();

/**
 * Load all rbac.override.* Settings into memory cache.
 * Called at startup after SettingsService and Registry are both ready.
 */
export async function loadRbacOverrides(): Promise<void> {
  if (!_settingsService) return;
  _overrideCache.clear();

  const overrideSettings = await _settingsService.list('global', {
    keyPrefix: 'rbac.override.',
  });

  for (const setting of overrideSettings) {
    const path = setting.key.replace(/^rbac\.override\./, '');
    const value = setting.value;
    if (value && typeof value === 'object' && 'action' in value && 'subject' in value) {
      _overrideCache.set(path, value as { action: string; subject: string });
    }
  }

  if (_overrideCache.size > 0) {
    console.log(`[RBAC] Loaded ${_overrideCache.size} admin overrides`);
  }
}

/**
 * Set an admin override for a procedure path.
 * Updates both Settings (persistent) and cache (in-memory).
 */
export async function setRbacOverride(
  path: string,
  override: { action: string; subject: string },
): Promise<void> {
  if (!_settingsService) throw new Error('[RBAC] SettingsService not initialized');
  await _settingsService.set('global', `rbac.override.${path}`, override);
  _overrideCache.set(path, override);
}

/**
 * Delete an admin override for a procedure path.
 * Removes from both Settings and cache, restoring developer defaults.
 */
export async function deleteRbacOverride(path: string): Promise<void> {
  if (!_settingsService) throw new Error('[RBAC] SettingsService not initialized');
  await _settingsService.delete('global', `rbac.override.${path}`);
  _overrideCache.delete(path);
}

/**
 * Get admin override for a path (synchronous, from cache).
 */
export function getRbacOverride(path: string): { action: string; subject: string } | undefined {
  return _overrideCache.get(path);
}

/**
 * Resolve permission for a procedure path.
 * Full runtime priority chain:
 *   1. Admin override (rbac.override.{path}) → highest
 *   2. PermissionRegistry (startup scan defaults)
 *   3. (Default Policy handled by middleware)
 */
export function resolvePermissionForPath(path: string): ResolvedPermission | null {
  // Priority 1: Admin override
  const override = _overrideCache.get(path);
  if (override) {
    return {
      action: override.action,
      subject: override.subject,
      source: 'admin',
    };
  }

  // Priority 2: Registry (developer defaults)
  if (!_registry) return null;

  const entry = _registry.get(path);
  if (!entry) return null;

  return {
    action: entry.permission.action,
    subject: entry.permission.subject,
    source: entry.source,
  };
}

/**
 * Resolve Billing subject declared at procedure level from startup registry.
 * Returns null when no declaration exists.
 */
export function getBillingSubjectForPath(path: string): string | null {
  if (!_registry) return null;
  return _registry.get(path)?.billingSubject ?? null;
}

// ─── Router Tree Walking ───

/**
 * Determine procedure type from its internal definition.
 * tRPC v11 stores type on the built procedure's _def.
 */
function getProcedureType(def: any): 'query' | 'mutation' | 'subscription' {
  if (def.type === 'mutation') return 'mutation';
  if (def.type === 'subscription') return 'subscription';
  if (def.mutation === true) return 'mutation';
  return 'query';
}

/**
 * Check if a value is a tRPC procedure (not a router or plain object).
 */
function isProcedure(value: any): boolean {
  return value?._def?.procedure === true;
}

/**
 * Check if a value is a tRPC router.
 */
function isRouter(value: any): boolean {
  return value?._def?.router === true;
}

/**
 * Recursively walk the router tree and collect all procedures.
 */
function walkRouter(
  record: Record<string, any>,
  prefix: string,
  registry: Map<string, PermissionRegistryEntry>,
  pendingMutations: string[],
): void {
  for (const [key, value] of Object.entries(record)) {
    if (value == null) continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (isProcedure(value)) {
      registerProcedure(path, key, value._def, registry, pendingMutations);
    } else if (isRouter(value)) {
      walkRouter(value._def.record ?? {}, path, registry, pendingMutations);
    } else if (typeof value === 'object' && !isProcedure(value) && !isRouter(value)) {
      // Plain RouterRecord object
      walkRouter(value, path, registry, pendingMutations);
    }
  }
}

/**
 * Register a single procedure into the registry.
 * Applies the 4-priority detection chain.
 */
function registerProcedure(
  path: string,
  name: string,
  def: any,
  registry: Map<string, PermissionRegistryEntry>,
  pendingMutations: string[],
): void {
  const rawType = getProcedureType(def);
  // Skip subscription procedures — RBAC applies to queries and mutations only
  if (rawType === 'subscription') return;
  const type: 'query' | 'mutation' = rawType;

  const meta = def.meta;
  const module = getModuleFromPath(path);
  const billingSubject =
    meta?.billing?.subject ??
    meta?.subject ??
    null;

  // Priority 1: Explicit meta.permission with both action AND subject
  const declared = meta?.permission;
  if (declared?.action && declared?.subject) {
    registry.set(path, {
      path, name, type,
      permission: { action: declared.action, subject: declared.subject },
      billingSubject,
      source: 'explicit',
      module,
    });
    return;
  }

  // Priority 2: __crudSubject tag from createCrudRouter enhancement
  const crudSubject = meta?.__crudSubject;
  if (crudSubject) {
    const action = inferAction(name, type);
    if (action) {
      registry.set(path, {
        path, name, type,
        permission: { action, subject: crudSubject },
        billingSubject,
        source: 'auto-crud',
        module,
      });
      return;
    }
    // __crudSubject set but action not inferable (non-standard name) → treat as explicit subject
    registry.set(path, {
      path, name, type,
      permission: { action: name, subject: crudSubject },
      billingSubject,
      source: 'auto-crud',
      module,
    });
    return;
  }

  // Priority 3: Developer defined subject only (without complete action+subject)
  const devSubject = meta?.permission?.subject ?? meta?.subject;
  if (devSubject) {
    registry.set(path, {
      path, name, type,
      permission: { action: inferAction(name, type), subject: devSubject },
      billingSubject,
      source: 'explicit',
      module,
    });
    return;
  }

  // Priority 4: No declaration → auto-derive from module, mark pending
  registry.set(path, {
    path, name, type,
    permission: {
      action: inferAction(name, type),
      subject: moduleToSubject(module),
    },
    billingSubject,
    source: 'pending',
    module,
  });

  if (type === 'mutation' && !AUTO_CRUD_OPERATIONS.has(name)) {
    pendingMutations.push(path);
  }
}

// ─── Build & Init (Task 6.1) ───

/**
 * Scan all tRPC procedures and build the permission registry.
 *
 * Pure scan — only extracts developer-level code info.
 * Admin overrides (Settings rbac.override.{path}) are resolved at runtime.
 */
export function buildPermissionRegistry(
  appRouter: any,
): Map<string, PermissionRegistryEntry> {
  const registry = new Map<string, PermissionRegistryEntry>();
  const pendingMutations: string[] = [];

  const procedures = appRouter?._def?.procedures;
  if (procedures && typeof procedures === 'object') {
    for (const [path, proc] of Object.entries(procedures as Record<string, any>)) {
      if (!proc?._def) continue;
      const lastDot = path.lastIndexOf('.');
      const name = lastDot >= 0 ? path.slice(lastDot + 1) : path;
      registerProcedure(path, name, proc._def, registry, pendingMutations);
    }
  } else {
    const record = appRouter?._def?.record;
    if (!record) {
      console.warn('[PermissionRegistry] No _def.procedures / _def.record found on appRouter');
      return registry;
    }
    console.warn('[PermissionRegistry] _def.procedures missing, fallback to _def.record walk');
    walkRouter(record, '', registry, pendingMutations);
  }

  // Startup report: list mutations without explicit permission config
  if (pendingMutations.length > 0) {
    console.warn(
      `[RBAC] ${pendingMutations.length} mutations pending permission config:\n` +
      pendingMutations.map(p => `  - ${p}`).join('\n') +
      '\nConfigure via Admin UI or add meta.subject / meta.permission.'
    );
  }

  const explicitCount = [...registry.values()].filter(e => e.source === 'explicit').length;
  const autoCrudCount = [...registry.values()].filter(e => e.source === 'auto-crud').length;
  const pendingCount = [...registry.values()].filter(e => e.source === 'pending').length;

  console.log(
    `[PermissionRegistry] Registered ${registry.size} procedures ` +
    `(explicit: ${explicitCount}, auto-crud: ${autoCrudCount}, pending: ${pendingCount})`
  );

  return registry;
}

/**
 * Initialize the permission registry at startup.
 * Must be called after all routers (including plugin routers) are registered.
 */
export function initPermissionRegistry(appRouter: any): void {
  _registry = buildPermissionRegistry(appRouter);
}

/**
 * Rebuild the permission registry.
 * Called when plugin routers are added/removed.
 */
export function rebuildPermissionRegistry(appRouter: any): void {
  _registry = buildPermissionRegistry(appRouter);
}

// ─── Subject Summary for Resource Tree Integration ───

export interface RegistryActions {
  actions: string[];
}

export interface SubjectSummary {
  subject: string;
  module: string | null;
  actions: string[];
  procedureCount: number;
  /** Plugin-declared quick-select action groups (from manifest) */
  actionGroups?: readonly ActionGroupDef[];
}

/** Manifest-declared action group (matches manifest schema) */
export interface ActionGroupDef {
  key: string;
  label: string;
  actions: readonly string[];
}

/**
 * Get actions for ALL subjects in the Registry.
 * Used to overlay real procedure names onto RESOURCE_DEFINITIONS nodes,
 * replacing abstract CASL actions ('read', 'manage') with actual procedure names.
 */
export function getRegistryActionsBySubject(): Map<string, RegistryActions> {
  if (!_registry) return new Map();

  const subjectMap = new Map<string, Set<string>>();

  for (const entry of _registry.values()) {
    const subject = entry.permission.subject;
    let actions = subjectMap.get(subject);
    if (!actions) {
      actions = new Set();
      subjectMap.set(subject, actions);
    }
    actions.add(entry.permission.action);
  }

  const result = new Map<string, RegistryActions>();
  for (const [subject, actions] of subjectMap) {
    result.set(subject, { actions: Array.from(actions) });
  }
  return result;
}

/**
 * Get aggregated subject summary from the Permission Registry.
 * Returns subjects NOT already present in the provided known set.
 * Used by getResourceTree to merge auto-discovered subjects.
 */
export function getRegistrySubjectSummary(
  knownSubjects: ReadonlySet<string>,
): SubjectSummary[] {
  if (!_registry) return [];

  const subjectMap = new Map<string, {
    module: string | null;
    actions: Set<string>;
    count: number;
  }>();

  for (const entry of _registry.values()) {
    const subject = entry.permission.subject;
    if (knownSubjects.has(subject)) continue;

    let info = subjectMap.get(subject);
    if (!info) {
      info = { module: entry.module, actions: new Set(), count: 0 };
      subjectMap.set(subject, info);
    }
    info.actions.add(entry.permission.action);
    info.count++;
  }

  return Array.from(subjectMap.entries()).map(([subject, info]) => {
    // Merge plugin-declared actionGroups (validated against registered actions)
    const pluginGroups = getPluginActionGroups(subject);
    const registeredActions = info.actions;
    let validGroups: ActionGroupDef[] | undefined;

    if (pluginGroups && pluginGroups.length > 0) {
      validGroups = pluginGroups
        .map(g => ({
          ...g,
          // Filter out actions not actually registered (manifest drift protection)
          actions: g.actions.filter(a => registeredActions.has(a)),
        }))
        .filter(g => g.actions.length > 0);

      if (validGroups.length === 0) validGroups = undefined;
    }

    const summary: SubjectSummary = {
      subject,
      module: info.module,
      actions: Array.from(info.actions),
      procedureCount: info.count,
    };
    if (validGroups) {
      summary.actionGroups = validGroups;
    }
    return summary;
  });
}

// ─── Plugin ActionGroups Store ───

/**
 * In-memory store for plugin-declared actionGroups from manifest.
 * Keyed by subject name → array of action group definitions.
 * Populated by PluginManager during plugin loading.
 */
const _pluginActionGroups = new Map<string, ActionGroupDef[]>();

/**
 * Register action groups from a plugin's manifest.
 * Called by PluginManager after loading manifest.
 *
 * @param pluginId - Plugin identifier (for logging/cleanup)
 * @param actionGroups - Map of subject → group definitions from manifest
 */
export function registerPluginActionGroups(
  pluginId: string,
  actionGroups: Record<string, Array<{ key: string; label: string; actions: string[] }>>,
): void {
  for (const [subject, groups] of Object.entries(actionGroups)) {
    const existing = _pluginActionGroups.get(subject);
    if (existing) {
      console.warn(
        `[PermissionRegistry] ActionGroups for subject '${subject}' already registered, ` +
        `overwriting with plugin '${pluginId}'`,
      );
    }
    _pluginActionGroups.set(subject, groups);
  }
}

/**
 * Unregister action groups for a plugin.
 * Called by PluginManager during plugin unload.
 */
export function unregisterPluginActionGroups(
  _pluginId: string,
  actionGroups: Record<string, unknown> | undefined,
): void {
  if (!actionGroups) return;
  for (const subject of Object.keys(actionGroups)) {
    _pluginActionGroups.delete(subject);
  }
}

/**
 * Get action groups for a specific subject.
 */
function getPluginActionGroups(subject: string): ActionGroupDef[] | undefined {
  return _pluginActionGroups.get(subject);
}
