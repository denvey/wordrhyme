import { describe, expect, it, vi } from 'vitest';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { pluginProcedure, pluginRouter } from '@wordrhyme/plugin/server';

const t = initTRPC.context<any>().create();

describe('pluginProcedure middleware runner', () => {
    it('supports app-level hook middleware for pluginApis mutations', async () => {
        const pluginProcedureMiddlewares = [
            async (opts: any) => {
                const { path, type, ctx, next } = opts;

                if (type !== 'mutation' || !path.startsWith('pluginApis.')) {
                    return next({ ctx });
                }

                const hookPath = path.replace(/^pluginApis\./, '');
                const rawInput = await opts.getRawInput();
                const modified = await ctx.hooks.emit(`${hookPath}.before`, rawInput, { pipe: true });
                const result = await next({
                    getRawInput: () => Promise.resolve(modified ?? rawInput),
                });

                if (result.ok) {
                    await ctx.hooks.emit(`${hookPath}.after`, result.data);
                }

                return result;
            },
        ];

        const normalizedPluginId = 'test-hooks';
        const testRouter = pluginRouter({
            createThing: pluginProcedure
                .input(z.object({ name: z.string() }))
                .mutation(({ input }) => ({
                    ok: true,
                    name: input.name,
                })),
        });

        const rootRouter = t.router({
            pluginApis: t.router({
                [normalizedPluginId]: testRouter,
            }),
        });

        const emit = vi.fn(async (hookId: string, payload: unknown) => {
            if (hookId === `${normalizedPluginId}.createThing.before`) {
                return {
                    ...(payload as { name: string }),
                    name: 'patched-by-before-hook',
                };
            }

            return undefined;
        });

        const caller = rootRouter.createCaller({
            hooks: { emit },
            __pluginProcedureMiddlewares: pluginProcedureMiddlewares,
        });

        const result = await caller.pluginApis[normalizedPluginId].createThing({ name: 'raw-name' });

        expect(result).toEqual({
            ok: true,
            name: 'patched-by-before-hook',
        });
        expect(emit).toHaveBeenNthCalledWith(
            1,
            `${normalizedPluginId}.createThing.before`,
            { name: 'raw-name' },
            { pipe: true },
        );
        expect(emit).toHaveBeenNthCalledWith(
            2,
            `${normalizedPluginId}.createThing.after`,
            { ok: true, name: 'patched-by-before-hook' },
        );
    });

    it('accumulates next() overrides across multiple plugin middlewares', async () => {
        const pluginProcedureMiddlewares = [
            async (opts: any) => {
                const rawInput = await opts.getRawInput();
                return opts.next({
                    ctx: { ...opts.ctx, addedByFirst: true },
                    getRawInput: () => Promise.resolve({ ...rawInput, stage1: true }),
                });
            },
            async (opts: any) => {
                const rawInput = await opts.getRawInput();
                return opts.next({
                    ctx: { ...opts.ctx, addedBySecond: true },
                    getRawInput: () => Promise.resolve({ ...rawInput, stage2: true }),
                });
            },
        ];

        const testRouter = pluginRouter({
            createThing: pluginProcedure
                .input(z.object({ name: z.string(), stage1: z.boolean().optional(), stage2: z.boolean().optional() }))
                .mutation(({ input, ctx }) => ({
                    input,
                    addedByFirst: (ctx as any).addedByFirst,
                    addedBySecond: (ctx as any).addedBySecond,
                })),
        });

        const rootRouter = t.router({
            pluginApis: t.router({
                test: testRouter,
            }),
        });

        const caller = rootRouter.createCaller({
            __pluginProcedureMiddlewares: pluginProcedureMiddlewares,
        });

        const result = await caller.pluginApis.test.createThing({ name: 'raw-name' });

        expect(result).toEqual({
            input: { name: 'raw-name', stage1: true, stage2: true },
            addedByFirst: true,
            addedBySecond: true,
        });
    });
});
