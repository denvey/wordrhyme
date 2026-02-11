## ADDED Requirements

### Requirement: Commerce Toolkit Plugin

The system SHALL support an optional `@wordrhyme/commerce-toolkit` Core plugin that provides e-commerce primitives: Product, ProductCategory, Order, OrderItem, Cart. The plugin SHALL use fully-qualified plugin-namespaced tables (`plugin_commerce_toolkit_*`, following the `plugin_{pluginId}_*` convention from `DATA_MODEL_GOVERNANCE.md`) and integrate with the existing permission system. All tables MUST include an `organization_id` column for tenant isolation enforced by `ScopedDb`.

#### Scenario: Commerce plugin installed
- **WHEN** the commerce-toolkit plugin is installed
- **THEN** plugin-namespaced tables are created via plugin migrations
- **AND** Admin pages for Products, Orders, and Categories are registered
- **AND** commerce-related permissions are registered (`plugin:commerce:product.read`, etc.)

#### Scenario: Product CRUD with permissions
- **WHEN** a user with `plugin:commerce:product.create` permission creates a product
- **THEN** the product is stored in `plugin_commerce_toolkit_products` table
- **AND** the product is scoped to the current organization
- **AND** product images use the existing AssetService

---

### Requirement: Payment Gateway Plugin Interface

The `@wordrhyme/plugin-api` SHALL define a payment gateway capability interface that commerce sub-plugins (Stripe, PayPal) can implement. The interface SHALL handle checkout session creation and webhook processing with security hardening.

#### Scenario: Stripe plugin processes payment
- **WHEN** a customer completes checkout
- **AND** the Stripe payment plugin is enabled
- **THEN** a Stripe checkout session is created via the gateway interface
- **AND** the order status is updated on webhook confirmation

#### Scenario: Multiple payment gateways available
- **WHEN** both Stripe and PayPal plugins are enabled
- **THEN** the checkout flow presents both payment options
- **AND** the customer can choose their preferred method

#### Scenario: Webhook signature verification
- **WHEN** a payment gateway webhook is received
- **THEN** the system MUST verify the request signature using the gateway's signing secret
- **AND** requests with invalid or missing signatures are rejected with HTTP 401
- **AND** the rejection is logged as an audit event

#### Scenario: Webhook replay protection
- **WHEN** a webhook with a previously-processed event ID is received
- **THEN** the system returns HTTP 200 (idempotent acknowledgement) without re-processing
- **AND** event IDs are stored with a TTL-based deduplication window (default: 24 hours)

#### Scenario: Webhook idempotency
- **WHEN** the same webhook is delivered multiple times (gateway retry)
- **THEN** the order status transition is applied at most once
- **AND** duplicate processing does not create duplicate records or side effects
