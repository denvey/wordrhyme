/**
 * @wordrhyme/shop-core
 *
 * Shared e-commerce domain logic — the foundation for shop plugins.
 * Framework-agnostic: no tRPC, no NestJS, no Next.js.
 */

// Types
export type {
    ProductStatus,
    StockStatus,
    OrderStatus,
    Source,
    PriceRangeEntry,
    ProductTag,
    Product,
    VariationAttribute,
    VariationImage,
    ProductVariation,
    ShippingAddress,
    LineItem,
    Order,
    PriceRange,
    ValidationResult,
    StatusTransitionResult,
} from './types';

// Schemas
export {
    productStatusSchema,
    stockStatusSchema,
    orderStatusSchema,
    sourceSchema,
    productTagSchema,
    priceRangeEntrySchema,
    createProductSchema,
    updateProductSchema,
    variationAttributeSchema,
    variationImageSchema,
    createVariationSchema,
    shippingAddressSchema,
    lineItemSchema,
    createOrderSchema,
    listQuerySchema,
} from './schemas';
export type {
    CreateProductInput,
    UpdateProductInput,
    CreateVariationInput,
    CreateOrderInput,
    ListQueryInput,
} from './schemas';

// Product Service
export {
    validateSPU,
    calculatePriceRange,
    calculateVariationPriceRange,
    mapProductInputToRecord,
} from './product.service';

// Order Service
export {
    canTransition,
    assertValidTransition,
    getValidTransitions,
    isTerminalStatus,
    buildCancelNote,
    buildRefundNote,
} from './order.service';

// I18n Field
export type { I18nField } from './i18n-field';
export { i18nFieldSchema, getI18nValue } from './i18n-field';

// Money
export type { MoneyAmount } from './money';
export { moneyAmountSchema, formatMoney, parseMoney, centsToDecimal, decimalToCents } from './money';

// Attribute types
export type { AttributeType, Attribute, AttributeValue, ProductAttribute } from './attribute.types';

// Attribute schemas
export {
    attributeTypeSchema,
    createAttributeSchema,
    updateAttributeSchema,
    createAttributeValueSchema,
    updateAttributeValueSchema,
    assignProductAttributeSchema,
} from './attribute.schemas';
export type {
    CreateAttributeInput,
    UpdateAttributeInput,
    CreateAttributeValueInput,
    UpdateAttributeValueInput,
    AssignProductAttributeInput,
} from './attribute.schemas';

// Category types
export type { Category, CategoryTree } from './category.types';
export { MAX_CATEGORY_DEPTH } from './category.types';

// Category schemas
export {
    createCategorySchema,
    updateCategorySchema,
    moveCategorySchema,
    validateCategoryDepth,
} from './category.schemas';
export type { CreateCategoryInput, UpdateCategoryInput } from './category.schemas';

// Variant Matrix
export type { VariantCombination } from './variant-matrix';
export { RECOMMENDED_MAX_VARIANTS, generateVariantMatrix } from './variant-matrix';

// Drizzle Schema (pgTable definitions for auto-crud-server)
export {
    shopProducts,
    shopProductVariations,
    shopOrders,
    shopOrderItems,
    shopAttributes,
    shopAttributeValues,
    shopProductAttributes,
    shopVariantAttributeValues,
    shopCategories,
    shopProductCategories,
    shopExternalMappings,
    shopProductImages,
} from './schema';
