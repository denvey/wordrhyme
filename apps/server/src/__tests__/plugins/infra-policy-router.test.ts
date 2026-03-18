/**
 * Infrastructure Policy Router Permission Tests (Task 7.1)
 *
 * Tests that:
 * - Platform admins can call get/set (requires manage:Settings + platform org)
 * - Non-platform orgs are rejected by get/set
 * - Any authenticated user can call getVisibility/batchGetVisibility
 * - Non-infrastructure plugins are rejected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Mock trpc module ───

vi.mock('../../trpc/trpc.js', () => {
  const createProcedureMock = (_name: string) => {
    const chain: Record<string, unknown> = {};

    chain['meta'] = vi.fn().mockReturnValue(chain);
    chain['input'] = vi.fn().mockReturnValue(chain);
    chain['output'] = vi.fn().mockReturnValue(chain);
    chain['query'] = vi.fn().mockImplementation((handler: unknown) => {
      return { _type: 'query', handler };
    });
    chain['mutation'] = vi.fn().mockImplementation((handler: unknown) => {
      return { _type: 'mutation', handler };
    });

    return chain;
  };

  return {
    router: vi.fn((def) => def),
    protectedProcedure: createProcedureMock('protected'),
  };
});

// Import after mocks
import {
  infraPolicyRouter,
  setInfraPolicyServices,
} from '../../trpc/routers/infra-policy.js';
import { initInfraPolicySettings } from '../../trpc/infra-policy-guard.js';
import type { SettingsService } from '../../settings/settings.service.js';
import type { PluginManifest } from '@wordrhyme/plugin';

// ─── Test fixtures ───

function createMockSettingsService(preload?: Record<string, unknown>): SettingsService {
  const store = new Map<string, unknown>();
  if (preload) {
    for (const [k, v] of Object.entries(preload)) {
      store.set(k, v);
    }
  }
  return {
    get: vi.fn(async (_scope: string, _key: string, opts?: { scopeId?: string; organizationId?: string; defaultValue?: unknown }) => {
      // Composite key: scope:scopeId:orgId:key (matches infra-config.test.ts pattern)
      const compositeKey = `${_scope}:${opts?.scopeId ?? ''}:${opts?.organizationId ?? ''}:${_key}`;
      return store.get(compositeKey) ?? opts?.defaultValue ?? null;
    }),
    set: vi.fn(async (_scope: string, _key: string, value: unknown, opts?: { scopeId?: string }) => {
      const compositeKey = `${_scope}:${opts?.scopeId ?? ''}::${_key}`;
      store.set(compositeKey, value);
    }),
    delete: vi.fn(),
    list: vi.fn(async () => []),
  } as unknown as SettingsService;
}

const infraManifest: PluginManifest = {
  pluginId: 'storage-s3',
  version: '1.0.0',
  name: 'S3 Storage',
  vendor: 'WordRhyme',
  engines: { wordrhyme: '^0.1.0' },
  infrastructure: { tenantOverride: true, riskLevel: 'high', sensitiveFields: ['secretAccessKey'] },
} as PluginManifest;

const nonInfraManifest: PluginManifest = {
  pluginId: 'hello-world',
  version: '1.0.0',
  name: 'Hello World',
  vendor: 'Example',
  engines: { wordrhyme: '^0.1.0' },
} as PluginManifest;

const manifests = new Map<string, PluginManifest>([
  ['storage-s3', infraManifest],
  ['hello-world', nonInfraManifest],
]);

function manifestResolver(pluginId: string): PluginManifest | undefined {
  return manifests.get(pluginId);
}

describe('infraPolicy Router (Task 7.1)', () => {
  let settingsService: SettingsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    settingsService = createMockSettingsService();
    setInfraPolicyServices(settingsService, manifestResolver);
    await initInfraPolicySettings(settingsService);
  });

  // Access the router handlers directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = infraPolicyRouter as any;

  function getHandler(endpoint: string): (opts: { input: unknown; ctx: unknown }) => unknown {
    const entry = router[endpoint];
    if (entry && typeof entry === 'object' && 'handler' in entry) {
      return entry.handler as (opts: { input: unknown; ctx: unknown }) => unknown;
    }
    throw new Error(`Handler not found for endpoint: ${endpoint}`);
  }

  describe('get (platform-only)', () => {
    it('should succeed for platform org', async () => {
      const handler = getHandler('get');
      const result = await handler({
        input: { pluginId: 'storage-s3' },
        ctx: { organizationId: 'platform', userId: 'admin-1' },
      });
      expect(result).toEqual({ mode: 'unified' }); // Default when no policy stored
    });

    it('should reject non-platform org', async () => {
      const handler = getHandler('get');
      await expect(
        handler({
          input: { pluginId: 'storage-s3' },
          ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should reject non-infrastructure plugin', async () => {
      const handler = getHandler('get');
      await expect(
        handler({
          input: { pluginId: 'hello-world' },
          ctx: { organizationId: 'platform', userId: 'admin-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('set (platform-only)', () => {
    it('should succeed for platform org', async () => {
      const handler = getHandler('set');
      const result = await handler({
        input: { pluginId: 'storage-s3', policy: { mode: 'allow_override' } },
        ctx: { organizationId: 'platform', userId: 'admin-1' },
      });
      expect(result).toEqual({ success: true });
      expect(settingsService.set).toHaveBeenCalled();
    });

    it('should reject non-platform org', async () => {
      const handler = getHandler('set');
      await expect(
        handler({
          input: { pluginId: 'storage-s3', policy: { mode: 'allow_override' } },
          ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should reject non-infrastructure plugin', async () => {
      const handler = getHandler('set');
      await expect(
        handler({
          input: { pluginId: 'hello-world', policy: { mode: 'allow_override' } },
          ctx: { organizationId: 'platform', userId: 'admin-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getVisibility (any authenticated user)', () => {
    it('should work for tenant user', async () => {
      const handler = getHandler('getVisibility');
      const result = await handler({
        input: { pluginId: 'storage-s3' },
        ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
      });
      expect(result).toEqual({
        pluginId: 'storage-s3',
        mode: 'unified',
        hasCustomConfig: false,
      });
    });

    it('should work for platform admin', async () => {
      const handler = getHandler('getVisibility');
      const result = await handler({
        input: { pluginId: 'storage-s3' },
        ctx: { organizationId: 'platform', userId: 'admin-1' },
      });
      expect(result).toEqual({
        pluginId: 'storage-s3',
        mode: 'unified',
        hasCustomConfig: false,
      });
    });

    it('should return hasCustomConfig: true when tenant has custom config', async () => {
      settingsService = createMockSettingsService({
        'plugin_global:storage-s3::infra.policy': { mode: 'allow_override' },
        'plugin_tenant:storage-s3:org-tenant-1:infra.config': { bucket: 'tenant-bucket' },
      });
      setInfraPolicyServices(settingsService, manifestResolver);

      const handler = getHandler('getVisibility');
      const result = await handler({
        input: { pluginId: 'storage-s3' },
        ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
      });
      expect(result).toEqual({
        pluginId: 'storage-s3',
        mode: 'allow_override',
        hasCustomConfig: true,
      });
    });
  });

  describe('batchGetVisibility (any authenticated user)', () => {
    it('should return visibility for multiple plugins', async () => {
      const handler = getHandler('batchGetVisibility');
      const result = await handler({
        input: { pluginIds: ['storage-s3', 'hello-world'] },
        ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
      });
      expect(result).toEqual([
        { pluginId: 'storage-s3', mode: 'unified', hasCustomConfig: false },
        { pluginId: 'hello-world', mode: null, hasCustomConfig: false },
      ]);
    });

    it('should return mode: null for non-infrastructure plugins', async () => {
      const handler = getHandler('batchGetVisibility');
      const result = (await handler({
        input: { pluginIds: ['hello-world'] },
        ctx: { organizationId: 'org-tenant-1', userId: 'user-1' },
      })) as Array<{ pluginId: string; mode: string | null }>;
      expect(result[0]!.mode).toBeNull();
    });
  });
});
