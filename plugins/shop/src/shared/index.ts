/**
 * @wordrhyme/shop-core
 *
 * Shared e-commerce domain logic — the foundation for shop plugins.
 * Framework-agnostic: no tRPC, no NestJS, no Next.js.
 */

// Schemas & Types (derived from Drizzle via drizzle-zod)
export {
    // Enums
    productStatusSchema,
    stockStatusSchema,
    orderStatusSchema,
    sourceSchema,
    cargoTypeSchema,
    skuTypeSchema,
    productTypeSchema,
    publishStatusSchema,
    // JSONB nested schemas
    productTagSchema,
    priceRangeEntrySchema,
    variationAttributeSchema,
    variationImageSchema,
    shippingAddressSchema,
    lineItemSchema,
    // Product
    createProductSchema,
    updateProductSchema,
    selectProductSchema,
    // Variation
    createVariationSchema,
    selectVariationSchema,
    // Inline Create
    inlineCreateInputSchema,
    inlineCreateOutputSchema,
    // Order
    createOrderSchema,
    selectOrderSchema,
    selectOrderItemSchema,
    // Query
    listQuerySchema,
} from './schemas';
export type {
    ProductStatus,
    StockStatus,
    OrderStatus,
    Source,
    CargoType,
    SkuType,
    ProductType,
    PublishStatus,
    PriceRangeEntry,
    ProductTag,
    VariationAttribute,
    VariationImage,
    ShippingAddress,
    LineItem,
    CreateProductInput,
    UpdateProductInput,
    Product,
    CreateVariationInput,
    ProductVariation,
    InlineCreateInput,
    InlineCreateOutput,
    CreateOrderInput,
    Order,
    OrderItem,
    ListQueryInput,
    PriceRange,
    ValidationResult,
    StatusTransitionResult,
    // API-ready types (Date → string, for frontend hooks)
    ApiProduct,
    ApiProductVariation,
    ApiOrder,
    ApiOrderItem,
} from './schemas';

// Product Service
export {
    validateSpuCode,
    calculatePriceRange,
    calculateVariationPriceRange,
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

// Attribute schemas & types
export {
    attributeTypeSchema,
    createAttributeSchema,
    updateAttributeSchema,
    selectAttributeSchema,
    createAttributeValueSchema,
    updateAttributeValueSchema,
    selectAttributeValueSchema,
    assignProductAttributeSchema,
    selectProductAttributeSchema,
} from './attribute.schemas';
export type {
    AttributeType,
    Attribute,
    AttributeValue,
    ProductAttribute,
    CreateAttributeInput,
    UpdateAttributeInput,
    CreateAttributeValueInput,
    UpdateAttributeValueInput,
    AssignProductAttributeInput,
} from './attribute.schemas';

// Category schemas & types
export {
    MAX_CATEGORY_DEPTH,
    createCategorySchema,
    updateCategorySchema,
    selectCategorySchema,
    moveCategorySchema,
    validateCategoryDepth,
} from './category.schemas';
export type {
    Category,
    CategoryTree,
    CreateCategoryInput,
    UpdateCategoryInput,
} from './category.schemas';

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
    // Enum const arrays (for consumer-side usage without Zod)
    PRODUCT_STATUSES,
    STOCK_STATUSES,
    ORDER_STATUSES,
    SOURCES,
    CARGO_TYPES,
    SKU_TYPES,
    PRODUCT_TYPES,
    PUBLISH_STATUSES,
    ATTRIBUTE_TYPES,
} from './schema';
