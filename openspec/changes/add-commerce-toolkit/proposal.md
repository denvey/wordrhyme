# Change: Add Commerce Toolkit Plugin

## Why

Cromwell CMS provides a `@cromwell/toolkit-commerce` package that abstracts e-commerce primitives (products, categories, cart, checkout, orders) into reusable components. WordRhyme already has a Billing module focused on SaaS subscriptions, but if the platform wants to support e-commerce use cases, a Commerce Toolkit plugin would provide the necessary abstractions without polluting Core.

## What Changes

- Create `@wordrhyme/commerce-toolkit` as a Core plugin
- Define entity schemas: Product, ProductCategory, Order, OrderItem, Cart
- Provide tRPC routers for product catalog CRUD, cart management, checkout flow
- Provide Admin pages for product and order management
- Payment gateway integration via sub-plugins (Stripe, PayPal)
- All data tenant-scoped, leverages existing permission system

## Impact

- Affected specs: `plugin-api`
- New plugin: `plugins/commerce-toolkit/`
- Affected code:
  - `plugins/commerce-toolkit/` (new Core plugin)
  - Plugin uses `ctx.data` capability for schema registration
- High complexity — full e-commerce domain
- No breaking changes (additive plugin, optional installation)
- Depends on: Custom Data system (for product attributes), Asset system (for product images)
