/**
 * Infra Policy Guard v2 — Unit Tests
 *
 * Verifies Section 8 tasks 8.1–8.9:
 * - Context Swap (resolveEffectiveOrg) scenarios
 * - WRITE guard (enforceInfraPolicy) scenarios
 * - Meta-operation bypass (BYPASS_PROCEDURES)
 * - Settings fail-fast (assertSettingsReady)
 * - Policy mode cache lifecycle
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getModuleFromPath,
  getProcedureNameFromPath,
  BYPASS_PROCEDURES,
  getMode,
  enforceInfraPolicy,
  resolveEffectiveOrg,
  initInfraPolicySettings,
  refreshPolicyMode,
  reloadAllPolicyModes,
  setCustomizationFlag,
  hasCustomData,
  WRITE_ACTIONS,
} from '../../trpc/infra-policy-guard.js';
import type { SettingsService } from '../../settings/settings.service.js';

// ─── Mock SettingsService ───

function createMockSettings(
  store: Record<string, unknown> = {},
): SettingsService {
  const data = new Map<string, unknown>(Object.entries(store));

  return {
    get: vi.fn(async (_scope: string, key: string, opts?: { organizationId?: string; defaultValue?: unknown }) => {
      // Tenant-scoped keys include organizationId
      const compositeKey = opts?.organizationId ? `${_scope}:${opts.organizationId}:${key}` : `${_scope}:${key}`;
      return data.get(compositeKey) ?? opts?.defaultValue ?? null;
    }),
    set: vi.fn(async (_scope: string, key: string, value: unknown, opts?: { organizationId?: string }) => {
      const compositeKey = opts?.organizationId ? `${_scope}:${opts.organizationId}:${key}` : `${_scope}:${key}`;
      data.set(compositeKey, value);
    }),
    list: vi.fn(async (_scope: string, opts?: { keyPrefix?: string }) => {
      const prefix = opts?.keyPrefix ?? '';
      const results: Array<{ key: string; value: unknown }> = [];
      for (const [k, v] of data) {
        // list operates on global scope — key starts with prefix
        if (_scope === 'global' && k.startsWith(`global:${prefix}`)) {
          results.push({ key: k.replace('global:', ''), value: v });
        }
      }
      return results;
    }),
    delete: vi.fn(),
  } as unknown as SettingsService;
}

// ─── Path Extraction Tests ───

describe('getModuleFromPath', () => {
  it('extracts module from simple path', () => {
    expect(getModuleFromPath('currency.list')).toBe('currency');
  });

  it('extracts module from nested path', () => {
    expect(getModuleFromPath('currency.rates.list')).toBe('currency');
  });

  it('extracts pluginId from plugin path', () => {
    expect(getModuleFromPath('pluginApis.lbac-teams.members.invite')).toBe('lbac-teams');
  });

  it('returns null for root-level path', () => {
    expect(getModuleFromPath('health')).toBeNull();
  });
});

describe('getProcedureNameFromPath', () => {
  it('extracts last segment', () => {
    expect(getProcedureNameFromPath('currency.switchToCustom')).toBe('switchToCustom');
  });

  it('returns full path if no dots', () => {
    expect(getProcedureNameFromPath('health')).toBe('health');
  });
});

// ─── Task 8.6: Meta-operation bypass ───

describe('BYPASS_PROCEDURES (Task 8.6)', () => {
  it('includes switchToCustom', () => {
    expect(BYPASS_PROCEDURES.has('switchToCustom')).toBe(true);
  });

  it('includes resetToPlatform', () => {
    expect(BYPASS_PROCEDURES.has('resetToPlatform')).toBe(true);
  });

  it('does not include regular operations', () => {
    expect(BYPASS_PROCEDURES.has('list')).toBe(false);
    expect(BYPASS_PROCEDURES.has('create')).toBe(false);
  });
});

// ─── Task 8.7: Settings fail-fast ───

describe('Settings fail-fast (Task 8.7)', () => {
  it('getMode returns require_tenant when no policy configured', async () => {
    const settings = createMockSettings();
    await initInfraPolicySettings(settings);
    expect(getMode('unknown-module')).toBe('require_tenant');
  });
});

// ─── Task 8.9: Policy mode cache lifecycle ───

describe('Policy mode cache lifecycle (Task 8.9)', () => {
  it('loads all policies at startup', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'global:infra.policy.storage': 'unified',
    });
    await initInfraPolicySettings(settings);

    expect(getMode('currency')).toBe('allow_override');
    expect(getMode('storage')).toBe('unified');
  });

  it('refreshes single module on Admin change', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
    });
    await initInfraPolicySettings(settings);
    expect(getMode('currency')).toBe('allow_override');

    // Admin changes currency policy to unified
    (settings.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (_scope: string, key: string) => {
        if (key === 'infra.policy.currency') return 'unified';
        return null;
      },
    );
    await refreshPolicyMode('currency');
    expect(getMode('currency')).toBe('unified');
  });

  it('full reload clears and reloads all policies', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'global:infra.policy.storage': 'unified',
    });
    await initInfraPolicySettings(settings);

    expect(getMode('currency')).toBe('allow_override');
    expect(getMode('storage')).toBe('unified');

    // Simulate plugin uninstall: remove storage policy, add new one
    (settings.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: 'infra.policy.currency', value: 'unified' },
      { key: 'infra.policy.media', value: 'require_tenant' },
    ]);
    await reloadAllPolicyModes();

    expect(getMode('currency')).toBe('unified');
    expect(getMode('media')).toBe('require_tenant');
    expect(getMode('storage')).toBe('require_tenant'); // removed, falls back to default
  });
});

// ─── Task 8.1-8.3: Context Swap (resolveEffectiveOrg) ───

describe('Context Swap — resolveEffectiveOrg (Tasks 8.1-8.3)', () => {
  beforeEach(async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'global:infra.policy.storage': 'unified',
    });
    await initInfraPolicySettings(settings);
  });

  it('8.1: allow_override + has custom → tenant data', async () => {
    // Mock hasCustomData to return true
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'tenant:org-1:infra.customized.currency': true,
    });
    await initInfraPolicySettings(settings);

    const result = await resolveEffectiveOrg('currency', 'org-1');
    expect(result).toBe('org-1');
  });

  it('8.2: allow_override + no custom → platform data', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
    });
    await initInfraPolicySettings(settings);

    const result = await resolveEffectiveOrg('currency', 'org-1');
    expect(result).toBe('platform');
  });

  it('8.3: unified → platform data', async () => {
    const result = await resolveEffectiveOrg('storage', 'org-1');
    expect(result).toBe('platform');
  });

  it('platform user always resolves to platform', async () => {
    const result = await resolveEffectiveOrg('currency', 'platform');
    expect(result).toBe('platform');
  });

  it('require_tenant → tenant data', async () => {
    const result = await resolveEffectiveOrg('unknown-module', 'org-1');
    expect(result).toBe('org-1');
  });
});

// ─── Task 8.4-8.5: WRITE guard (enforceInfraPolicy) ───

describe('WRITE guard — enforceInfraPolicy (Tasks 8.4-8.5)', () => {
  beforeEach(async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'global:infra.policy.storage': 'unified',
    });
    await initInfraPolicySettings(settings);
  });

  it('8.4: unified + tenant → blocks WRITE', async () => {
    await expect(
      enforceInfraPolicy('storage', 'org-1', 'create'),
    ).rejects.toThrow('Configuration is managed by the platform');
  });

  it('8.4: unified blocks all WRITE actions', async () => {
    for (const action of ['create', 'update', 'delete', 'manage']) {
      await expect(
        enforceInfraPolicy('storage', 'org-1', action),
      ).rejects.toThrow('Configuration is managed by the platform');
    }
  });

  it('8.5: allow_override + no custom → blocks WRITE', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      // no customization flag set
    });
    await initInfraPolicySettings(settings);

    await expect(
      enforceInfraPolicy('currency', 'org-1', 'create'),
    ).rejects.toThrow('Switch to custom configuration first');
  });

  it('allow_override + has custom → allows WRITE', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
      'tenant:org-1:infra.customized.currency': true,
    });
    await initInfraPolicySettings(settings);

    // Should not throw
    await enforceInfraPolicy('currency', 'org-1', 'create');
  });

  it('platform user is never blocked', async () => {
    await enforceInfraPolicy('storage', 'platform', 'create');
    // No throw = pass
  });

  it('READ actions are never blocked', async () => {
    await enforceInfraPolicy('storage', 'org-1', 'read');
    // No throw = pass
  });

  it('require_tenant always allows writes', async () => {
    await enforceInfraPolicy('unknown-module', 'org-1', 'create');
    // No throw = pass
  });
});

// ─── Task 8.8: Public route auto Context Swap ───

describe('Public route Context Swap (Task 8.8)', () => {
  it('resolveEffectiveOrg works for any caller (no auth check)', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'unified',
    });
    await initInfraPolicySettings(settings);

    // Public route with a tenant org → should still swap to platform
    const result = await resolveEffectiveOrg('currency', 'org-public');
    expect(result).toBe('platform');
  });
});

// ─── WRITE_ACTIONS set ───

describe('WRITE_ACTIONS', () => {
  it('includes standard write actions', () => {
    expect(WRITE_ACTIONS.has('create')).toBe(true);
    expect(WRITE_ACTIONS.has('update')).toBe(true);
    expect(WRITE_ACTIONS.has('delete')).toBe(true);
    expect(WRITE_ACTIONS.has('manage')).toBe(true);
  });

  it('excludes read actions', () => {
    expect(WRITE_ACTIONS.has('read')).toBe(false);
    expect(WRITE_ACTIONS.has('list')).toBe(false);
  });
});

// ─── Customization flag ───

describe('setCustomizationFlag / hasCustomData', () => {
  it('setting flag makes hasCustomData return true', async () => {
    const settings = createMockSettings({
      'global:infra.policy.currency': 'allow_override',
    });
    await initInfraPolicySettings(settings);

    // Initially no custom data
    expect(await hasCustomData('currency', 'org-1')).toBe(false);

    // Set customization flag
    await setCustomizationFlag('currency', 'org-1', true);

    // Now hasCustomData returns true
    expect(await hasCustomData('currency', 'org-1')).toBe(true);
  });
});
