import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

type QueryContext = {
  requestId?: string;
  organizationId?: string;
  userId?: string;
  userRole?: string;
  db: {
    query: {
      geoCountries: {
        findMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
      };
      geoSubdivisions: {
        findMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
      };
    };
  };
};

function createContext(): QueryContext {
  return {
    requestId: 'req-geo-test',
    db: {
      query: {
        geoCountries: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
        geoSubdivisions: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
      },
    },
  };
}

describe('geoRouter', () => {
  let ctx: QueryContext;
  let geoRouter: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('../../trpc/trpc', () => {
      const createProcedureMock = () => {
        const chain: Record<string, unknown> = {};

        chain['input'] = vi.fn().mockReturnValue(chain);
        chain['output'] = vi.fn().mockReturnValue(chain);
        chain['meta'] = vi.fn().mockReturnValue(chain);
        chain['use'] = vi.fn().mockReturnValue(chain);
        chain['query'] = vi.fn().mockImplementation((handler: unknown) => ({
          _type: 'query',
          handler,
        }));
        chain['mutation'] = vi.fn().mockImplementation((handler: unknown) => ({
          _type: 'mutation',
          handler,
        }));

        return chain;
      };

      return {
        router: vi.fn((def) => def),
        publicProcedure: createProcedureMock(),
      };
    });

    ({ geoRouter } = await import('../../trpc/routers/geo'));
    ctx = createContext();
  });

  function getHandler(endpoint: keyof typeof geoRouter) {
    const entry = geoRouter[endpoint];
    if (entry && typeof entry === 'object' && 'handler' in entry) {
      return entry.handler as (opts: { ctx: QueryContext; input: any }) => Promise<any>;
    }

    throw new Error(`Handler not found for endpoint: ${String(endpoint)}`);
  }

  it('should return localized display names and filter supported countries by default', async () => {
    ctx.db.query.geoCountries.findMany.mockResolvedValue([
      {
        code2: 'CN',
        name: { 'en-US': 'China', 'zh-CN': '中国' },
        officialName: { 'en-US': "People's Republic of China", 'zh-CN': '中华人民共和国' },
        isSupported: true,
        sortOrder: 10,
      },
      {
        code2: 'JP',
        name: { 'en-US': 'Japan', 'ja-JP': '日本' },
        officialName: null,
        isSupported: true,
        sortOrder: 20,
      },
    ]);

    const handler = getHandler('listCountries');
    const result = await handler({
      ctx,
      input: { locale: 'zh-CN', supportedOnly: true },
    });

    expect(ctx.db.query.geoCountries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isSupported: true },
        limit: undefined,
        offset: undefined,
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        code2: 'CN',
        displayName: '中国',
        displayOfficialName: '中华人民共和国',
      }),
      expect.objectContaining({
        code2: 'JP',
        displayName: 'Japan',
        displayOfficialName: null,
      }),
    ]);
  });

  it('should allow listing all countries when supportedOnly is false', async () => {
    ctx.db.query.geoCountries.findMany.mockResolvedValue([]);

    const handler = getHandler('listCountries');
    await handler({
      ctx,
      input: { locale: 'en-GB', supportedOnly: false, limit: 20, offset: 40 },
    });

    expect(ctx.db.query.geoCountries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        limit: 20,
        offset: 40,
      })
    );
  });

  it('should return a country with language-level locale fallback', async () => {
    ctx.db.query.geoCountries.findFirst.mockResolvedValue({
      code2: 'FR',
      name: { 'en-US': 'France', 'fr-FR': 'France' },
      officialName: { 'en-US': 'French Republic', 'fr-FR': 'Republique francaise' },
    });

    const handler = getHandler('getCountry');
    const result = await handler({
      ctx,
      input: { code2: 'FR', locale: 'fr-CA' },
    });

    expect(ctx.db.query.geoCountries.findFirst).toHaveBeenCalledWith({
      where: { code2: 'FR' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        code2: 'FR',
        displayName: 'France',
        displayOfficialName: 'Republique francaise',
      })
    );
  });

  it('should throw NOT_FOUND when country does not exist', async () => {
    ctx.db.query.geoCountries.findFirst.mockResolvedValue(null);

    const handler = getHandler('getCountry');

    await expect(
      handler({
        ctx,
        input: { code2: 'ZZ', locale: 'en-US' },
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: 'NOT_FOUND',
      message: 'Country ZZ not found',
    });
  });

  it('should return localized subdivision names and apply country filter', async () => {
    ctx.db.query.geoSubdivisions.findMany.mockResolvedValue([
      {
        fullCode: 'CN-BJ',
        countryCode2: 'CN',
        code: 'BJ',
        name: { 'en-US': 'Beijing', 'zh-CN': '北京' },
        isSupported: true,
        sortOrder: 10,
      },
    ]);

    const handler = getHandler('listSubdivisions');
    const result = await handler({
      ctx,
      input: { countryCode2: 'CN', locale: 'zh-CN', supportedOnly: true },
    });

    expect(ctx.db.query.geoSubdivisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          countryCode2: 'CN',
          isSupported: true,
        },
        limit: undefined,
        offset: undefined,
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        fullCode: 'CN-BJ',
        displayName: '北京',
      }),
    ]);
  });

  it('should skip supported filter when supportedOnly is false', async () => {
    ctx.db.query.geoSubdivisions.findMany.mockResolvedValue([]);

    const handler = getHandler('listSubdivisions');
    await handler({
      ctx,
      input: {
        countryCode2: 'US',
        locale: 'en-US',
        supportedOnly: false,
        limit: 50,
        offset: 10,
      },
    });

    expect(ctx.db.query.geoSubdivisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          countryCode2: 'US',
        },
        limit: 50,
        offset: 10,
      })
    );
  });

  it('should return a subdivision with localized display name', async () => {
    ctx.db.query.geoSubdivisions.findFirst.mockResolvedValue({
      fullCode: 'US-CA',
      countryCode2: 'US',
      code: 'CA',
      name: { 'en-US': 'California', 'zh-CN': '加利福尼亚州' },
    });

    const handler = getHandler('getSubdivision');
    const result = await handler({
      ctx,
      input: { fullCode: 'US-CA', locale: 'zh-CN' },
    });

    expect(ctx.db.query.geoSubdivisions.findFirst).toHaveBeenCalledWith({
      where: { fullCode: 'US-CA' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        fullCode: 'US-CA',
        displayName: '加利福尼亚州',
      })
    );
  });

  it('should throw NOT_FOUND when subdivision does not exist', async () => {
    ctx.db.query.geoSubdivisions.findFirst.mockResolvedValue(null);

    const handler = getHandler('getSubdivision');

    await expect(
      handler({
        ctx,
        input: { fullCode: 'ZZ-UNKNOWN', locale: 'en-US' },
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: 'NOT_FOUND',
      message: 'Subdivision ZZ-UNKNOWN not found',
    });
  });
});

describe('appRouter caller -> geo', () => {
  let ctx: QueryContext;
  let caller: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../../trpc/trpc');

    vi.doMock('../../trpc/permission-registry', () => ({
      isPermissionRegistryReady: vi.fn(() => false),
      rebuildPermissionRegistry: vi.fn(),
      resolvePermissionForPath: vi.fn(() => null),
      getRbacDefaultPolicy: vi.fn(() => 'allow'),
    }));

    vi.doMock('../../db', () => ({
      db: {
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(undefined),
        })),
      },
    }));

    vi.doMock('../../permission', () => {
      class MockPermissionKernel {
        async require() {
          return;
        }
      }

      class MockPermissionDeniedError extends Error {}

      return {
        PermissionKernel: MockPermissionKernel,
        PermissionDeniedError: MockPermissionDeniedError,
      };
    });

    vi.doMock('../../permission/permission-kernel', () => {
      class MockPermissionKernel {
        async require() {
          return;
        }
      }

      return {
        PermissionKernel: MockPermissionKernel,
      };
    });

    vi.doMock('../../trpc/route-drift', () => ({
      detectRouteDrift: vi.fn(),
      snapshotPluginRoutes: vi.fn(() => []),
    }));

    vi.doMock('../../billing/billing-guard', () => ({
      isBillingGuardReady: vi.fn(() => false),
      getL2ModuleDefault: vi.fn(),
      getDefaultPolicy: vi.fn(() => 'allow'),
      resolveBillingSubject: vi.fn(() => ({ free: true, subject: null, source: 'default' })),
    }));

    vi.doMock('../../trpc/routers/plugin', () => ({ pluginRouter: {} }));
    vi.doMock('../../trpc/routers/menu', () => ({ menuRouter: {} }));
    vi.doMock('../../trpc/routers/roles', () => ({ rolesRouter: {} }));
    vi.doMock('../../trpc/routers/permissions', () => ({ permissionsRouter: {} }));
    vi.doMock('../../trpc/routers/notifications', () => ({ notificationRouter: {} }));
    vi.doMock('../../trpc/routers/notification-preferences', () => ({
      notificationPreferencesRouter: {},
    }));
    vi.doMock('../../trpc/routers/notification-templates', () => ({
      notificationTemplatesRouter: {},
    }));
    vi.doMock('../../trpc/routers/settings', () => ({ settingsRouter: {} }));
    vi.doMock('../../trpc/routers/feature-flags', () => ({ featureFlagsRouter: {} }));
    vi.doMock('../../trpc/routers/media', () => ({ mediaRouter: {} }));
    vi.doMock('../../trpc/routers/cache', () => ({ cacheRouter: {} }));
    vi.doMock('../../trpc/routers/audit', () => ({ auditRouter: {} }));
    vi.doMock('../../trpc/routers/plugin-debug', () => ({ pluginDebugRouter: {} }));
    vi.doMock('../../trpc/routers/plugin-health', () => ({ pluginHealthRouter: {} }));
    vi.doMock('../../webhooks/webhook.router.js', () => ({ webhookRouter: {} }));
    vi.doMock('../../trpc/routers/scheduler', () => ({ schedulerRouter: {} }));
    vi.doMock('../../trpc/routers/hooks', () => ({ hooksRouter: {} }));
    vi.doMock('../../trpc/routers/api-tokens', () => ({ apiTokensRouter: {} }));
    vi.doMock('../../trpc/routers/billing', () => ({ billingRouter: {} }));
    vi.doMock('../../trpc/routers/organization', () => ({ organizationRouter: {} }));
    vi.doMock('../../trpc/routers/i18n', () => ({ i18nRouter: {} }));
    vi.doMock('../../trpc/routers/currency', () => ({ currencyRouter: {} }));
    vi.doMock('../../trpc/routers/oauth-settings', () => ({ oauthSettingsRouter: {} }));
    vi.doMock('../../trpc/routers/permission-config', () => ({
      permissionConfigRouter: {},
    }));
    vi.doMock('../../trpc/routers/storage', () => ({ storageRouter: {} }));
    vi.doMock('../../trpc/routers/infra-policy', () => ({ infraPolicyRouter: {} }));

    const { getAppRouter } = await import('../../trpc/router');

    ctx = createContext();
    caller = getAppRouter().createCaller(ctx as never);
  });

  it('should call geo.listCountries through real appRouter namespace', async () => {
    ctx.db.query.geoCountries.findMany.mockResolvedValue([
      {
        code2: 'CN',
        name: { 'en-US': 'China', 'zh-CN': '中国' },
        officialName: { 'en-US': "People's Republic of China", 'zh-CN': '中华人民共和国' },
        isSupported: true,
        sortOrder: 10,
      },
    ]);

    const result = await caller.geo.listCountries({
      locale: 'zh-CN',
      supportedOnly: true,
    });

    expect(ctx.db.query.geoCountries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isSupported: true },
        limit: 20,
        offset: 0,
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        code2: 'CN',
        displayName: '中国',
        displayOfficialName: '中华人民共和国',
      }),
    ]);
  });

  it('should call geo.getCountry through real appRouter namespace', async () => {
    ctx.db.query.geoCountries.findFirst.mockResolvedValue({
      code2: 'US',
      name: { 'en-US': 'United States', 'zh-CN': '美国' },
      officialName: { 'en-US': 'United States of America', 'zh-CN': '美利坚合众国' },
    });

    const result = await caller.geo.getCountry({
      code2: 'US',
      locale: 'zh-CN',
    });

    expect(ctx.db.query.geoCountries.findFirst).toHaveBeenCalledWith({
      where: { code2: 'US' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        code2: 'US',
        displayName: '美国',
        displayOfficialName: '美利坚合众国',
      })
    );
  });

  it('should call geo.listSubdivisions through real appRouter namespace', async () => {
    ctx.db.query.geoSubdivisions.findMany.mockResolvedValue([
      {
        fullCode: 'CA-QC',
        countryCode2: 'CA',
        code: 'QC',
        name: { 'en-US': 'Quebec', 'zh-CN': '魁北克省' },
        isSupported: true,
        sortOrder: 90,
      },
    ]);

    const result = await caller.geo.listSubdivisions({
      countryCode2: 'CA',
      locale: 'zh-CN',
      supportedOnly: true,
    });

    expect(ctx.db.query.geoSubdivisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { countryCode2: 'CA', isSupported: true },
        limit: 20,
        offset: 0,
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        fullCode: 'CA-QC',
        displayName: '魁北克省',
      }),
    ]);
  });

  it('should surface TRPCError from geo.getSubdivision through caller chain', async () => {
    ctx.db.query.geoSubdivisions.findFirst.mockResolvedValue(null);

    await expect(
      caller.geo.getSubdivision({
        fullCode: 'ZZ-404',
        locale: 'en-US',
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: 'NOT_FOUND',
      message: 'Subdivision ZZ-404 not found',
    });
  });
});
