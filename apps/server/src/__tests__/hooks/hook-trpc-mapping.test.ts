/**
 * Hook → tRPC Auto-Mapping Tests
 *
 * Verifies that hooks.emit() can automatically call tRPC procedures
 * when no on() handlers are registered.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../../hooks/hook-registry';
import { HookExecutor } from '../../hooks/hook-executor';
import { createHookCapability } from '../../plugins/capabilities/hook.capability';

describe('Hook → tRPC Auto-Mapping', () => {
    let registry: HookRegistry;
    let executor: HookExecutor;

    beforeEach(() => {
        registry = new HookRegistry();
        executor = new HookExecutor(registry);
    });

    describe('trpcCallerFactory fallback', () => {
        it('should call trpcCallerFactory when no hook definition exists', async () => {
            const mockFactory = vi.fn().mockResolvedValue({ id: '123', name: 'Acme' });

            const hooks = createHookCapability(
                'com.wordrhyme.quotation', 'tenant-1',
                registry, executor, mockFactory
            );

            const result = await hooks.emit('crm.customers.create', { name: 'Acme' });

            expect(mockFactory).toHaveBeenCalledWith('crm.customers.create', { name: 'Acme' });
            expect(result).toEqual({ id: '123', name: 'Acme' });
        });

        it('should NOT call trpcCallerFactory when on() handler exists', async () => {
            const mockFactory = vi.fn().mockResolvedValue({ id: '123' });

            const crmHooks = createHookCapability(
                'com.wordrhyme.crm', 'tenant-1',
                registry, executor, mockFactory
            );

            // CRM registers a handler
            crmHooks.on('crm.customers.create', async (data: any) => {
                return { ...data, id: 'from-handler' };
            });

            const quotationHooks = createHookCapability(
                'com.wordrhyme.quotation', 'tenant-1',
                registry, executor, mockFactory
            );

            await quotationHooks.emit('crm.customers.create', { name: 'Acme' });

            // Factory should NOT be called because a handler exists
            expect(mockFactory).not.toHaveBeenCalled();
        });

        it('should return data as-is when factory throws', async () => {
            const notFoundError = new Error('Route not found') as Error & { code?: string };
            notFoundError.code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
            const mockFactory = vi.fn().mockRejectedValue(notFoundError);

            const hooks = createHookCapability(
                'com.wordrhyme.quotation', 'tenant-1',
                registry, executor, mockFactory
            );

            const result = await hooks.emit('nonexistent.route', { foo: 'bar' });

            expect(result).toEqual({ foo: 'bar' });
        });

        it('should rethrow non-route errors from trpcCallerFactory', async () => {
            const mockFactory = vi.fn().mockRejectedValue(new Error('Database write failed'));

            const hooks = createHookCapability(
                'com.wordrhyme.quotation', 'tenant-1',
                registry, executor, mockFactory
            );

            await expect(hooks.emit('crm.customers.create', { name: 'Acme' })).rejects.toThrow(
                'Database write failed',
            );
        });

        it('should return data as-is when no factory provided', async () => {
            const hooks = createHookCapability(
                'com.wordrhyme.quotation', 'tenant-1',
                registry, executor
                // no factory
            );

            const result = await hooks.emit('unknown.hook', { foo: 'bar' });
            expect(result).toEqual({ foo: 'bar' });
        });
    });
});
