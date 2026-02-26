/**
 * Currency Service
 *
 * Business logic + data access for currency management.
 * No separate repository — queries are simple CRUD, inlined here.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { currencies, type Currency } from '@wordrhyme/db';

export interface CreateCurrencyInput {
  organizationId: string;
  code: string;
  nameI18n: Record<string, string>;
  symbol: string;
  decimalDigits?: number;
  isEnabled?: boolean;
  isBase?: boolean;
  createdBy?: string;
}

export interface UpdateCurrencyInput {
  nameI18n?: Record<string, string>;
  symbol?: string;
  decimalDigits?: number;
  isEnabled?: boolean;
  updatedBy?: string;
}

export interface CurrencyWithRate extends Currency {
  currentRate: string | null;
}

export type CurrencyPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    @Inject('DATABASE') private readonly db: Database,
  ) {}

  // ============================================================================
  // Query Methods
  // ============================================================================

  async getById(id: string): Promise<Currency | null> {
    const [currency] = await this.db
      .select()
      .from(currencies)
      .where(eq(currencies.id, id))
      .limit(1);
    return currency ?? null;
  }

  async getByCode(organizationId: string, code: string): Promise<Currency | null> {
    const [currency] = await this.db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.organizationId, organizationId),
          eq(currencies.code, code.toUpperCase())
        )
      )
      .limit(1);
    return currency ?? null;
  }

  async getBaseCurrency(organizationId: string): Promise<Currency | null> {
    const [currency] = await this.db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.organizationId, organizationId),
          eq(currencies.isBase, 1)
        )
      )
      .limit(1);
    return currency ?? null;
  }

  async getAllByOrganization(organizationId: string): Promise<Currency[]> {
    return this.db
      .select()
      .from(currencies)
      .where(eq(currencies.organizationId, organizationId))
      .orderBy(desc(currencies.isBase), currencies.code);
  }

  async getEnabledByOrganization(organizationId: string): Promise<Currency[]> {
    return this.db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.organizationId, organizationId),
          eq(currencies.isEnabled, 1)
        )
      )
      .orderBy(desc(currencies.isBase), currencies.code);
  }

  async getEnabledWithRates(organizationId: string): Promise<CurrencyWithRate[]> {
    const enabledCurrencies = await this.getEnabledByOrganization(organizationId);

    return enabledCurrencies.map((currency) => ({
      ...currency,
      currentRate: currency.isBase === 1 ? '1' : (currency.currentRate ?? null),
    }));
  }

  // ============================================================================
  // Mutation Methods
  // ============================================================================

  async create(input: CreateCurrencyInput): Promise<Currency> {
    const { organizationId, code, nameI18n, symbol, decimalDigits, isEnabled, isBase, createdBy } = input;
    const normalizedCode = code.toUpperCase();

    const existing = await this.getByCode(organizationId, normalizedCode);
    if (existing) {
      throw new Error(`Currency ${normalizedCode} already exists for this organization`);
    }

    const hasAny = await this.hasAnyCurrencies(organizationId);
    const shouldBeBase = isBase === true || !hasAny;

    const [currency] = await this.db
      .insert(currencies)
      .values({
        organizationId,
        code: normalizedCode,
        nameI18n,
        symbol,
        decimalDigits: decimalDigits ?? 2,
        isEnabled: isEnabled === false ? 0 : 1,
        isBase: shouldBeBase ? 1 : 0,
        createdBy,
        updatedBy: createdBy,
      })
      .returning();

    this.logger.log(
      `Created currency ${currency!.code} for organization ${organizationId}${shouldBeBase ? ' (base)' : ''}`
    );

    return currency!;
  }

  async update(id: string, input: UpdateCurrencyInput): Promise<Currency> {
    const currency = await this.getById(id);
    if (!currency) {
      throw new Error(`Currency ${id} not found`);
    }

    if (currency.isBase === 1 && input.isEnabled === false) {
      throw new Error('Cannot disable base currency');
    }

    const [updated] = await this.db
      .update(currencies)
      .set({
        ...(input.nameI18n && { nameI18n: input.nameI18n }),
        ...(input.symbol && { symbol: input.symbol }),
        ...(input.decimalDigits !== undefined && { decimalDigits: input.decimalDigits }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled ? 1 : 0 }),
        ...(input.updatedBy && { updatedBy: input.updatedBy }),
        updatedAt: new Date(),
      })
      .where(eq(currencies.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update currency ${id}`);
    }

    this.logger.log(`Updated currency ${updated.code}`);
    return updated;
  }

  async toggleEnabled(id: string, enabled: boolean): Promise<Currency> {
    const currency = await this.getById(id);
    if (!currency) {
      throw new Error(`Currency ${id} not found`);
    }

    if (currency.isBase === 1 && !enabled) {
      throw new Error('Cannot disable base currency');
    }

    const [updated] = await this.db
      .update(currencies)
      .set({ isEnabled: enabled ? 1 : 0, updatedAt: new Date() })
      .where(eq(currencies.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to toggle currency ${id}`);
    }

    this.logger.log(`${enabled ? 'Enabled' : 'Disabled'} currency ${updated.code}`);
    return updated;
  }

  async setBaseCurrency(
    organizationId: string,
    currencyId: string,
    updatedBy?: string
  ): Promise<Currency> {
    const currency = await this.getById(currencyId);
    if (!currency) {
      throw new Error(`Currency ${currencyId} not found`);
    }
    if (currency.organizationId !== organizationId) {
      throw new Error('Currency does not belong to this organization');
    }
    if (currency.isBase === 1) {
      return currency;
    }

    const updated = await this.db.transaction(async (tx) => {
      // Clear existing base
      await tx
        .update(currencies)
        .set({ isBase: 0, updatedAt: new Date(), ...(updatedBy && { updatedBy }) })
        .where(and(eq(currencies.organizationId, organizationId), eq(currencies.isBase, 1)));

      // Set new base
      const [newBase] = await tx
        .update(currencies)
        .set({ isBase: 1, isEnabled: 1, updatedAt: new Date(), ...(updatedBy && { updatedBy }) })
        .where(eq(currencies.id, currencyId))
        .returning();

      return newBase;
    });

    if (!updated) {
      throw new Error(`Failed to set base currency ${currencyId}`);
    }

    this.logger.log(`Set ${updated.code} as base currency for organization ${organizationId}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const currency = await this.getById(id);
    if (!currency) {
      throw new Error(`Currency ${id} not found`);
    }
    if (currency.isBase === 1) {
      throw new Error('Cannot delete base currency. Set another currency as base first.');
    }

    await this.db.delete(currencies).where(eq(currencies.id, id));
    this.logger.log(`Deleted currency ${currency.code}`);
  }

  // ============================================================================
  // Mode-Aware Query Methods
  // ============================================================================

  /**
   * Get enabled currencies with rates, resolved by policy mode.
   * Used by public API (frontend currency selector).
   */
  async getEnabledForOrganization(
    organizationId: string,
    mode: CurrencyPolicyMode,
  ): Promise<CurrencyWithRate[]> {
    const resolvedOrgId = await this.resolveOrgId(organizationId, mode);
    return this.getEnabledWithRates(resolvedOrgId);
  }

  /**
   * Get all currencies with source tag, resolved by policy mode.
   * Used by admin management page.
   */
  async getResolvedCurrencies(
    organizationId: string,
    mode: CurrencyPolicyMode,
  ): Promise<(Currency & { source: 'platform' | 'tenant' })[]> {
    if (organizationId === 'platform') {
      const data = await this.getAllByOrganization('platform');
      return data.map(c => ({ ...c, source: 'platform' as const }));
    }

    switch (mode) {
      case 'unified': {
        const data = await this.getAllByOrganization('platform');
        return data.map(c => ({ ...c, source: 'platform' as const }));
      }
      case 'require_tenant': {
        const data = await this.getAllByOrganization(organizationId);
        return data.map(c => ({ ...c, source: 'tenant' as const }));
      }
      case 'allow_override': {
        const tenantData = await this.getAllByOrganization(organizationId);
        if (tenantData.length > 0) {
          return tenantData.map(c => ({ ...c, source: 'tenant' as const }));
        }
        const platformData = await this.getAllByOrganization('platform');
        return platformData.map(c => ({ ...c, source: 'platform' as const }));
      }
    }
  }

  /**
   * Resolve effective organization ID based on policy mode.
   */
  async resolveOrgId(organizationId: string, mode: CurrencyPolicyMode): Promise<string> {
    if (organizationId === 'platform') return 'platform';
    switch (mode) {
      case 'unified': return 'platform';
      case 'require_tenant': return organizationId;
      case 'allow_override': {
        const has = await this.hasAnyCurrencies(organizationId);
        return has ? organizationId : 'platform';
      }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  async hasAnyCurrencies(organizationId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(currencies)
      .where(eq(currencies.organizationId, organizationId));
    return (result?.count ?? 0) > 0;
  }
}
