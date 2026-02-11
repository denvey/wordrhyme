## 1. Plugin Scaffold

- [ ] 1.1 Create `plugins/commerce-toolkit/` with manifest declaring commerce capabilities
- [ ] 1.2 Define entity schemas: Product, ProductCategory, Order, OrderItem, Cart
- [ ] 1.3 Create Drizzle migrations for commerce tables (plugin-namespaced: `plugin_commerce_*`)

## 2. Backend Routers

- [ ] 2.1 Create product catalog tRPC router (CRUD, filtering, pagination)
- [ ] 2.2 Create cart management router (add/remove/update items, session-based)
- [ ] 2.3 Create order router (create from cart, status pipeline, history)
- [ ] 2.4 Create checkout flow router (shipping, payment method selection, confirmation)

## 3. Payment Integration

- [ ] 3.1 Define payment gateway plugin interface in `@wordrhyme/plugin-api`
- [ ] 3.2 Create Stripe sub-plugin (`plugins/payment-stripe/`)
- [ ] 3.3 Create PayPal sub-plugin (`plugins/payment-paypal/`)

## 4. Admin Pages

- [ ] 4.1 Create product management Admin page
- [ ] 4.2 Create order management Admin page
- [ ] 4.3 Create category management Admin page
- [ ] 4.4 Write tests for product CRUD, cart, and order flow
