import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultContext } from '../../context/async-local-storage';

vi.mock('../../db/index.js', () => ({
    createScopedDb: vi.fn(() => ({ __scoped: true })),
    db: {},
    rawDb: {},
}));

describe('buildPluginCallerContext', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('reuses the same plugin capability injection path for internal tRPC callers', async () => {
        const { setPluginContextServices, buildPluginCallerContext } = await import('../../trpc/context');

        setPluginContextServices({
            settingsService: {} as any,
            featureFlagService: {} as any,
            getPluginManifest: (pluginId: string) => ({
                pluginId,
                version: '0.0.0-test',
                name: pluginId,
                vendor: 'WordRhyme',
                runtime: 'node',
                engines: { wordrhyme: '^0.1.0' },
                permissions: { definitions: [] },
                capabilities: { data: { read: true, write: true } },
            }),
        });

        const result = buildPluginCallerContext({
            pluginId: 'com.wordrhyme.crm',
            requestContext: createDefaultContext({
                requestId: 'req-hook-test',
                organizationId: 'tenant-1',
                userId: 'user-1',
                userRole: 'admin',
                userRoles: ['admin'],
            }),
        });

        expect(result.pluginId).toBe('com.wordrhyme.crm');
        expect(result.organizationId).toBe('tenant-1');
        expect(result.userId).toBe('user-1');
        expect(result.db).toEqual({ __scoped: true });
        expect(result.permissions).toBeDefined();
        expect(result.logger).toBeDefined();
        expect(result.settings).toBeDefined();
    });
});
