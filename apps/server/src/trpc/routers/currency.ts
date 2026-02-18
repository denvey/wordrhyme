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
import { router, publicProcedure, protectedProcedure } from '../trpc';
import type { Context } from '../context';
import { createCrudRouter, type CrudOperation } from '@wordrhyme/auto-crud-server';
import { CurrencyService } from '../../billing/services/currency.service';
import { ExchangeRateService } from '../../billing/services/exchange-rate.service';
import { ExchangeRateRepository } from '../../billing/repos/exchange-rate.repo';
import { db } from '../../db';
import { currencies, type Currency } from '@wordrhyme/db';

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
      const num = parseFloat(val);
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
      // 登录页没有组织上下文，返回空数组
      return [];
    }

    const currencyService = getCurrencyService();
    const currencies = await currencyService.getEnabledWithRates(organizationId);

    return currencies.map((c) => ({
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
    const currenciesCrud = createCrudRouter({
      table: currencies,
      // 🚀 零配置 + omitFields 排除额外字段
      omitFields: ['organizationId', 'createdBy', 'updatedBy', 'isBase'],  // 默认已排除 id, createdAt, updatedAt
      updateSchema: updateCurrencySchema,
      procedureFactory: (op: CrudOperation) => {
        // list/get 操作公开访问（货币列表在登录页就需要）
        if (op === 'list' || op === 'get') {
          return publicProcedure;
        }
        // 其他操作需要权限检查
        const action = op === 'deleteMany' ? 'delete' :
            op === 'updateMany' ? 'update' :
              op === 'create' || op === 'update' || op === 'delete' ? op : 'read';
        return protectedProcedure.meta({
          permission: { action, subject: 'Currency' },
        });
      },
      middleware: {
        // ✅ create: 通过 Service 层创建（处理业务逻辑）
        create: async ({ ctx, input, next: _next }) => {
          const typedCtx = ctx as Context;
          const service = getCurrencyService();

          try {
            // Service 层处理业务逻辑
            return await service.create({
              organizationId: typedCtx.organizationId!,
              code: input.code,
              nameI18n: input.nameI18n,
              symbol: input.symbol,
              decimalDigits: input.decimalDigits ?? 2,
              isEnabled: input.isEnabled ?? true,
              createdBy: typedCtx.userId!,
            });
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to create currency',
            });
          }
        },

        // ✅ update: 通过 Service 层更新
        update: async ({ ctx, id, data, next: _next }) => {
          const typedCtx = ctx as Context;
          const service = getCurrencyService();

          try {
            // 过滤掉 undefined 值，只保留实际要更新的字段
            const updateData: Record<string, unknown> = {};
            if (data.symbol !== undefined) updateData['symbol'] = data.symbol;
            if (data.nameI18n !== undefined) updateData['nameI18n'] = data.nameI18n;
            if (data.decimalDigits !== undefined) updateData['decimalDigits'] = data.decimalDigits;
            if (data.isEnabled !== undefined) updateData['isEnabled'] = data.isEnabled;
            updateData['updatedBy'] = typedCtx.userId!;

            return await service.update(id, updateData);
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to update currency',
            });
          }
        },

        // ✅ delete: 通过 Service 层删除，必须返回删除的记录
        delete: async ({ id, existing, next: _next }) => {
          const service = getCurrencyService();

          try {
            await service.delete(id);
            // 返回 existing（已删除的记录），符合 auto-crud-server 的返回类型要求
            return existing as Currency;
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to delete currency',
            });
          }
        },
      },
    });

    return router({
      ...currenciesCrud.procedures,

      /**
       * Toggle currency enabled/disabled
       */
      toggle: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'Currency' } })
        .input(z.object({ id: z.string(), enabled: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
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
       * Set base currency
       */
      setBase: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'Currency' } })
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
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
    });
  })(),

  // =========================================
  // Exchange Rates Management (Admin)
  // =========================================

  rates: router({
    /**
     * List all current exchange rates
     * 公开访问（汇率在登录页就需要）
     */
    list: publicProcedure
      .query(async ({ ctx }) => {
        const service = getExchangeRateService();
        return service.getAllCurrentRates(ctx.organizationId!);
      }),

    /**
     * Get rate for a specific currency pair
     * 公开访问（汇率在登录页就需要）
     */
    get: publicProcedure
      .input(
        z.object({
          baseCurrency: currencyCodeSchema,
          targetCurrency: currencyCodeSchema,
        })
      )
      .query(async ({ input, ctx }) => {
        const service = getExchangeRateService();
        const rate = await service.getCurrentRate(
          ctx.organizationId!,
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
     * Get rate history for a currency pair
     * 公开访问（汇率历史是公开数据）
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
        const service = getExchangeRateService();
        return service.getRateHistory(
          ctx.organizationId!,
          input.baseCurrency,
          input.targetCurrency,
          { limit: input.limit, offset: input.offset }
        );
      }),

    /**
     * Set an exchange rate
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
     * Bulk import exchange rates
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
});
