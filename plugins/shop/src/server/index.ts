/**
 * Shop Plugin - Server Entry (E-9)
 *
 * Composes all sub-routers into the main plugin router.
 * Exports lifecycle hooks (onEnable / onDisable).
 */
import { pluginRouter } from '@wordrhyme/plugin/server';
import type { PluginContext } from '@wordrhyme/plugin';
import { productsRouter } from './routers/products';
import { variationsRouter } from './routers/variations';
import { attributesRouter } from './routers/attributes';
import { attributeValuesRouter } from './routers/attribute-values';
import { productAttributesRouter } from './routers/product-attributes';
import { categoriesRouter } from './routers/categories';
import { ordersRouter } from './routers/orders';
import { externalMappingsRouter } from './routers/external-mappings';
import { productImagesRouter } from './routers/product-images';
import { analyticsRouter } from './routers/analytics';

// ============================================================
// Main Plugin Router
// ============================================================

export const router = pluginRouter({
    products: productsRouter,
    variations: variationsRouter,
    attributes: attributesRouter,
    attributeValues: attributeValuesRouter,
    productAttributes: productAttributesRouter,
    categories: categoriesRouter,
    orders: ordersRouter,
    externalMappings: externalMappingsRouter,
    productImages: productImagesRouter,
    analytics: analyticsRouter,
});

export type ShopRouter = typeof router;

// ============================================================
// Lifecycle Hooks
// ============================================================

export async function onEnable(ctx: PluginContext) {
    ctx.logger.info('Shop plugin enabled', {
        tRPC: '/trpc/pluginApis.shop.*',
        adminUI: '/p/shop',
        tables: [
            'plugin_shop_products',
            'plugin_shop_product_variations',
            'plugin_shop_variant_attribute_values',
            'plugin_shop_attributes',
            'plugin_shop_attribute_values',
            'plugin_shop_product_attributes',
            'plugin_shop_categories',
            'plugin_shop_orders',
            'plugin_shop_order_items',
            'plugin_shop_external_mappings',
            'plugin_shop_product_images',
        ],
    });
}

export async function onDisable(ctx: PluginContext) {
    ctx.logger.info('Shop plugin disabled');
}
