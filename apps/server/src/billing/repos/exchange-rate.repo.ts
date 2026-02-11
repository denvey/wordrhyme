/**
 * Exchange Rate Repository
 *
 * Data access layer for exchange rates and version tracking.
 * Handles rate queries, historical rates, and cache invalidation versioning.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, lte, gt, isNull, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  exchangeRates,
  currencies,
  type ExchangeRate,
} from '@wordrhyme/db';

@Injectable()
export class ExchangeRateRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  // ============================================================================
  // Exchange Rate Queries
  // ============================================================================

  /**
   * Get current exchange rate for a currency pair
   * Returns the most recent effective rate that hasn't expired
   */
  async getCurrentRate(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string
  ): Promise<ExchangeRate | null> {
    const now = new Date();
    const [rate] = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.organizationId, organizationId),
          eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
          eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase()),
          lte(exchangeRates.effectiveAt, now),
          or(
            isNull(exchangeRates.expiresAt),
            gt(exchangeRates.expiresAt, now)
          )
        )
      )
      .orderBy(desc(exchangeRates.effectiveAt))
      .limit(1);
    return rate ?? null;
  }

  /**
   * Get rate at a specific point in time (for historical conversions)
   */
  async getRateAt(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string,
    at: Date
  ): Promise<ExchangeRate | null> {
    const [rate] = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.organizationId, organizationId),
          eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
          eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase()),
          lte(exchangeRates.effectiveAt, at),
          or(
            isNull(exchangeRates.expiresAt),
            gt(exchangeRates.expiresAt, at)
          )
        )
      )
      .orderBy(desc(exchangeRates.effectiveAt))
      .limit(1);
    return rate ?? null;
  }

  /**
   * Get all current rates for an organization
   * Returns the most recent effective rate for each currency pair
   */
  async getAllCurrentRates(organizationId: string): Promise<ExchangeRate[]> {
    const now = new Date();
    // Get all current rates, then deduplicate by currency pair (keep latest)
    const rates = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.organizationId, organizationId),
          lte(exchangeRates.effectiveAt, now),
          or(
            isNull(exchangeRates.expiresAt),
            gt(exchangeRates.expiresAt, now)
          )
        )
      )
      .orderBy(
        exchangeRates.baseCurrency,
        exchangeRates.targetCurrency,
        desc(exchangeRates.effectiveAt)
      );

    // Deduplicate: keep only the first (latest) rate per currency pair
    const seen = new Set<string>();
    return rates.filter((rate) => {
      const key = `${rate.baseCurrency}:${rate.targetCurrency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    let query = this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.organizationId, organizationId),
          eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
          eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase())
        )
      )
      .orderBy(desc(exchangeRates.effectiveAt));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  }

  // ============================================================================
  // Exchange Rate Mutations
  // ============================================================================

  /**
   * Create a new exchange rate
   * Also increments the version for cache invalidation
   */
  async create(data: typeof exchangeRates.$inferInsert): Promise<ExchangeRate> {
    const [rate] = await this.db
      .insert(exchangeRates)
      .values(data)
      .returning();

    return rate!;
  }

  /**
   * Set a new rate (creates new record, optionally expires old one)
   * This is the main method for updating rates
   */
  async setRate(
    organizationId: string,
    baseCurrency: string,
    targetCurrency: string,
    rate: string,
    source: 'manual' | `api:${string}`,
    effectiveAt: Date,
    updatedBy?: string
  ): Promise<ExchangeRate> {
    return this.db.transaction(async (tx) => {
      // Expire any current rate for this pair
      await tx
        .update(exchangeRates)
        .set({
          expiresAt: effectiveAt,
          updatedAt: new Date(),
          ...(updatedBy && { updatedBy }),
        })
        .where(
          and(
            eq(exchangeRates.organizationId, organizationId),
            eq(exchangeRates.baseCurrency, baseCurrency.toUpperCase()),
            eq(exchangeRates.targetCurrency, targetCurrency.toUpperCase()),
            isNull(exchangeRates.expiresAt)
          )
        );

      // Insert new rate
      const [newRate] = await tx
        .insert(exchangeRates)
        .values({
          organizationId,
          baseCurrency: baseCurrency.toUpperCase(),
          targetCurrency: targetCurrency.toUpperCase(),
          rate,
          source,
          effectiveAt,
          createdBy: updatedBy,
          updatedBy,
        })
        .returning();

      // Sync currentRate to currencies table
      await tx
        .update(currencies)
        .set({ currentRate: rate, updatedAt: new Date() })
        .where(
          and(
            eq(currencies.organizationId, organizationId),
            eq(currencies.code, targetCurrency.toUpperCase()),
          )
        );

      return newRate!;
    });
  }

  /**
   * Bulk set rates (for API imports)
   */
  async bulkSetRates(
    organizationId: string,
    rates: Array<{
      baseCurrency: string;
      targetCurrency: string;
      rate: string;
    }>,
    source: 'manual' | `api:${string}`,
    effectiveAt: Date,
    updatedBy?: string
  ): Promise<ExchangeRate[]> {
    if (rates.length === 0) return [];

    return this.db.transaction(async (tx) => {
      const results: ExchangeRate[] = [];

      for (const r of rates) {
        // Expire current rate
        await tx
          .update(exchangeRates)
          .set({
            expiresAt: effectiveAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(exchangeRates.organizationId, organizationId),
              eq(exchangeRates.baseCurrency, r.baseCurrency.toUpperCase()),
              eq(exchangeRates.targetCurrency, r.targetCurrency.toUpperCase()),
              isNull(exchangeRates.expiresAt)
            )
          );

        // Insert new rate
        const [newRate] = await tx
          .insert(exchangeRates)
          .values({
            organizationId,
            baseCurrency: r.baseCurrency.toUpperCase(),
            targetCurrency: r.targetCurrency.toUpperCase(),
            rate: r.rate,
            source,
            effectiveAt,
            createdBy: updatedBy,
            updatedBy,
          })
          .returning();

        // Sync currentRate to currencies table
        await tx
          .update(currencies)
          .set({ currentRate: r.rate, updatedAt: new Date() })
          .where(
            and(
              eq(currencies.organizationId, organizationId),
              eq(currencies.code, r.targetCurrency.toUpperCase()),
            )
          );

        results.push(newRate!);
      }

      return results;
    });
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a specific rate by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(exchangeRates)
      .where(eq(exchangeRates.id, id))
      .returning();
    return result.length > 0;
  }

  /**
   * Delete all rates for an organization (for cleanup)
   */
  async deleteAllByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .delete(exchangeRates)
      .where(eq(exchangeRates.organizationId, organizationId))
      .returning();
    return result.length;
  }
}
