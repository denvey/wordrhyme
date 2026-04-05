import { TRPCError } from '@trpc/server';
import {
  getGeoCountryQuery,
  getGeoSubdivisionQuery,
  listGeoCountriesQuery,
  listGeoSubdivisionsQuery,
} from '@wordrhyme/db';
import { router, publicProcedure } from '../trpc';

function resolveLocalizedName(
  names: Record<string, string>,
  locale?: string,
  fallbackLocale = 'en-US'
): string {
  if (!names || Object.keys(names).length === 0) {
    return '';
  }

  if (locale && names[locale]) {
    return names[locale];
  }

  if (locale) {
    const language = locale.split('-')[0];
    const matchedEntry = Object.entries(names).find(([key]) => key.split('-')[0] === language);
    if (matchedEntry) {
      return matchedEntry[1];
    }
  }

  if (names[fallbackLocale]) {
    return names[fallbackLocale];
  }

  return Object.values(names)[0] ?? '';
}

export const geoRouter = router({
  listCountries: publicProcedure.input(listGeoCountriesQuery).query(async ({ ctx, input }) => {
    const countries = await (ctx.db as any).query.geoCountries.findMany({
      where: input.supportedOnly ? { isSupported: true } : undefined,
      orderBy: (table: any, { asc }: { asc: (column: unknown) => unknown }) => [
        asc(table.sortOrder),
        asc(table.code2),
      ],
      limit: input.limit,
      offset: input.offset,
    });

    return countries.map((country: any) => ({
      ...country,
      displayName: resolveLocalizedName(country.name, input.locale),
      displayOfficialName: country.officialName
        ? resolveLocalizedName(country.officialName, input.locale)
        : null,
    }));
  }),

  getCountry: publicProcedure.input(getGeoCountryQuery).query(async ({ ctx, input }) => {
    const country = await (ctx.db as any).query.geoCountries.findFirst({
      where: { code2: input.code2 },
    });

    if (!country) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Country ${input.code2} not found`,
      });
    }

    return {
      ...country,
      displayName: resolveLocalizedName(country.name, input.locale),
      displayOfficialName: country.officialName
        ? resolveLocalizedName(country.officialName, input.locale)
        : null,
    };
  }),

  listSubdivisions: publicProcedure
    .input(listGeoSubdivisionsQuery)
    .query(async ({ ctx, input }) => {
      const subdivisions = await (ctx.db as any).query.geoSubdivisions.findMany({
        where: input.supportedOnly
          ? {
              countryCode2: input.countryCode2,
              isSupported: true,
            }
          : {
              countryCode2: input.countryCode2,
            },
        orderBy: (table: any, { asc }: { asc: (column: unknown) => unknown }) => [
          asc(table.sortOrder),
          asc(table.code),
        ],
        limit: input.limit,
        offset: input.offset,
      });

      return subdivisions.map((subdivision: any) => ({
        ...subdivision,
        displayName: resolveLocalizedName(subdivision.name, input.locale),
      }));
    }),

  getSubdivision: publicProcedure.input(getGeoSubdivisionQuery).query(async ({ ctx, input }) => {
    const subdivision = await (ctx.db as any).query.geoSubdivisions.findFirst({
      where: { fullCode: input.fullCode },
    });

    if (!subdivision) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Subdivision ${input.fullCode} not found`,
      });
    }

    return {
      ...subdivision,
      displayName: resolveLocalizedName(subdivision.name, input.locale),
    };
  }),
});
