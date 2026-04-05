/**
 * Geo Reference Database Schema
 *
 * Core-owned country and subdivision reference data.
 * Source of truth lives in static seed data, database is the runtime read model.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { paginationSchema } from './common';
import { localeSchema } from './i18n';

export type GeoName = Record<string, string>;
export type GeoFlags = {
  png: string;
  svg: string;
  alt?: string | null;
  emoji?: string | null;
};

export const geoNameSchema = z
  .record(z.string(), z.string())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one localized name is required',
  });

export const countryCode2Schema = z
  .string()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, 'Country code must be ISO 3166-1 alpha-2')
  .transform((value) => value.toUpperCase());

export const countryCode3Schema = z
  .string()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Country code must be ISO 3166-1 alpha-3')
  .transform((value) => value.toUpperCase());

export const subdivisionFullCodeSchema = z
  .string()
  .min(4)
  .regex(/^[A-Za-z]{2}-[A-Za-z0-9]+$/, 'Subdivision code must look like ISO 3166-2')
  .transform((value) => value.toUpperCase());

export const geoCountries = pgTable(
  'geo_countries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code2: text('code2').notNull(),
    code3: text('code3'),
    numericCode: text('numeric_code'),
    name: jsonb('name').notNull().$type<GeoName>(),
    officialName: jsonb('official_name').$type<GeoName | null>(),
    flags: jsonb('flags').$type<GeoFlags | null>(),
    currencyCode: text('currency_code'),
    languageCode: text('language_code'),
    locale: text('locale'),
    phoneCode: text('phone_code'),
    isSupported: boolean('is_supported').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('geo_countries_code2_uidx').on(table.code2),
    uniqueIndex('geo_countries_code3_uidx').on(table.code3),
    index('geo_countries_supported_sort_idx').on(table.isSupported, table.sortOrder),
  ]
);

export const geoSubdivisions = pgTable(
  'geo_subdivisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    countryCode2: text('country_code2')
      .notNull()
      .references(() => geoCountries.code2, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    fullCode: text('full_code').notNull(),
    name: jsonb('name').notNull().$type<GeoName>(),
    type: text('type'),
    isSupported: boolean('is_supported').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('geo_subdivisions_full_code_uidx').on(table.fullCode),
    uniqueIndex('geo_subdivisions_country_code_uidx').on(table.countryCode2, table.code),
    index('geo_subdivisions_country_sort_idx').on(table.countryCode2, table.sortOrder),
    index('geo_subdivisions_country_supported_idx').on(table.countryCode2, table.isSupported),
  ]
);

export type GeoCountry = typeof geoCountries.$inferSelect;
export type GeoSubdivision = typeof geoSubdivisions.$inferSelect;

export const geoCountrySchema = createInsertSchema(geoCountries, {
  code2: () => countryCode2Schema,
  code3: () => countryCode3Schema.optional(),
  name: () => geoNameSchema,
  officialName: () => geoNameSchema.nullish(),
});

export const geoSubdivisionSchema = createInsertSchema(geoSubdivisions, {
  countryCode2: () => countryCode2Schema,
  fullCode: () => subdivisionFullCodeSchema,
  name: () => geoNameSchema,
});

export const getGeoCountryQuery = z.object({
  code2: countryCode2Schema,
  locale: localeSchema.optional(),
});

export const listGeoCountriesQuery = paginationSchema.partial().extend({
  limit: z.number().int().min(1).max(300).default(300),
  offset: z.number().int().min(0).default(0),
  locale: localeSchema.optional(),
  supportedOnly: z.boolean().default(true),
});

export const getGeoSubdivisionQuery = z.object({
  fullCode: subdivisionFullCodeSchema,
  locale: localeSchema.optional(),
});

export const listGeoSubdivisionsQuery = paginationSchema.partial().extend({
  limit: z.number().int().min(1).max(500).default(500),
  offset: z.number().int().min(0).default(0),
  countryCode2: countryCode2Schema,
  locale: localeSchema.optional(),
  supportedOnly: z.boolean().default(true),
});
