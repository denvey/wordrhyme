/**
 * Currency Components
 *
 * Re-exports all currency-related UI components.
 *
 * @example
 * ```tsx
 * import { Price, CurrencySwitcher, PriceRange } from '@/components/currency';
 *
 * function ProductCard({ priceCents }) {
 *   return (
 *     <div>
 *       <Price cents={priceCents} />
 *       <CurrencySwitcher />
 *     </div>
 *   );
 * }
 * ```
 */

export { Price, PriceRange, PriceWithOriginal, PriceDiscount } from './Price';
export { CurrencySwitcher, CurrencyBadge } from './CurrencySwitcher';
