/**
 * E-commerce Hooks
 *
 * Hook definitions for Product, Inventory, Cart, Checkout, Payment, and Order.
 */

import { HookDefinition } from '../hook.types';

// ============================================================================
// Product Hooks
// ============================================================================

export const PRODUCT_HOOKS: HookDefinition[] = [
  { id: 'product.beforeCreate', type: 'filter', description: 'Before product creation', defaultTimeout: 5000 },
  { id: 'product.afterCreate', type: 'action', description: 'After product creation', defaultTimeout: 5000 },
  { id: 'product.onRead', type: 'filter', description: 'On product read', defaultTimeout: 3000 },
  { id: 'product.beforeUpdate', type: 'filter', description: 'Before product update', defaultTimeout: 5000 },
  { id: 'product.afterUpdate', type: 'action', description: 'After product update', defaultTimeout: 5000 },
  { id: 'product.priceCalculate', type: 'filter', description: 'Calculate product price', defaultTimeout: 3000 },
  { id: 'product.beforePublish', type: 'filter', description: 'Before product publish', defaultTimeout: 5000 },
  { id: 'product.afterPublish', type: 'action', description: 'After product publish', defaultTimeout: 5000 },
  { id: 'product.beforeUnpublish', type: 'filter', description: 'Before product unpublish', defaultTimeout: 5000 },
  { id: 'product.afterUnpublish', type: 'action', description: 'After product unpublish', defaultTimeout: 5000 },
  { id: 'product.onStatusChange', type: 'action', description: 'Product status changed', defaultTimeout: 5000 },
  { id: 'product.beforeAddVariant', type: 'filter', description: 'Before add variant', defaultTimeout: 5000 },
  { id: 'product.afterAddVariant', type: 'action', description: 'After add variant', defaultTimeout: 5000 },
  { id: 'product.beforeBulkUpdate', type: 'filter', description: 'Bulk update before', defaultTimeout: 10000 },
  { id: 'product.afterBulkUpdate', type: 'action', description: 'Bulk update after', defaultTimeout: 10000 },
];

// ============================================================================
// Inventory Hooks
// ============================================================================

export const INVENTORY_HOOKS: HookDefinition[] = [
  { id: 'inventory.check', type: 'filter', description: 'Check stock availability', defaultTimeout: 3000 },
  { id: 'inventory.reserve', type: 'action', description: 'Reserve stock', defaultTimeout: 5000 },
  { id: 'inventory.commit', type: 'action', description: 'Commit stock', defaultTimeout: 5000 },
  { id: 'inventory.release', type: 'action', description: 'Release stock', defaultTimeout: 5000 },
];

// ============================================================================
// Cart Hooks
// ============================================================================

export const CART_HOOKS: HookDefinition[] = [
  { id: 'cart.beforeAddItem', type: 'filter', description: 'Before add to cart', defaultTimeout: 3000 },
  { id: 'cart.afterAddItem', type: 'action', description: 'After add to cart', defaultTimeout: 3000 },
  { id: 'cart.beforeUpdateItem', type: 'filter', description: 'Before update cart item', defaultTimeout: 3000 },
  { id: 'cart.afterUpdateItem', type: 'action', description: 'After update cart item', defaultTimeout: 3000 },
  { id: 'cart.beforeRemoveItem', type: 'filter', description: 'Before remove from cart', defaultTimeout: 3000 },
  { id: 'cart.afterRemoveItem', type: 'action', description: 'After remove from cart', defaultTimeout: 3000 },
  { id: 'cart.onCheckoutStart', type: 'action', description: 'Checkout started', defaultTimeout: 3000 },
];

// ============================================================================
// Checkout Hooks
// ============================================================================

export const CHECKOUT_HOOKS: HookDefinition[] = [
  { id: 'checkout.calculate.items', type: 'filter', description: 'Calculate line item prices', defaultTimeout: 5000 },
  { id: 'checkout.calculate.discounts', type: 'filter', description: 'Apply discounts', defaultTimeout: 5000 },
  { id: 'checkout.calculate.shipping', type: 'filter', description: 'Calculate shipping', defaultTimeout: 5000 },
  { id: 'checkout.calculate.tax', type: 'filter', description: 'Calculate tax', defaultTimeout: 5000 },
  { id: 'checkout.calculate.fees', type: 'filter', description: 'Calculate additional fees', defaultTimeout: 5000 },
  { id: 'checkout.calculate.total', type: 'filter', description: 'Calculate total', defaultTimeout: 5000 },
  { id: 'checkout.validate', type: 'filter', description: 'Final validation', defaultTimeout: 5000 },
];

// ============================================================================
// Payment Hooks
// ============================================================================

export const PAYMENT_HOOKS: HookDefinition[] = [
  { id: 'payment.provider.select', type: 'filter', description: 'Filter payment methods', defaultTimeout: 3000 },
  { id: 'payment.beforeProcess', type: 'filter', description: 'Before payment', defaultTimeout: 5000 },
  { id: 'payment.afterSuccess', type: 'action', description: 'Payment succeeded', defaultTimeout: 10000 },
  { id: 'payment.onFailed', type: 'action', description: 'Payment failed', defaultTimeout: 5000 },
];

// ============================================================================
// Order Hooks
// ============================================================================

export const ORDER_HOOKS: HookDefinition[] = [
  { id: 'order.beforeCreate', type: 'filter', description: 'Before order creation', defaultTimeout: 5000 },
  { id: 'order.afterCreate', type: 'action', description: 'After order creation', defaultTimeout: 10000 },
  { id: 'order.beforeCancel', type: 'filter', description: 'Before order cancel', defaultTimeout: 5000 },
  { id: 'order.afterCancel', type: 'action', description: 'After order cancel', defaultTimeout: 10000 },
  { id: 'order.beforeRefund', type: 'filter', description: 'Before refund', defaultTimeout: 5000 },
  { id: 'order.afterRefund', type: 'action', description: 'After refund', defaultTimeout: 10000 },
  { id: 'order.onPartialRefund', type: 'action', description: 'Partial refund', defaultTimeout: 5000 },
  { id: 'order.onStatusChange', type: 'action', description: 'Status changed', defaultTimeout: 5000 },
  { id: 'order.beforeShip', type: 'filter', description: 'Before shipping', defaultTimeout: 5000 },
  { id: 'order.afterShip', type: 'action', description: 'After shipping', defaultTimeout: 10000 },
  { id: 'order.onPartialShip', type: 'action', description: 'Partial shipping', defaultTimeout: 5000 },
  { id: 'order.onDelivered', type: 'action', description: 'Order delivered', defaultTimeout: 5000 },
  { id: 'order.beforeBulkCancel', type: 'filter', description: 'Bulk cancel before', defaultTimeout: 10000 },
  { id: 'order.afterBulkCancel', type: 'action', description: 'Bulk cancel after', defaultTimeout: 10000 },
];

// ============================================================================
// Combined E-commerce Hooks
// ============================================================================

export const ECOMMERCE_HOOKS: HookDefinition[] = [
  ...PRODUCT_HOOKS,
  ...INVENTORY_HOOKS,
  ...CART_HOOKS,
  ...CHECKOUT_HOOKS,
  ...PAYMENT_HOOKS,
  ...ORDER_HOOKS,
];
