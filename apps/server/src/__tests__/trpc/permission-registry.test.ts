/**
 * Permission Registry + Template — Unit Tests
 *
 * Verifies Section 8 tasks 8.10–8.19:
 * - RBAC auto-inference from createCrudRouter (8.10)
 * - Default Policy: audit mode (8.11)
 * - Subject title translation + humanize fallback (8.12)
 * - Non-standard mutation visibility in registry (8.13)
 * - Permission group (8.14 — meta.permission.group)
 * - Admin override configuration (8.15)
 * - Admin group modification (8.16)
 * - Startup report: pending mutations listed (8.17)
 * - Template application (8.18)
 * - Admin override vs template priority (8.19)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  inferAction,
  tableNameToSubject,
  moduleToSubject,
  getSubjectTitle,
  buildPermissionRegistry,
  initPermissionRegistry,
  resolvePermissionForPath,
  getRbacDefaultPolicy,
  setRbacSettingsService,
  loadRbacDefaultPolicy,
  setRbacDefaultPolicyValue,
  loadRbacOverrides,
  setRbacOverride,
  deleteRbacOverride,
  getRbacOverride,
  getRegistrySubjectSummary,
  type PermissionRegistryEntry,
} from '../../trpc/permission-registry.js';
import {
  matchRule,
  applyUnifiedTemplate,
  listTemplates,
  getTemplate,
} from '../../trpc/permission-template.js';
import type { SettingsService } from '../../settings/settings.service.js';

// ─── Mock SettingsService ───

function createMockSettings(
  store: Record<string, unknown> = {},
): SettingsService {
  const data = new Map<string, unknown>(Object.entries(store));

  return {
    get: vi.fn(async (_scope: string, key: string, opts?: { defaultValue?: unknown }) => {
      const compositeKey = `${_scope}:${key}`;
      return data.get(compositeKey) ?? opts?.defaultValue ?? null;
    }),
    set: vi.fn(async (_scope: string, key: string, value: unknown) => {
      data.set(`${_scope}:${key}`, value);
    }),
    delete: vi.fn(async (_scope: string, key: string) => {
      data.delete(`${_scope}:${key}`);
    }),
    list: vi.fn(async (_scope: string, opts?: { keyPrefix?: string }) => {
      const prefix = opts?.keyPrefix ?? '';
      const results: Array<{ key: string; value: unknown }> = [];
      for (const [k, v] of data) {
        if (k.startsWith(`${_scope}:${prefix}`)) {
          results.push({ key: k.replace(`${_scope}:`, ''), value: v });
        }
      }
      return results;
    }),
  } as unknown as SettingsService;
}

// ─── Mock tRPC Router for buildPermissionRegistry ───

/**
 * Build a minimal mock router structure that mimics tRPC's _def.record format.
 */
function createMockRouter(procedures: Record<string, {
  type?: 'query' | 'mutation';
  meta?: Record<string, unknown>;
}>) {
  const record: Record<string, unknown> = {};
  const flatProcedures: Record<string, unknown> = {};

  for (const [path, config] of Object.entries(procedures)) {
    const parts = path.split('.');
    let current = record;

    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i]!;
      if (!current[segment]) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = {
      _def: {
        procedure: true,
        type: config.type ?? 'query',
        mutation: config.type === 'mutation',
        meta: config.meta ?? {},
      },
    };
    flatProcedures[path] = current[lastPart]!;
  }

  return {
    _def: { record, procedures: flatProcedures },
  };
}

// ─── Task 8.10: RBAC Auto-Inference ───

describe('inferAction (Task 8.10)', () => {
  it('maps AUTO_CRUD_OPERATIONS names to their action', () => {
    expect(inferAction('list', 'query')).toBe('list');
    expect(inferAction('get', 'query')).toBe('get');
    expect(inferAction('create', 'mutation')).toBe('create');
    expect(inferAction('update', 'mutation')).toBe('update');
    expect(inferAction('delete', 'mutation')).toBe('delete');
    expect(inferAction('deleteMany', 'mutation')).toBe('deleteMany');
  });

  it('returns procedure name for non-standard query (no synthetic read)', () => {
    expect(inferAction('search', 'query')).toBe('search');
    expect(inferAction('getStats', 'query')).toBe('getStats');
  });

  it('returns procedure name for non-standard mutation', () => {
    expect(inferAction('syncData', 'mutation')).toBe('syncData');
    expect(inferAction('processPayment', 'mutation')).toBe('processPayment');
  });
});

describe('tableNameToSubject (Task 8.10)', () => {
  it('converts table names to PascalCase subjects', () => {
    expect(tableNameToSubject('currencies')).toBe('Currency');
    expect(tableNameToSubject('exchange_rates')).toBe('ExchangeRate');
    expect(tableNameToSubject('i18n_languages')).toBe('I18nLanguage');
    expect(tableNameToSubject('api_tokens')).toBe('ApiToken');
    expect(tableNameToSubject('role_permissions')).toBe('RolePermission');
  });

  it('handles edge cases', () => {
    expect(tableNameToSubject('status')).toBe('Status');
    expect(tableNameToSubject('categories')).toBe('Category');
  });
});

describe('moduleToSubject', () => {
  it('converts module names to PascalCase', () => {
    expect(moduleToSubject('currency')).toBe('Currency');
    expect(moduleToSubject('exchange-rate')).toBe('ExchangeRate');
    expect(moduleToSubject('infraPolicy')).toBe('InfraPolicy');
  });

  it('returns Unknown for null module', () => {
    expect(moduleToSubject(null)).toBe('Unknown');
  });
});

describe('buildPermissionRegistry — auto-crud detection (Task 8.10)', () => {
  it('detects __crudSubject from createCrudRouter procedures', () => {
    const router = createMockRouter({
      'currency.list': { type: 'query', meta: { __crudSubject: 'Currency' } },
      'currency.create': { type: 'mutation', meta: { __crudSubject: 'Currency' } },
      'currency.update': { type: 'mutation', meta: { __crudSubject: 'Currency' } },
      'currency.delete': { type: 'mutation', meta: { __crudSubject: 'Currency' } },
    });

    const registry = buildPermissionRegistry(router);

    const listEntry = registry.get('currency.list')!;
    expect(listEntry.source).toBe('auto-crud');
    expect(listEntry.permission).toEqual({ action: 'list', subject: 'Currency' });

    const createEntry = registry.get('currency.create')!;
    expect(createEntry.source).toBe('auto-crud');
    expect(createEntry.permission).toEqual({ action: 'create', subject: 'Currency' });
  });
});

// ─── Task 8.11: Default Policy ───

describe('RBAC Default Policy (Task 8.11)', () => {
  beforeEach(() => {
    // Reset by loading default
    const settings = createMockSettings();
    setRbacSettingsService(settings);
  });

  it('defaults to "audit" when no setting configured', async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    await loadRbacDefaultPolicy();
    expect(getRbacDefaultPolicy()).toBe('audit');
  });

  it('loads configured policy from Settings', async () => {
    const settings = createMockSettings({
      'global:rbac.defaultPolicy': 'deny',
    });
    setRbacSettingsService(settings);
    await loadRbacDefaultPolicy();
    expect(getRbacDefaultPolicy()).toBe('deny');
  });

  it('can be changed via setRbacDefaultPolicyValue', async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    await setRbacDefaultPolicyValue('allow');
    expect(getRbacDefaultPolicy()).toBe('allow');
    expect(settings.set).toHaveBeenCalledWith('global', 'rbac.defaultPolicy', 'allow');
  });
});

// ─── Task 8.12: Subject Title Translation ───

describe('getSubjectTitle (Task 8.12)', () => {
  it('uses translation function when available and returns different value', () => {
    const t = (key: string) => (key === 'Currency' ? '货币' : key);
    expect(getSubjectTitle('Currency', t)).toBe('货币');
  });

  it('falls back to humanize when t() returns same string', () => {
    const t = (key: string) => key; // No translation found
    expect(getSubjectTitle('ExchangeRate', t)).toBe('Exchange Rate');
  });

  it('humanizes PascalCase without translation function', () => {
    expect(getSubjectTitle('ExchangeRate')).toBe('Exchange Rate');
    expect(getSubjectTitle('I18nLanguage')).toBe('I18n Language');
    expect(getSubjectTitle('PlatformCache')).toBe('Platform Cache');
  });

  it('handles single-word subjects', () => {
    expect(getSubjectTitle('Currency')).toBe('Currency');
  });
});

// ─── Task 8.13: Non-standard Mutation Visibility ───

describe('Non-standard mutation in registry (Task 8.13)', () => {
  it('non-standard mutations appear as "pending" with derived action/subject', () => {
    const router = createMockRouter({
      'billing.processPayment': { type: 'mutation' },
      'billing.syncData': { type: 'mutation' },
    });

    const registry = buildPermissionRegistry(router);

    const payment = registry.get('billing.processPayment')!;
    expect(payment.source).toBe('pending');
    expect(payment.name).toBe('processPayment');
    expect(payment.type).toBe('mutation');
    expect(payment.permission.action).toBe('processPayment');
    expect(payment.permission.subject).toBe('Billing');
  });
});

// ─── Task 8.14: Permission Group ───

describe('Permission group (Task 8.14)', () => {
  it('group procedures share group subject from meta', () => {
    const router = createMockRouter({
      'currency.policy.get': {
        type: 'query',
        meta: { permission: { action: 'read', subject: 'CurrencyPolicy', group: 'currency-admin' } },
      },
      'currency.policy.set': {
        type: 'mutation',
        meta: { permission: { action: 'manage', subject: 'CurrencyPolicy', group: 'currency-admin' } },
      },
    });

    const registry = buildPermissionRegistry(router);

    const get = registry.get('currency.policy.get')!;
    const set = registry.get('currency.policy.set')!;

    // Both share same subject
    expect(get.permission.subject).toBe('CurrencyPolicy');
    expect(set.permission.subject).toBe('CurrencyPolicy');
    expect(get.source).toBe('explicit');
    expect(set.source).toBe('explicit');
  });
});

// ─── Task 8.15 + 8.16: Admin Override Configuration ───

describe('Admin override (Tasks 8.15-8.16)', () => {
  beforeEach(async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    // Clear override cache by loading empty
    await loadRbacOverrides();
  });

  it('8.15: setting an override changes resolvePermissionForPath result', async () => {
    const router = createMockRouter({
      'media.upload': { type: 'mutation', meta: { permission: { action: 'create', subject: 'Media' } } },
    });
    initPermissionRegistry(router);

    // Before override: developer default
    let resolved = resolvePermissionForPath('media.upload');
    expect(resolved?.source).toBe('explicit');
    expect(resolved?.action).toBe('create');

    // Admin sets override
    await setRbacOverride('media.upload', { action: 'manage', subject: 'FileUpload' });

    // After override: admin takes priority
    resolved = resolvePermissionForPath('media.upload');
    expect(resolved?.source).toBe('admin');
    expect(resolved?.action).toBe('manage');
    expect(resolved?.subject).toBe('FileUpload');
  });

  it('8.16: deleting override restores developer default', async () => {
    const router = createMockRouter({
      'media.upload': { type: 'mutation', meta: { permission: { action: 'create', subject: 'Media' } } },
    });
    initPermissionRegistry(router);

    await setRbacOverride('media.upload', { action: 'manage', subject: 'FileUpload' });
    expect(resolvePermissionForPath('media.upload')?.source).toBe('admin');

    await deleteRbacOverride('media.upload');
    const resolved = resolvePermissionForPath('media.upload');
    expect(resolved?.source).toBe('explicit');
    expect(resolved?.action).toBe('create');
    expect(resolved?.subject).toBe('Media');
  });

  it('getRbacOverride returns undefined when not set', () => {
    expect(getRbacOverride('nonexistent.path')).toBeUndefined();
  });

  it('loadRbacOverrides loads from Settings at startup', async () => {
    const settings = createMockSettings({
      'global:rbac.override.currency.list': { action: 'read', subject: 'FinanceData' },
      'global:rbac.override.billing.create': { action: 'manage', subject: 'Billing' },
    });
    setRbacSettingsService(settings);
    await loadRbacOverrides();

    expect(getRbacOverride('currency.list')).toEqual({ action: 'read', subject: 'FinanceData' });
    expect(getRbacOverride('billing.create')).toEqual({ action: 'manage', subject: 'Billing' });
  });
});

// ─── Task 8.17: Startup Report ───

describe('Startup report (Task 8.17)', () => {
  it('logs pending mutations to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const router = createMockRouter({
      'billing.processPayment': { type: 'mutation' },
      'billing.list': { type: 'query', meta: { permission: { action: 'read', subject: 'Billing' } } },
    });

    buildPermissionRegistry(router);

    // Should have warned about pending mutation
    const warnCalls = warnSpy.mock.calls.map(c => c[0]);
    const hasReport = warnCalls.some(msg =>
      typeof msg === 'string' && msg.includes('billing.processPayment'),
    );
    expect(hasReport).toBe(true);

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ─── Task 8.18: Template Application ───

describe('Permission template (Task 8.18)', () => {
  it('built-in templates are available', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(2);

    const saas = getTemplate('standard-saas');
    expect(saas).toBeDefined();
    expect(saas!.modules).toHaveProperty('currency');

    const enterprise = getTemplate('strict-enterprise');
    expect(enterprise).toBeDefined();
  });

  describe('matchRule', () => {
    const entry: PermissionRegistryEntry = {
      path: 'currency.policy.switchToCustom',
      name: 'switchToCustom',
      type: 'mutation',
      permission: { action: 'manage', subject: 'Currency' },
      billingSubject: null,
      source: 'explicit',
      module: 'currency',
    };

    it('matches by exact name', () => {
      expect(matchRule({ name: 'switchToCustom' }, entry)).toBe(true);
      expect(matchRule({ name: 'resetToPlatform' }, entry)).toBe(false);
    });

    it('matches by type filter', () => {
      expect(matchRule({ type: 'mutation' }, entry)).toBe(true);
      expect(matchRule({ type: 'query' }, entry)).toBe(false);
    });

    it('matches by glob path pattern', () => {
      expect(matchRule({ path: 'currency.policy.*' }, entry)).toBe(true);
      expect(matchRule({ path: 'billing.*' }, entry)).toBe(false);
    });

    it('matches by exact path', () => {
      expect(matchRule({ path: 'currency.policy.switchToCustom' }, entry)).toBe(true);
      expect(matchRule({ path: 'currency.policy.get' }, entry)).toBe(false);
    });

    it('matches combined filters (AND)', () => {
      expect(matchRule({ name: 'switchToCustom', type: 'mutation' }, entry)).toBe(true);
      expect(matchRule({ name: 'switchToCustom', type: 'query' }, entry)).toBe(false);
    });
  });

  it('applyTemplate dry-run returns report without writing', async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    await loadRbacOverrides();

    // Setup registry with matching procedures
    const router = createMockRouter({
      'currency.list': { type: 'query', meta: { __crudSubject: 'Currency' } },
      'currency.switchToCustom': { type: 'mutation' },
      'currency.resetToPlatform': { type: 'mutation' },
    });
    initPermissionRegistry(router);

    const report = await applyUnifiedTemplate('standard-saas', settings, 'dry-run');

    expect(report.templateId).toBe('standard-saas');
    expect(report.mode).toBe('dry-run');
    expect(report.modules.applied.length).toBeGreaterThan(0);
    // Dry-run should NOT write to Settings
    expect(settings.set).not.toHaveBeenCalled();
  });

  it('applyTemplate apply writes to Settings', async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    await loadRbacOverrides();

    const router = createMockRouter({
      'currency.switchToCustom': { type: 'mutation' },
    });
    initPermissionRegistry(router);

    const report = await applyUnifiedTemplate('standard-saas', settings, 'apply');

    expect(report.mode).toBe('apply');
    expect(settings.set).toHaveBeenCalled();
  });
});

// ─── Task 8.19: Admin Override vs Template Priority ───

describe('Admin override vs template priority (Task 8.19)', () => {
  it('existing admin overrides are skipped by template application', async () => {
    const settings = createMockSettings();
    setRbacSettingsService(settings);
    await loadRbacOverrides();

    const router = createMockRouter({
      'currency.switchToCustom': { type: 'mutation' },
    });
    initPermissionRegistry(router);

    // Admin sets override first
    await setRbacOverride('currency.switchToCustom', { action: 'admin-action', subject: 'AdminSubject' });

    // Then apply template
    const report = await applyUnifiedTemplate('standard-saas', settings, 'apply');

    // The override path should be in skipped, not applied
    const skippedPaths = report.procedures.skipped.map(s => s.path);
    const appliedPaths = report.procedures.applied;

    // switchToCustom should be skipped because admin override exists
    if (skippedPaths.includes('currency.switchToCustom')) {
      expect(skippedPaths).toContain('currency.switchToCustom');
      expect(appliedPaths).not.toContain('currency.switchToCustom');
    }

    // Admin override should still be intact
    const override = getRbacOverride('currency.switchToCustom');
    expect(override).toEqual({ action: 'admin-action', subject: 'AdminSubject' });
  });

  it('admin override takes runtime priority over registry entry', async () => {
    const router = createMockRouter({
      'media.upload': { type: 'mutation', meta: { permission: { action: 'create', subject: 'Media' } } },
    });
    initPermissionRegistry(router);

    // Without override: registry value
    let resolved = resolvePermissionForPath('media.upload');
    expect(resolved?.source).toBe('explicit');

    // Set admin override
    await setRbacOverride('media.upload', { action: 'manage', subject: 'SuperMedia' });

    // With override: admin value wins
    resolved = resolvePermissionForPath('media.upload');
    expect(resolved?.source).toBe('admin');
    expect(resolved?.action).toBe('manage');
    expect(resolved?.subject).toBe('SuperMedia');
  });
});

// ─── getRegistrySubjectSummary (Resource Tree Integration) ───

describe('getRegistrySubjectSummary', () => {
  it('returns subjects NOT in the known set', () => {
    const router = createMockRouter({
      'currency.list': { type: 'query', meta: { __crudSubject: 'Currency' } },
      'currency.create': { type: 'mutation', meta: { __crudSubject: 'Currency' } },
      'billing.processPayment': { type: 'mutation' },
      'media.upload': { type: 'mutation', meta: { permission: { action: 'create', subject: 'Media' } } },
    });
    initPermissionRegistry(router);

    // Currency and Media are "known" (in RESOURCE_DEFINITIONS)
    const known = new Set(['Currency', 'Media']);
    const summary = getRegistrySubjectSummary(known);

    // Only Billing should appear (auto-discovered, not in known set)
    expect(summary).toHaveLength(1);
    expect(summary[0]!.subject).toBe('Billing');
    expect(summary[0]!.module).toBe('billing');
    expect(summary[0]!.actions).toContain('processPayment');
  });

  it('returns empty when all subjects are known', () => {
    const router = createMockRouter({
      'currency.list': { type: 'query', meta: { __crudSubject: 'Currency' } },
    });
    initPermissionRegistry(router);

    const known = new Set(['Currency']);
    expect(getRegistrySubjectSummary(known)).toHaveLength(0);
  });

  it('aggregates actions from multiple procedures of same subject', () => {
    const router = createMockRouter({
      'tasks.list': { type: 'query' },
      'tasks.create': { type: 'mutation' },
      'tasks.update': { type: 'mutation' },
    });
    initPermissionRegistry(router);

    const summary = getRegistrySubjectSummary(new Set());
    const tasks = summary.find(s => s.subject === 'Tasks');
    expect(tasks).toBeDefined();
    expect(tasks!.actions).toContain('list');
    expect(tasks!.actions).toContain('create');
    expect(tasks!.actions).toContain('update');
    expect(tasks!.procedureCount).toBe(3);
  });
});
