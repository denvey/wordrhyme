/**
 * Exchange Rate Service
 *
 * Business logic for exchange rate management and currency conversion.
 * Implements Banker's Rounding (half-to-even) for financial precision.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExchangeRateRepository } from '../repos/exchange-rate.repo';
import type { CurrencyService } from './currency.service';
import type { ExchangeRate } from '@wordrhyme/db';
import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
});

/**
 * Input for setting an exchange rate
 */
export interface SetRateInput {
  organizationId: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  source?: 'manual' | `api:${string}`;
  effectiveAt?: Date;
  updatedBy?: string;
}

/**
 * Input for bulk rate import
 */
export interface BulkRateImportInput {
  organizationId: string;
  rates: Array<{
    baseCurrency: string;
    targetCurrency: string;
    rate: string;
  }>;
  source?: 'manual' | `api:${string}`;
  effectiveAt?: Date;
  updatedBy?: string;
}

/**
 * Currency conversion result
 */
export interface ConversionResult {
  fromCurrency: string;
  toCurrency: string;
  fromAmountCents: number;
  toAmountCents: number;
  rate: string;
  rateAt: Date;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly rateRepo: ExchangeRateRepository,
    private readonly currencyService: CurrencyService
  ) {}

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get current rate for a currency pair
   */
  async getCurrentRate(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string
  ): Promise<ExchangeRate | null> {
    return this.rateRepo.getCurrentRate(organizationId, baseCurrency, targetCurrency);
  }

  /**
   * Get rate at a specific point in time
   */
  async getRateAt(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string,
    at: Date
  ): Promise<ExchangeRate | null> {
    return this.rateRepo.getRateAt(organizationId, baseCurrency, targetCurrency, at);
  }

  /**
   * Get all current rates for an organization
   */
  async getAllCurrentRates(organizationId: string): Promise<ExchangeRate[]> {
    return this.rateRepo.getAllCurrentRates(organizationId);
  }

  /**
   * Get rate history for a currency pair
   */
  async getRateHistory(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ExchangeRate[]> {
    return this.rateRepo.getRateHistory(
      organizationId,
      baseCurrency,
      targetCurrency,
      options
    );
  }

  // ============================================================================
  // Rate Management
  // ============================================================================

  /**
   * Set an exchange rate
   */
  async setRate(input: SetRateInput): Promise<ExchangeRate> {
    const {
      organizationId,
      baseCurrency,
      targetCurrency,
      rate,
      source = 'manual',
      effectiveAt = new Date(),
      updatedBy,
    } = input;

    // Validate rate is positive number
    const rateDecimal = new Decimal(rate);
    if (rateDecimal.lte(0)) {
      throw new Error('Exchange rate must be positive');
    }

    // Validate currencies exist and are enabled
    const [baseCurr, targetCurr] = await Promise.all([
      this.currencyService.getByCode(organizationId, baseCurrency),
      this.currencyService.getByCode(organizationId, targetCurrency),
    ]);

    if (!baseCurr) {
      throw new Error(`Base currency ${baseCurrency} not found`);
    }
    if (!targetCurr) {
      throw new Error(`Target currency ${targetCurrency} not found`);
    }

    const exchangeRate = await this.rateRepo.setRate(
      organizationId,
      baseCurrency,
      targetCurrency,
      rate,
      source,
      effectiveAt,
      updatedBy
    );

    this.logger.log(
      `Set rate ${baseCurrency}/${targetCurrency} = ${rate} for org ${organizationId}`
    );

    return exchangeRate;
  }

  /**
   * Bulk import rates (e.g., from external API)
   */
  async bulkImportRates(input: BulkRateImportInput): Promise<ExchangeRate[]> {
    const {
      organizationId,
      rates,
      source = 'manual',
      effectiveAt = new Date(),
      updatedBy,
    } = input;

    if (rates.length === 0) {
      return [];
    }

    // Validate all rates are positive
    for (const r of rates) {
      const rateDecimal = new Decimal(r.rate);
      if (rateDecimal.lte(0)) {
        throw new Error(
          `Invalid rate for ${r.baseCurrency}/${r.targetCurrency}: must be positive`
        );
      }
    }

    const result = await this.rateRepo.bulkSetRates(
      organizationId,
      rates,
      source,
      effectiveAt,
      updatedBy
    );

    this.logger.log(
      `Bulk imported ${result.length} rates for org ${organizationId}`
    );

    return result;
  }

  // ============================================================================
  // Currency Conversion
  // ============================================================================

  /**
   * Convert amount between currencies using current rate
   * Uses Banker's Rounding (half-to-even) for final cents calculation
   *
   * @param organizationId - Organization context
   * @param fromCurrency - Source currency code
   * @param toCurrency - Target currency code
   * @param amountCents - Amount in source currency (cents/smallest unit)
   * @returns Conversion result with rate information
   */
  async convert(
    organizationId: string,
    fromCurrency: string,
    toCurrency: string,
    amountCents: number
  ): Promise<ConversionResult> {
    // Same currency - no conversion needed
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromAmountCents: amountCents,
        toAmountCents: amountCents,
        rate: '1',
        rateAt: new Date(),
      };
    }

    // Get base currency for the organization
    const baseCurrency = await this.currencyService.getBaseCurrency(organizationId);
    if (!baseCurrency) {
      throw new Error('No base currency configured for organization');
    }

    const now = new Date();
    let rate: ExchangeRate | null;
    let effectiveRate: Decimal;

    // Try direct rate first
    rate = await this.rateRepo.getCurrentRate(
      organizationId,
      fromCurrency,
      toCurrency
    );

    if (rate) {
      effectiveRate = new Decimal(rate.rate);
    } else {
      // Try inverse rate
      const inverseRate = await this.rateRepo.getCurrentRate(
        organizationId,
        toCurrency,
        fromCurrency
      );

      if (inverseRate) {
        effectiveRate = new Decimal(1).div(new Decimal(inverseRate.rate));
        rate = inverseRate;
      } else {
        // Try triangulation through base currency
        const [fromBaseRate, toBaseRate] = await Promise.all([
          this.rateRepo.getCurrentRate(organizationId, baseCurrency.code, fromCurrency),
          this.rateRepo.getCurrentRate(organizationId, baseCurrency.code, toCurrency),
        ]);

        if (!fromBaseRate || !toBaseRate) {
          throw new Error(
            `No exchange rate available for ${fromCurrency}/${toCurrency}`
          );
        }

        // Calculate cross rate: (1/fromBaseRate) * toBaseRate
        const fromRate = new Decimal(fromBaseRate.rate);
        const toRate = new Decimal(toBaseRate.rate);
        effectiveRate = toRate.div(fromRate);
        rate = toBaseRate; // Use the most recent rate for timestamp
      }
    }

    // Convert using Decimal for precision
    const fromAmount = new Decimal(amountCents);
    const toAmount = fromAmount.times(effectiveRate);

    // Round to integer cents using Banker's rounding
    const toAmountCents = toAmount.round().toNumber();

    return {
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      fromAmountCents: amountCents,
      toAmountCents,
      rate: effectiveRate.toFixed(8),
      rateAt: rate.effectiveAt,
    };
  }

  /**
   * Convert amount at a specific historical time
   */
  async convertAt(
    organizationId: string,
    fromCurrency: string,
    toCurrency: string,
    amountCents: number,
    at: Date
  ): Promise<ConversionResult> {
    // Same currency - no conversion needed
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromAmountCents: amountCents,
        toAmountCents: amountCents,
        rate: '1',
        rateAt: at,
      };
    }

    // Get rate at the specified time
    const rate = await this.rateRepo.getRateAt(
      organizationId,
      fromCurrency,
      toCurrency,
      at
    );

    if (!rate) {
      throw new Error(
        `No exchange rate available for ${fromCurrency}/${toCurrency} at ${at.toISOString()}`
      );
    }

    const fromAmount = new Decimal(amountCents);
    const rateDecimal = new Decimal(rate.rate);
    const toAmount = fromAmount.times(rateDecimal);
    const toAmountCents = toAmount.round().toNumber();

    return {
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      fromAmountCents: amountCents,
      toAmountCents,
      rate: rate.rate,
      rateAt: rate.effectiveAt,
    };
  }

  /**
   * Format amount for display (client-side helper data)
   * Returns formatting info for the frontend to use
   */
  async getFormattingInfo(
    organizationId: string,
    currencyCode: string
  ): Promise<{
    code: string;
    symbol: string;
    decimalDigits: number;
    nameI18n: Record<string, string>;
  } | null> {
    const currency = await this.currencyService.getByCode(organizationId, currencyCode);
    if (!currency) return null;

    return {
      code: currency.code,
      symbol: currency.symbol,
      decimalDigits: currency.decimalDigits,
      nameI18n: currency.nameI18n as Record<string, string>,
    };
  }
}
