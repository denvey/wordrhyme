/**
 * Cross-Plugin Hook Communication Tests
 *
 * Validates the unified on() + emit() API for cross-plugin communication.
 *
 * API:
 * - on(hookId, handler)       — register a handler
 * - emit(hookId, data)        — trigger (parallel by default, returns first result)
 * - emit(hookId, data, {pipe}) — trigger (serial pipeline, returns transformed data)
 *
 * Spec: docs/specs/developer-kickoff.md §十
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookExecutor } from '../../hooks/hook-executor';
import { HookRegistry } from '../../hooks/hook-registry';
import { createHookCapability } from '../../plugins/capabilities/hook.capability';
import { HookPriority } from '../../hooks/hook.types';

describe('Cross-Plugin Hook Communication (on + emit)', () => {
    let registry: HookRegistry;
    let executor: HookExecutor;

    beforeEach(() => {
        registry = new HookRegistry();
        executor = new HookExecutor(registry);
        // No defineHook needed — hooks are auto-defined when on() is called
    });

    describe('on() — 注册 handler', () => {
        it('on() 注册的 handler 在 emit 时被调用', async () => {
            const received: unknown[] = [];
            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);

            hooks.on('crm.customer.promoted', async (data) => {
                received.push(data);
            });

            const crmHooks = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            await crmHooks.emit('crm.customer.promoted', { customerId: 'cust-001' });

            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({ customerId: 'cust-001' });
        });

        it('on() 返回的 unsubscribe 函数可精确移除 handler', async () => {
            const calls: unknown[] = [];
            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);

            const unsub = hooks.on('crm.customer.promoted', async (data) => {
                calls.push(data);
            });

            const crmHooks = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            await crmHooks.emit('crm.customer.promoted', { id: 1 });
            expect(calls).toHaveLength(1);

            unsub();

            await crmHooks.emit('crm.customer.promoted', { id: 2 });
            expect(calls).toHaveLength(1); // 没有新增
        });
    });

    describe('emit() — 默认并行模式', () => {
        it('多个 handler 全部被触发', async () => {
            const quotationCalls: unknown[] = [];
            const analyticsCalls: unknown[] = [];

            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            quotation.on('crm.customer.promoted', async (data) => {
                quotationCalls.push(data);
            });

            const analytics = createHookCapability('com.wordrhyme.analytics', 'tenant-1', registry, executor);
            analytics.on('crm.customer.promoted', async (data) => {
                analyticsCalls.push(data);
            });

            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            await crm.emit('crm.customer.promoted', { customerId: 'cust-002' });

            expect(quotationCalls).toHaveLength(1);
            expect(analyticsCalls).toHaveLength(1);
        });

        it('handler 抛异常不影响调用方（fire-and-forget）', async () => {
            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            hooks.on('crm.customer.promoted', async () => {
                throw new Error('Quotation crashed!');
            });

            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            // 不应抛异常
            const result = await crm.emit('crm.customer.promoted', { customerId: 'cust-003' });
            expect(result).toEqual({ customerId: 'cust-003' }); // 返回原始数据
        });

        it('无 handler 时返回原始数据', async () => {
            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            const result = await crm.emit('crm.customer.promoted', { customerId: 'cust-004' });
            expect(result).toEqual({ customerId: 'cust-004' });
        });
    });

    describe('emit() — 服务调用（拿返回值）', () => {
        it('Quotation 通过 emit 调 CRM 创建客户，拿到 customerId', async () => {
            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            crm.on('crm.createProspect', async (data: any) => {
                const id = `cust-${Date.now()}`;
                return { ...data, id, status: 'prospect' };
            });

            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const customer = await quotation.emit('crm.createProspect', {
                name: 'Acme Corp',
                organizationId: 'tenant-1',
            }) as any;

            expect(customer.id).toBeDefined();
            expect(customer.id).toMatch(/^cust-/);
            expect(customer.status).toBe('prospect');
            expect(customer.name).toBe('Acme Corp');
        });

        it('Quotation 通过 emit 获取 CRM 联系人快照', async () => {
            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            crm.on('crm.getContact', async (data: any) => {
                return {
                    ...data,
                    fullName: 'Alice Wang',
                    jobTitle: 'Procurement Manager',
                    contactValue: 'alice@acme.com',
                };
            });

            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const contact = await quotation.emit('crm.getContact', {
                contactId: 'contact-001',
                organizationId: 'tenant-1',
            }) as any;

            expect(contact.fullName).toBe('Alice Wang');
            expect(contact.contactValue).toBe('alice@acme.com');
        });

        it('无 handler 时返回初始值', async () => {
            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const result = await quotation.emit('crm.createProspect', {
                name: 'Fallback',
                organizationId: 'tenant-1',
            });

            expect(result).toEqual({ name: 'Fallback', organizationId: 'tenant-1' });
        });
    });

    describe('emit({ pipe: true }) — 管道模式', () => {
        it('多个 handler 串行执行，数据依次传递', async () => {
            const executionLog: string[] = [];

            const validator = createHookCapability('com.wordrhyme.validator', 'tenant-1', registry, executor);
            validator.on('crm.customer.beforeUpdate', async (data: any) => {
                executionLog.push('validator');
                return { ...data, validated: true };
            }, { priority: HookPriority.EARLY });

            const enricher = createHookCapability('com.wordrhyme.enricher', 'tenant-1', registry, executor);
            enricher.on('crm.customer.beforeUpdate', async (data: any) => {
                executionLog.push('enricher');
                return { ...data, enriched: true, validated: data.validated }; // 能看到 validator 的修改
            }, { priority: HookPriority.NORMAL });

            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            const result = await crm.emit(
                'crm.customer.beforeUpdate',
                { name: '客户A' },
                { pipe: true },
            ) as any;

            expect(executionLog).toEqual(['validator', 'enricher']);
            expect(result.validated).toBe(true);
            expect(result.enriched).toBe(true);
            expect(result.name).toBe('客户A');
        });

        it('pipe 模式下 handler 不 return 时透传上一个值', async () => {
            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            crm.on('crm.customer.beforeUpdate', async (_data: any) => {
                // 不 return，纯副作用
            });

            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const result = await hooks.emit(
                'crm.customer.beforeUpdate',
                { name: '客户B' },
                { pipe: true },
            );

            expect(result).toEqual({ name: '客户B' }); // 原始值透传
        });
    });

    describe('生命周期与清理', () => {
        it('unregisterPluginHandlers 卸载指定插件的所有 handler', async () => {
            const received: unknown[] = [];
            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            quotation.on('crm.customer.promoted', async (data) => {
                received.push(data);
            });

            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            await crm.emit('crm.customer.promoted', { test: 'before' });
            expect(received).toHaveLength(1);

            // 模拟 Quotation 被 disable
            registry.unregisterPluginHandlers('com.wordrhyme.quotation');

            await crm.emit('crm.customer.promoted', { test: 'after' });
            expect(received).toHaveLength(1); // 没有新增
        });
    });

    describe('自动注册与发现', () => {
        it('emit 未注册的 hook 返回原始数据（不报错）', async () => {
            const hooks = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            const result = await hooks.emit('crm.nonexistent.hook', { fallback: true });
            expect(result).toEqual({ fallback: true });
        });

        it('on 自动创建 hook 定义（不需要 defineHook）', () => {
            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            // 直接注册，不需要提前 defineHook
            expect(() => {
                hooks.on('brand.new.hook', async () => {});
            }).not.toThrow();

            expect(registry.hasHook('brand.new.hook')).toBe(true);
        });

        it('defineHook 仍然可用（预定义有描述信息）', () => {
            registry.defineHook({
                id: 'crm.well.defined',
                type: 'action',
                description: '有详细描述的 Hook',
                defaultTimeout: 5000,
            });
            expect(registry.getDefinition('crm.well.defined')?.description).toBe('有详细描述的 Hook');
        });

        it('listHooks 可发现所有已注册的 hooks', async () => {
            // 通过 on 自动注册几个 hook
            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            crm.on('crm.customer.promoted', async () => {});
            crm.on('crm.createProspect', async () => {});

            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const list = await hooks.listHooks();

            expect(list).toEqual(
                expect.arrayContaining([
                    { id: 'crm.customer.promoted', description: expect.any(String) },
                    { id: 'crm.createProspect', description: expect.any(String) },
                ]),
            );
            expect(list).toHaveLength(2);
        });
    });

    describe('向后兼容（deprecated aliases）', () => {
        it('addAction 等同于 on', async () => {
            const received: unknown[] = [];
            const hooks = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            hooks.addAction('crm.customer.promoted', async (data) => {
                received.push(data);
            });

            const crm = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            await crm.emit('crm.customer.promoted', { id: 'compat-1' });
            expect(received).toHaveLength(1);
        });

        it('addFilter 等同于 on', async () => {
            const hooks = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            hooks.addFilter('crm.createProspect', async (data: any) => {
                return { ...data, id: 'filter-compat' };
            });

            const quotation = createHookCapability('com.wordrhyme.quotation', 'tenant-1', registry, executor);
            const result = await quotation.emit('crm.createProspect', { name: 'Test' }) as any;
            expect(result.id).toBe('filter-compat');
        });

        it('applyFilter 等同于 emit with pipe', async () => {
            const hooks = createHookCapability('com.wordrhyme.crm', 'tenant-1', registry, executor);
            hooks.addFilter('crm.customer.beforeUpdate', async (data: any) => {
                return { ...data, enriched: true };
            });

            const result = await hooks.applyFilter('crm.customer.beforeUpdate', { name: 'Test' }) as any;
            expect(result.enriched).toBe(true);
        });
    });
});
