/**
 * Currency System Seed Data
 *
 * Seeds default currencies and exchange rate versions for an organization.
 *
 * Usage:
 * - Call seedOrganizationCurrencies() when creating a new organization
 * - Call seedDefaultCurrencies() to add common currencies
 */
import { currencies } from '@wordrhyme/db';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = { insert: (table: any) => any; select: () => any };

/**
 * Default currencies available in the system
 */
export const DEFAULT_CURRENCIES = [
  {
    code: 'USD',
    nameI18n: { 'en-US': 'US Dollar', 'zh-CN': '美元' },
    symbol: '$',
    decimalDigits: 2,
    isEnabled: 1,
    isBase: 1, // Default base currency
  },
  {
    code: 'CNY',
    nameI18n: { 'en-US': 'Chinese Yuan', 'zh-CN': '人民币' },
    symbol: '¥',
    decimalDigits: 2,
    isEnabled: 1,
    isBase: 0,
  },
  {
    code: 'EUR',
    nameI18n: { 'en-US': 'Euro', 'zh-CN': '欧元' },
    symbol: '€',
    decimalDigits: 2,
    isEnabled: 1,
    isBase: 0,
  },
  {
    code: 'GBP',
    nameI18n: { 'en-US': 'British Pound', 'zh-CN': '英镑' },
    symbol: '£',
    decimalDigits: 2,
    isEnabled: 0, // Disabled by default
    isBase: 0,
  },
  {
    code: 'JPY',
    nameI18n: { 'en-US': 'Japanese Yen', 'zh-CN': '日元' },
    symbol: '¥',
    decimalDigits: 0, // JPY has no decimal places
    isEnabled: 0, // Disabled by default
    isBase: 0,
  },
];

/**
 * Generate a unique ID for currency records
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Seeds default currencies for an organization
 *
 * @param db - Database instance
 * @param organizationId - Organization ID to seed currencies for
 * @param createdBy - User ID who created the currencies
 */
export async function seedOrganizationCurrencies(
  db: AnyDatabase,
  organizationId: string,
  createdBy?: string
): Promise<void> {
  console.log(`[seed-currencies] Seeding currencies for organization: ${organizationId}`);

  // Check if currencies already exist for this organization
  const existingCurrencies = await db
    .select()
    .from(currencies)
    .where(eq(currencies.organizationId, organizationId));

  if (existingCurrencies.length > 0) {
    console.log(`[seed-currencies] Currencies already exist for organization ${organizationId}, skipping...`);
    return;
  }

  // Insert default currencies
  const currencyRecords = DEFAULT_CURRENCIES.map((currency) => ({
    id: generateId(),
    organizationId,
    code: currency.code,
    nameI18n: currency.nameI18n,
    symbol: currency.symbol,
    decimalDigits: currency.decimalDigits,
    isEnabled: currency.isEnabled,
    isBase: currency.isBase,
    createdBy,
    updatedBy: createdBy,
  }));

  await db.insert(currencies).values(currencyRecords);
  console.log(`[seed-currencies] Inserted ${currencyRecords.length} currencies`);
}

/**
 * Seeds only the base currency (USD) for a new organization
 * Use this for minimal setup
 *
 * @param db - Database instance
 * @param organizationId - Organization ID
 * @param createdBy - User ID
 */
export async function seedBaseCurrency(
  db: AnyDatabase,
  organizationId: string,
  createdBy?: string
): Promise<void> {
  console.log(`[seed-currencies] Seeding base currency for organization: ${organizationId}`);

  // Check if base currency already exists
  const existingBase = await db
    .select()
    .from(currencies)
    .where(eq(currencies.organizationId, organizationId));

  if (existingBase.length > 0) {
    console.log(`[seed-currencies] Currencies already exist for organization ${organizationId}, skipping...`);
    return;
  }

  // Insert USD as base currency
  const usd = DEFAULT_CURRENCIES.find((c) => c.code === 'USD')!;
  await db.insert(currencies).values({
    id: generateId(),
    organizationId,
    code: usd.code,
    nameI18n: usd.nameI18n,
    symbol: usd.symbol,
    decimalDigits: usd.decimalDigits,
    isEnabled: 1,
    isBase: 1,
    createdBy,
    updatedBy: createdBy,
  });
  console.log(`[seed-currencies] Inserted USD as base currency`);
}

/**
 * Standardizes plan currency codes to uppercase
 * Run this migration to ensure all existing plans use uppercase currency codes
 *
 * @param db - Database instance
 */
export async function standardizePlanCurrencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  console.log(`[seed-currencies] Standardizing plan currency codes to uppercase...`);

  // Update all plans to have uppercase currency codes
  await db.execute(`
    UPDATE plans
    SET currency = UPPER(currency)
    WHERE currency != UPPER(currency)
  `);

  console.log(`[seed-currencies] Plan currency codes standardized`);
}

/**
 * Seeds currencies for all existing organizations
 * Use this for initial migration
 *
 * @param db - Database instance
 */
export async function seedCurrenciesForAllOrganizations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  console.log(`[seed-currencies] Seeding currencies for all organizations...`);

  // Get all organizations
  const organizations = await db.execute(`SELECT id FROM organization`);

  for (const org of organizations.rows || organizations) {
    const orgId = org.id;
    await seedBaseCurrency(db, orgId, 'system');
  }

  // Standardize existing plan currencies
  await standardizePlanCurrencies(db);

  console.log(`[seed-currencies] Done seeding currencies for all organizations`);
}
