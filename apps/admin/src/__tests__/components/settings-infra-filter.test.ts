/**
 * Settings Page Infra Filter Logic Tests (Task 7.7)
 *
 * Tests the batchGetVisibility-driven filtering logic:
 * - Infrastructure plugins with 'unified' mode hidden for tenants
 * - Platform org always sees all tabs
 * - Non-infrastructure plugins (mode: null) always visible
 * - Static visibility filter works with infra dynamic filter
 */
import { describe, it, expect } from 'vitest';

// ─── Extract the pure filter logic for testing ───

type InfraPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

interface InfraVisibility {
  pluginId: string;
  mode: InfraPolicyMode | null;
  hasCustomConfig: boolean;
}

interface SettingsTarget {
  visibility?: 'platform' | 'all';
}

interface PluginEntry {
  extension: {
    id: string;
    pluginId: string;
    label: string;
    component: unknown;
  };
  target: SettingsTarget;
}

/**
 * Replicates the static visibility filter from Settings.tsx line 83-86
 */
function staticFilter(entries: PluginEntry[], isPlatformOrg: boolean): PluginEntry[] {
  return entries.filter((entry) => {
    const visibility = entry.target.visibility ?? 'all';
    return visibility === 'all' || (visibility === 'platform' && isPlatformOrg);
  });
}

/**
 * Replicates the dynamic infra policy filter from Settings.tsx line 99-104
 */
function infraFilter(
  entries: PluginEntry[],
  infraVisibilityMap: Map<string, InfraVisibility>,
  isPlatformOrg: boolean,
): PluginEntry[] {
  return entries.filter((entry) => {
    if (isPlatformOrg) return true;
    const vis = infraVisibilityMap.get(entry.extension.pluginId);
    if (!vis || vis.mode === null) return true; // Not infrastructure — show normally
    return vis.mode !== 'unified'; // Hide unified-mode infra plugins for tenants
  });
}

// ─── Test data ───

const s3Plugin: PluginEntry = {
  extension: { id: 'ext-s3', pluginId: 'storage-s3', label: 'S3 Storage', component: null },
  target: { visibility: 'all' },
};

const emailPlugin: PluginEntry = {
  extension: { id: 'ext-email', pluginId: 'email-provider', label: 'Email Provider', component: null },
  target: { visibility: 'all' },
};

const platformOnlyPlugin: PluginEntry = {
  extension: { id: 'ext-platform', pluginId: 'internal-tool', label: 'Internal Tool', component: null },
  target: { visibility: 'platform' },
};

const nonInfraPlugin: PluginEntry = {
  extension: { id: 'ext-hello', pluginId: 'hello-world', label: 'Hello World', component: null },
  target: { visibility: 'all' },
};

describe('Settings Page Infra Filter Logic (Task 7.7)', () => {
  describe('staticFilter', () => {
    it('should show "all" visibility plugins to everyone', () => {
      const result = staticFilter([s3Plugin, nonInfraPlugin], false);
      expect(result).toHaveLength(2);
    });

    it('should hide "platform" visibility plugins from tenants', () => {
      const result = staticFilter([s3Plugin, platformOnlyPlugin, nonInfraPlugin], false);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.extension.pluginId)).not.toContain('internal-tool');
    });

    it('should show "platform" visibility plugins to platform org', () => {
      const result = staticFilter([s3Plugin, platformOnlyPlugin, nonInfraPlugin], true);
      expect(result).toHaveLength(3);
    });

    it('should default to "all" when visibility is not set', () => {
      const noVisPlugin: PluginEntry = {
        extension: { id: 'ext-x', pluginId: 'x', label: 'X', component: null },
        target: {},
      };
      const result = staticFilter([noVisPlugin], false);
      expect(result).toHaveLength(1);
    });
  });

  describe('infraFilter', () => {
    it('should hide unified-mode infra plugins from tenants', () => {
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false }],
      ]);
      const result = infraFilter([s3Plugin, nonInfraPlugin], map, false);
      expect(result).toHaveLength(1);
      expect(result[0]!.extension.pluginId).toBe('hello-world');
    });

    it('should show allow_override infra plugins to tenants', () => {
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'allow_override', hasCustomConfig: false }],
      ]);
      const result = infraFilter([s3Plugin, nonInfraPlugin], map, false);
      expect(result).toHaveLength(2);
    });

    it('should show require_tenant infra plugins to tenants', () => {
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'require_tenant', hasCustomConfig: false }],
      ]);
      const result = infraFilter([s3Plugin, nonInfraPlugin], map, false);
      expect(result).toHaveLength(2);
    });

    it('should always show all plugins to platform org regardless of mode', () => {
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false }],
        ['email-provider', { pluginId: 'email-provider', mode: 'unified', hasCustomConfig: false }],
      ]);
      const result = infraFilter([s3Plugin, emailPlugin, nonInfraPlugin], map, true);
      expect(result).toHaveLength(3);
    });

    it('should show plugins with mode: null (non-infrastructure) to tenants', () => {
      const map = new Map<string, InfraVisibility>([
        ['hello-world', { pluginId: 'hello-world', mode: null, hasCustomConfig: false }],
      ]);
      const result = infraFilter([nonInfraPlugin], map, false);
      expect(result).toHaveLength(1);
    });

    it('should show plugins not in visibility map to tenants', () => {
      const map = new Map<string, InfraVisibility>();
      const result = infraFilter([nonInfraPlugin], map, false);
      expect(result).toHaveLength(1);
    });

    it('should handle mixed infra and non-infra plugins', () => {
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false }],
        ['email-provider', { pluginId: 'email-provider', mode: 'allow_override', hasCustomConfig: true }],
        ['hello-world', { pluginId: 'hello-world', mode: null, hasCustomConfig: false }],
      ]);
      const result = infraFilter([s3Plugin, emailPlugin, nonInfraPlugin], map, false);
      // s3 hidden (unified), email shown (allow_override), hello shown (null)
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.extension.pluginId)).toEqual(['email-provider', 'hello-world']);
    });
  });

  describe('combined static + infra filtering pipeline', () => {
    it('should apply both filters in sequence (tenant)', () => {
      const allEntries = [s3Plugin, emailPlugin, platformOnlyPlugin, nonInfraPlugin];
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false }],
        ['email-provider', { pluginId: 'email-provider', mode: 'allow_override', hasCustomConfig: false }],
      ]);

      // Step 1: Static filter removes platform-only plugins for tenant
      const afterStatic = staticFilter(allEntries, false);
      expect(afterStatic).toHaveLength(3); // s3, email, hello — platform-only removed

      // Step 2: Infra filter removes unified infra plugins for tenant
      const afterInfra = infraFilter(afterStatic, map, false);
      expect(afterInfra).toHaveLength(2); // email, hello — s3 removed (unified)
      expect(afterInfra.map((e) => e.extension.pluginId)).toEqual(['email-provider', 'hello-world']);
    });

    it('should apply both filters in sequence (platform org)', () => {
      const allEntries = [s3Plugin, emailPlugin, platformOnlyPlugin, nonInfraPlugin];
      const map = new Map<string, InfraVisibility>([
        ['storage-s3', { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false }],
      ]);

      const afterStatic = staticFilter(allEntries, true);
      expect(afterStatic).toHaveLength(4); // All visible

      const afterInfra = infraFilter(afterStatic, map, true);
      expect(afterInfra).toHaveLength(4); // Platform sees everything
    });
  });
});
