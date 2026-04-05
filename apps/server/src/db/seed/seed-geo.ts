import { geoCountries, geoSubdivisions } from '@wordrhyme/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { GEO_COUNTRIES, GEO_SUBDIVISIONS } from './data/geo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = { insert: (table: any) => any };

export async function seedGeoReferenceData(db: AnyDatabase): Promise<void> {
  console.log('[seed-geo] Seeding geo countries...');

  for (const country of GEO_COUNTRIES) {
    await db
      .insert(geoCountries)
      .values({
        id: crypto.randomUUID(),
        code2: country.code2,
        code3: country.code3,
        numericCode: country.numericCode,
        name: country.name,
        officialName: country.officialName ?? null,
        flags: country.flags ?? null,
        currencyCode: country.currencyCode ?? null,
        languageCode: country.languageCode ?? null,
        locale: country.locale ?? null,
        phoneCode: country.phoneCode ?? null,
        isSupported: country.isSupported ?? true,
        sortOrder: country.sortOrder ?? 0,
      })
      .onConflictDoUpdate({
        target: geoCountries.code2,
        set: {
          code3: country.code3,
          numericCode: country.numericCode,
          name: country.name,
          officialName: country.officialName ?? null,
          flags: country.flags ?? null,
          currencyCode: country.currencyCode ?? null,
          languageCode: country.languageCode ?? null,
          locale: country.locale ?? null,
          phoneCode: country.phoneCode ?? null,
          isSupported: country.isSupported ?? true,
          sortOrder: country.sortOrder ?? 0,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`[seed-geo] Upserted ${GEO_COUNTRIES.length} countries`);
  console.log('[seed-geo] Seeding geo subdivisions...');

  for (const subdivision of GEO_SUBDIVISIONS) {
    await db
      .insert(geoSubdivisions)
      .values({
        id: crypto.randomUUID(),
        countryCode2: subdivision.countryCode2,
        code: subdivision.code,
        fullCode: subdivision.fullCode,
        name: subdivision.name,
        type: subdivision.type ?? null,
        isSupported: subdivision.isSupported ?? true,
        sortOrder: subdivision.sortOrder ?? 0,
      })
      .onConflictDoUpdate({
        target: geoSubdivisions.fullCode,
        set: {
          countryCode2: subdivision.countryCode2,
          code: subdivision.code,
          name: subdivision.name,
          type: subdivision.type ?? null,
          isSupported: subdivision.isSupported ?? true,
          sortOrder: subdivision.sortOrder ?? 0,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`[seed-geo] Upserted ${GEO_SUBDIVISIONS.length} subdivisions`);
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  config({ path: resolve(__dirname, '../../../../../.env') });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in environment');
  }

  const db = drizzle(databaseUrl);
  await seedGeoReferenceData(db as any);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error('[seed-geo] Failed:', error);
    process.exit(1);
  });
}
