/**
 * Currency Database Schema
 *
 * Drizzle ORM table definitions for multi-currency support.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  index,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * I18n text for currency name
 */
export type CurrencyNameI18n = Record<string, string>;

/**
 * Exchange rate source type
 */
export type ExchangeRateSource = 'manual' | `api:${string}`;

// ============================================================
// Currencies Table
// ============================================================

/**
 * Currencies Table
 *
 * Stores currency configurations per organization.
 * Each organization can have multiple currencies with one base currency.
 */
export const currencies = pgTable(
  'currencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // ISO 4217 uppercase (USD, CNY, EUR)
    nameI18n: jsonb('name_i18n').notNull().$type<CurrencyNameI18n>(),
    symbol: text('symbol').notNull(), // '$', '¥', '€'
    decimalDigits: integer('decimal_digits').notNull().default(2),
    isEnabled: integer('is_enabled').notNull().default(1),
    isBase: integer('is_base').notNull().default(0),
    currentRate: numeric('current_rate', { precision: 18, scale: 8 }),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_currencies_org_code').on(table.organizationId, table.code),
    uniqueIndex('uq_currencies_org_base')
      .on(table.organizationId)
      .where(sql`is_base = 1`),
    index('idx_currencies_org').on(table.organizationId),
  ],
);

export type Currency = typeof currencies.$inferSelect;

// ============================================================
// Exchange Rates Table
// ============================================================

/**
 * Exchange Rates Table
 *
 * Stores exchange rates between currencies for each organization.
 * Supports historical rates with effective_at timestamp.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    baseCurrency: text('base_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    source: text('source').notNull().$type<ExchangeRateSource>(),
    effectiveAt: timestamp('effective_at').notNull(),
    expiresAt: timestamp('expires_at'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_exchange_rates_org_pair_time').on(
      table.organizationId,
      table.baseCurrency,
      table.targetCurrency,
      table.effectiveAt,
    ),
    index('idx_exchange_rates_org').on(table.organizationId),
    index('idx_exchange_rates_current').on(
      table.organizationId,
      table.baseCurrency,
      table.targetCurrency,
    ).where(sql`expires_at IS NULL`),
  ],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;

// ============================================================
// Zod Schemas
// ============================================================

export const currencySchema = createInsertSchema(currencies);
export const exchangeRateSchema = createInsertSchema(exchangeRates);
