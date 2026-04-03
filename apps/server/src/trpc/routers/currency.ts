/**
 * Currency tRPC Router
 *
 * Provides public and admin APIs for multi-currency support.
 *
 * Public API:
 * - getCurrencies: Get enabled currencies with rates (for frontend)
 * - convert: Convert amount between currencies
 *
 * Admin API:
 * - currencies.*: Currency management CRUD (using auto-crud-server)
 * - rates.*: Exchange rate management
 *
 * 使用 @wordrhyme/auto-crud-server:
 * - ✅ 基础 CRUD 自动化（list, get, create, update, delete）
 * - ✅ 自定义操作（toggle, setBase）使用 procedures 扩展
 * - ✅ Middleware 调用 Service 层处理业务逻辑
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import type { Context } from '../context';
import { createCrudRouter, type CrudOperation } from '@wordrhyme/auto-crud-server';
import { CurrencyService } from '../../billing/services/currency.service';
import { ExchangeRateService } from '../../billing/services/exchange-rate.service';
import { ExchangeRateRepository } from '../../billing/repos/exchange-rate.repo';
import { db } from '../../db';
import { currencies, exchangeRates, type Currency } from '@wordrhyme/db';
import { currencyPolicyRouter } from './currency-policy.js';
import { setCustomizationFlag, getMode } from '../infra-policy-guard';

// ============================================================================
// Input Schemas
// ============================================================================

const currencyCodeSchema = z.string().min(3).max(3).transform((v) => v.toUpperCase());

const nameI18nSchema = z.record(z.string(), z.string()).refine(
  (val) => Object.keys(val).length > 0,
  { message: 'At least one translation required' }
);

const updateCurrencySchema = z.object({
  nameI18n: nameI18nSchema.optional(),
  symbol: z.string().min(1).max(10).optional(),
  decimalDigits: z.number().int().min(0).max(8).optional(),
  isEnabled: z.boolean().optional(),
});

const setRateSchema = z.object({
  baseCurrency: currencyCodeSchema,
  targetCurrency: currencyCodeSchema,
  rate: z.string().refine(
    (val) => {
      const num = Number.parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: 'Rate must be a positive number' }
  ),
  effectiveAt: z.date().optional(),
});

const bulkRateImportSchema = z.object({
  rates: z.array(
    z.object({
      baseCurrency: currencyCodeSchema,
      targetCurrency: currencyCodeSchema,
      rate: z.string(),
    })
  ).min(1).max(100),
  source: z.string().optional(),
  effectiveAt: z.date().optional(),
});

const convertSchema = z.object({
  fromCurrency: currencyCodeSchema,
  toCurrency: currencyCodeSchema,
  amountCents: z.number().int(),
});

// ============================================================================
// Service Instances (Lazy Initialization)
// ============================================================================

let currencyServiceInstance: CurrencyService | null = null;
let exchangeRateServiceInstance: ExchangeRateService | null = null;

function getCurrencyService(): CurrencyService {
  if (!currencyServiceInstance) {
    currencyServiceInstance = new CurrencyService(db);
  }
  return currencyServiceInstance;
}

function getExchangeRateService(): ExchangeRateService {
  if (!exchangeRateServiceInstance) {
    const exchangeRateRepo = new ExchangeRateRepository(db);
    const currencyService = getCurrencyService();
    exchangeRateServiceInstance = new ExchangeRateService(exchangeRateRepo, currencyService);
  }
  return exchangeRateServiceInstance;
}

// ============================================================================
// Ownership Guard
// ============================================================================

/**
 * Check that a currency belongs to the current tenant (not inherited from platform).
 */
async function requireOwnership(organizationId: string, currencyId: string): Promise<void> {
  const service = getCurrencyService();
  const currency = await service.getById(currencyId);
  if (!currency) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Currency not found' });
  }
  if (currency.organizationId !== organizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot modify inherited platform currency',
    });
  }
}

// ============================================================================
// Currency Router
// ============================================================================

export const currencyRouter = router({
  // =========================================
  // Public API
  // =========================================

  /**
   * Get enabled currencies with current exchange rates
   *
   * Used by frontend to:
   * - Display currency selector
   * - Get formatting info (symbol, decimal digits)
   * - Get exchange rates for conversion
   *
   * @public
   */
  getCurrencies: publicProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId;
    if (!organizationId) {
      return [];
    }

    const mode = getMode('currency');
    const currencyService = getCurrencyService();
    const result = await currencyService.getEnabledForOrganization(organizationId, mode);

    return result.map((c) => ({
      code: c.code,
      nameI18n: c.nameI18n,
      symbol: c.symbol,
      decimalDigits: c.decimalDigits,
      isBase: c.isBase === 1,
      currentRate: c.currentRate ?? null,
    }));
  }),

  /**
   * Convert amount between currencies
   *
   * Uses current exchange rate with Banker's rounding.
   * For server-side conversions (e.g., checkout, reports).
   *
   * @public
   */
  convert: publicProcedure.input(convertSchema).query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId;
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization context required',
      });
    }

    // organizationId already resolved by globalInfraPolicyMiddleware
    const service = getExchangeRateService();

    try {
      const result = await service.convert(
        organizationId,
        input.fromCurrency,
        input.toCurrency,
        input.amountCents
      );

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Conversion failed',
      });
    }
  }),

  // =========================================
  // Currencies Management (Admin) - Using auto-crud-server
  // =========================================

  currencies: (() => {
    // 扩展 create schema，增加 initialRate 字段
    const createCurrencySchema = z.object({
      code: currencyCodeSchema,
      nameI18n: nameI18nSchema,
      symbol: z.string().min(1).max(10),
      decimalDigits: z.number().int().min(0).max(8).default(2),
      isEnabled: z.union([z.boolean(), z.number()]).default(true),
      initialRate: z.string().optional(),
    });

    // 扩展 update schema，增加 rate 字段
    const updateCurrencyWithRateSchema = updateCurrencySchema.extend({
      rate: z.string().optional(),
    });

    // 辅助：为非基础货币设置汇率（create/update 共用）
    async function setRateForCurrency(
      ctx: Context,
      currency: { code: string; isBase: number },
      rateValue: string,
    ) {
      if (currency.isBase === 1) return;
      const parsed = Number.parseFloat(rateValue);
      if (isNaN(parsed) || parsed <= 0) return;

      const service = getCurrencyService();
      const baseCurrency = await service.getBaseCurrency(ctx.organizationId!);
      if (!baseCurrency) return;

      const rateService = getExchangeRateService();
      await rateService.setRate({
        organizationId: ctx.organizationId!,
        baseCurrency: baseCurrency.code,
        targetCurrency: currency.code,
        rate: rateValue,
        source: 'manual',
        effectiveAt: new Date(),
        updatedBy: ctx.userId!,
      });
    }

    const currenciesCrud = createCrudRouter({
      table: currencies,
      omitFields: ['organizationId', 'createdBy', 'updatedBy', 'isBase'],
      schema: createCurrencySchema,
      updateSchema: updateCurrencyWithRateSchema,
      procedure: (op: CrudOperation) => {
        const action = op === 'list' || op === 'get' ? 'read' :
            op === 'deleteMany' ? 'delete' :
              op === 'updateMany' ? 'update' :
                op === 'create' || op === 'update' || op === 'delete' ? op : 'read';
        return protectedProcedure.meta({
          permission: { action, subject: 'Currency' },
        });
      },
      middleware: {
        // ✅ list: Context Swap 已将 organizationId 替换为 effectiveOrg
        // auto-CRUD 的 next() 会用 ScopedDb 查 effectiveOrg 的数据
        list: async ({ ctx, input, next }) => {
          const typedCtx = ctx as Context;
          const orgId = typedCtx.organizationId;

          // Platform admin uses default auto-CRUD
          if (!orgId || orgId === 'platform') {
            const result = await next(input);
            return {
              ...result,
              data: result.data.map((c: any) => ({ ...c, source: 'platform' })),
            };
          }

          // Context Swap 后，next() 自动查 effectiveOrg 的数据
          const result = await next(input);
          // source 标记：originalOrganizationId 存在且不同于当前 → 读的是平台数据
          const originalOrg = (typedCtx as any).originalOrganizationId;
          const source = originalOrg && originalOrg !== orgId ? 'platform' : 'tenant';
          return {
            ...result,
            data: result.data.map((c: any) => ({ ...c, source })),
          };
        },

        // ✅ get: Context Swap 后直接用 next()
        get: async ({ ctx, next }) => {
          const result = await next();
          if (!result) return null;
          const typedCtx = ctx as Context;
          const originalOrg = (typedCtx as any).originalOrganizationId;
          const source = originalOrg && originalOrg !== typedCtx.organizationId ? 'platform' : 'tenant';
          return { ...result, source };
        },

        // ✅ create: auto-crud insert + 可选设初始汇率
        create: async ({ ctx, input, next }) => {
          const typedCtx = ctx as Context;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { initialRate, ...insertData } = input;
          const currency = await next({ ...insertData, createdBy: typedCtx.userId! } as typeof input) as { code: string; isBase: number };

          if (initialRate) {
            await setRateForCurrency(typedCtx, currency, initialRate);
          }
          return currency;
        },

        // ✅ update: ownership check + auto-crud update + 可选设汇率
        update: async ({ ctx, id, data, next }) => {
          const typedCtx = ctx as Context;
          if (typedCtx.organizationId !== 'platform') {
            await requireOwnership(typedCtx.organizationId!, id);
          }

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { rate, ...updateData } = data;
          const currency = await next({ ...updateData, updatedBy: typedCtx.userId! } as typeof data) as { code: string; isBase: number };

          if (rate) {
            await setRateForCurrency(typedCtx, currency, rate);
          }
          return currency;
        },

        // ✅ delete: ownership check + Service 层删除
        delete: async ({ ctx, id, existing, next: _next }) => {
          const typedCtx = ctx as Context;
          if (typedCtx.organizationId !== 'platform') {
            await requireOwnership(typedCtx.organizationId!, id);
          }
          const service = getCurrencyService();

          try {
            await service.delete(id);
            return existing as Currency;
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to delete currency',
            });
          }
        },

        // ✅ updateMany: 保护基础货币不被禁用
        updateMany: async ({ ids, data, next }) => {

          // 检查是否试图禁用基础货币
          if (data.isEnabled === false) {
            const service = getCurrencyService();
            for (const id of ids) {
              const currency = await service.getById(id);
              if (currency?.isBase === 1) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'Cannot disable base currency',
                });
              }
            }
          }

          return next();
        },

        // ✅ deleteMany: 保护基础货币不被删除
        deleteMany: async ({ ids, next }) => {

          const service = getCurrencyService();
          for (const id of ids) {
            const currency = await service.getById(id);
            if (currency?.isBase === 1) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cannot delete base currency',
              });
            }
          }

          return next();
        },
      },
    });

    return router({
      ...currenciesCrud.procedures,

      /**
       * Toggle currency enabled/disabled (with mode guard)
       */
      toggle: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'Currency' } })
        .input(z.object({ id: z.string(), enabled: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
          if (ctx.organizationId !== 'platform') {
            await requireOwnership(ctx.organizationId!, input.id);
          }
          const service = getCurrencyService();

          try {
            return await service.toggleEnabled(input.id, input.enabled);
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to toggle currency',
            });
          }
        }),

      /**
       * Set base currency (with mode guard)
       */
      setBase: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'Currency' } })
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (ctx.organizationId !== 'platform') {
            await requireOwnership(ctx.organizationId!, input.id);
          }
          const service = getCurrencyService();

          try {
            return await service.setBaseCurrency(
              ctx.organizationId!,
              input.id,
              ctx.userId
            );
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to set base currency',
            });
          }
        }),

      /**
       * Switch to custom configuration (allow_override mode only).
       * Copies platform currencies and exchange rates to the current tenant.
       */
      switchToCustom: protectedProcedure
        .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
        .mutation(async ({ ctx }) => {
          const orgId = ctx.organizationId!;
          if (orgId === 'platform') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Platform cannot switch to custom' });
          }

          const mode = getMode('currency');
          if (mode !== 'allow_override') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Switch to custom is only available in allow_override mode',
            });
          }

          const service = getCurrencyService();
          const hasCustom = await service.hasAnyCurrencies(orgId);
          if (hasCustom) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already using custom configuration' });
          }

          // Copy platform currencies to tenant
          const platformCurrencies = await service.getAllByOrganization('platform');
          for (const pc of platformCurrencies) {
            const createInput = {
              organizationId: orgId,
              code: pc.code,
              nameI18n: pc.nameI18n as Record<string, string>,
              symbol: pc.symbol,
              decimalDigits: pc.decimalDigits,
              isEnabled: pc.isEnabled === 1,
              isBase: pc.isBase === 1,
              ...(ctx.userId ? { createdBy: ctx.userId } : {}),
            };
            await service.create(createInput);
          }

          // Copy platform exchange rates to tenant
          const rateService = getExchangeRateService();
          const platformRates = await rateService.getAllCurrentRates('platform');
          if (platformRates.length > 0) {
            const bulkImportInput = {
              organizationId: orgId,
              rates: platformRates.map(r => ({
                baseCurrency: r.baseCurrency,
                targetCurrency: r.targetCurrency,
                rate: r.rate,
              })),
              source: 'manual' as const,
              effectiveAt: new Date(),
              ...(ctx.userId ? { updatedBy: ctx.userId } : {}),
            };
            await rateService.bulkImportRates(bulkImportInput);
          }

          // v2: Set customization flag so guard knows tenant has custom data
          await setCustomizationFlag('currency', orgId, true);

          return { success: true };
        }),

      /**
       * Reset to platform default (allow_override mode only).
       * Deletes the current tenant's currencies and exchange rates.
       */
      resetToPlatform: protectedProcedure
        .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
        .mutation(async ({ ctx }) => {
          const orgId = ctx.organizationId!;
          if (orgId === 'platform') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Platform cannot reset to platform' });
          }

          const mode = getMode('currency');
          if (mode !== 'allow_override') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Reset to platform is only available in allow_override mode',
            });
          }

          // Delete tenant exchange rates first (FK dependency)
          const exchangeRateRepo = new ExchangeRateRepository(db);
          await exchangeRateRepo.deleteAllByOrganization(orgId);

          // Delete tenant currencies
          await db.delete(currencies).where(eq(currencies.organizationId, orgId));

          // v2: Clear customization flag so guard reverts to platform data
          await setCustomizationFlag('currency', orgId, false);

          return { success: true };
        }),
    });
  })(),

  // =========================================
  // Exchange Rates Management (Admin)
  // =========================================

  rates: router({
    /**
     * List all current exchange rates (mode-aware)
     */
    list: publicProcedure
      .query(async ({ ctx }) => {
        const orgId = ctx.organizationId!;
        const service = getExchangeRateService();
        return service.getAllCurrentRates(orgId);
      }),

    /**
     * Get rate for a specific currency pair (mode-aware)
     */
    get: publicProcedure
      .input(
        z.object({
          baseCurrency: currencyCodeSchema,
          targetCurrency: currencyCodeSchema,
        })
      )
      .query(async ({ input, ctx }) => {
        const orgId = ctx.organizationId!;
        const service = getExchangeRateService();
        const rate = await service.getCurrentRate(
          orgId,
          input.baseCurrency,
          input.targetCurrency
        );

        if (!rate) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No rate found for ${input.baseCurrency}/${input.targetCurrency}`,
          });
        }

        return rate;
      }),

    /**
     * Get rate history for a currency pair (mode-aware)
     */
    history: publicProcedure
      .input(
        z.object({
          baseCurrency: currencyCodeSchema,
          targetCurrency: currencyCodeSchema,
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input, ctx }) => {
        const orgId = ctx.organizationId!;
        const service = getExchangeRateService();
        return service.getRateHistory(
          orgId,
          input.baseCurrency,
          input.targetCurrency,
          { limit: input.limit, offset: input.offset }
        );
      }),

    /**
     * Set an exchange rate (with mode guard)
     */
    set: protectedProcedure
      .meta({ permission: { action: 'update', subject: 'ExchangeRate' } })
      .input(setRateSchema)
      .mutation(async ({ input, ctx }) => {
        const service = getExchangeRateService();

        try {
          return await service.setRate({
            organizationId: ctx.organizationId!,
            baseCurrency: input.baseCurrency,
            targetCurrency: input.targetCurrency,
            rate: input.rate,
            source: 'manual',
            effectiveAt: input.effectiveAt ?? new Date(),
            updatedBy: ctx.userId!,
          });
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to set rate',
          });
        }
      }),

    /**
     * Bulk import exchange rates (with mode guard)
     */
    bulkImport: protectedProcedure
      .meta({ permission: { action: 'create', subject: 'ExchangeRate' } })
      .input(bulkRateImportSchema)
      .mutation(async ({ input, ctx }) => {
        const service = getExchangeRateService();

        try {
          const result = await service.bulkImportRates({
            organizationId: ctx.organizationId!,
            rates: input.rates,
            source: (input.source ?? 'manual') as 'manual' | `api:${string}`,
            effectiveAt: input.effectiveAt ?? new Date(),
            updatedBy: ctx.userId!,
          });

          return { imported: result.length };
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to import rates',
          });
        }
      }),
  }),

  // =========================================
  // Currency Tenant Policy
  // =========================================

  policy: currencyPolicyRouter,
});
