# DSUni E-commerce Plugin Specification Delta

**Change ID**: `add-dsuni-plugin-integration`
**Capability**: `dsuni-plugin`
**Type**: ADDED

---

## ADDED Requirements

### Requirement: Plugin Manifest and Registration

The dsuni plugin SHALL be registered as a wordrhyme plugin with manifest.ts as the single source of truth, using definePlugin for type-safe configuration.

#### Scenario: Plugin manifest is defined in TypeScript
**WHEN** reviewing `manifest.ts`
**THEN** it uses `definePlugin` from `@wordrhyme/plugin`
**AND** `pluginId` is `com.wordrhyme.dsuni` (written only once)
**AND** permissions are defined in TypeScript object format:
  ```ts
  permissions: {
    products: {
      view: '查看产品列表',
      create: '创建产品',
      update: '更新产品',
      delete: '删除产品',
    },
    orders: {
      view: '查看订单',
      fulfill: '标记为已发货',
      cancel: '取消订单',
      refund: '处理退款',
    },
  }
  ```
**AND** permissions are automatically prefixed with `pluginId` at build time
**AND** exported `PERMISSIONS` constant provides type-safe access:
  ```ts
  PERMISSIONS.products.view === 'com.wordrhyme.dsuni.products.view'
  ```

#### Scenario: Build process generates manifest.json
**WHEN** running `pnpm build` in the plugin directory
**THEN** the build script reads `manifest.ts`
**AND** converts permissions to CASL-compatible format:
  ```json
  {
    "permissions": {
      "definitions": [
        { "key": "com.wordrhyme.dsuni.products.view", "description": "查看产品列表" },
        { "key": "com.wordrhyme.dsuni.products.create", "description": "创建产品" }
      ]
    }
  }
  ```
**AND** writes `manifest.json` to plugin root
**AND** logs show permission count and list

#### Scenario: Plugin loads on server startup
**WHEN** the wordrhyme server starts
**THEN** PluginManager discovers `plugins/dsuni/manifest.json`
**AND** validates against `pluginManifestSchema`
**AND** plugin status is set to `enabled`
**AND** lifecycle hook `onEnable` executes successfully
**AND** permissions are registered to database `role_permissions` table
**AND** logs show "✅ Plugin loaded: com.wordrhyme.dsuni"

---

### Requirement: Multi-tenant Product Data Model

All dsuni plugin tables SHALL follow wordrhyme's multi-tenancy model with proper table naming, tenant isolation, and data governance.

#### Scenario: Product table schema is compliant
**WHEN** examining the database schema
**THEN** the table name is `plugin_dsuni_products`
**AND** it includes column `organization_id` (TEXT, NOT NULL) -- 组织ID,多租户隔离
**AND** it includes column `aclTags` (TEXT[], NOT NULL, DEFAULT '{}') -- LBAC 访问控制标签
**AND** it includes column `denyTags` (TEXT[], NOT NULL, DEFAULT '{}') -- LBAC 拒绝标签
**AND** it includes column `created_by` (TEXT, references users.id)
**AND** it includes column `created_at` (timestamp with time zone, DEFAULT NOW())
**AND** it includes column `updated_at` (timestamp with time zone, DEFAULT NOW())
**AND** it has composite unique constraint on `(organization_id, spu_id)`
**AND** it has index on `(organization_id)` for fast tenant filtering

#### Scenario: LBAC tags are auto-injected on creation
**WHEN** creating a new product via auto-crud
**THEN** the system automatically sets `aclTags = ['org:{organizationId}']`
**AND** the system automatically sets `denyTags = []`
**AND** the developer does NOT need to manually set these fields
**AND** the product is visible to all users in the same organization

#### Scenario: Empty aclTags blocks all access
**WHEN** a product's `aclTags` is manually set to `[]` (empty array)
**THEN** scoped-db automatically filters this product out of ALL queries
**AND** NO user can access this product (security-first default)
**AND** only explicit tags grant access

#### Scenario: Tenant data isolation is enforced
**WHEN** a user from organization A queries products using `db.select()`
**THEN** the scoped-db wrapper automatically filters by `organization_id = A.id`
**AND** it additionally filters by `aclTags && userKeys` (LBAC intersection check)
**AND** it additionally filters by `NOT (denyTags && userKeys)` (deny check)
**AND** the user can only see products they have access to
**AND** cross-tenant queries are blocked by automatic filter injection
**AND** raw SQL access is controlled via `db.$raw` (requires explicit permission)

#### Scenario: Data retention policy is declared
**WHEN** reviewing the plugin manifest
**THEN** `dataRetention.onDisable` is set to `retain`
**AND** `dataRetention.onUninstall` is set to `archive`
**AND** `dataRetention.tables` includes all plugin tables:
  - `plugin_dsuni_products`
  - `plugin_dsuni_product_variations`
  - `plugin_dsuni_product_media`
  - `plugin_dsuni_orders`
  - `plugin_dsuni_order_line_items`
  - `plugin_dsuni_fulfillments`

---

### Requirement: Product Management tRPC API (using Auto-CRUD)

The plugin SHALL use `@wordrhyme/auto-crud-server` to generate CRUD routers automatically from Drizzle schemas, reducing boilerplate code and ensuring consistency.

#### Scenario: Auto-CRUD router is generated from schema
**WHEN** creating the product tRPC router
**THEN** it uses `createCrudRouter` from `@wordrhyme/auto-crud-server`
**AND** it accepts the Drizzle `products` table definition
**AND** it accepts Zod schemas generated via `createSelectSchema` from `drizzle-zod`
**AND** it automatically generates 6 procedures: `list`, `get`, `create`, `update`, `delete`, `deleteMany`
**AND** organization filtering is automatic via scoped-db integration

#### Scenario: Auto-generated list endpoint with advanced filtering
**WHEN** calling `pluginApis.dsuni.product.list`
**WITH** input:
  ```json
  {
    "page": 1,
    "perPage": 20,
    "sort": [{ "id": "createdAt", "desc": true }],
    "filters": [
      { "id": "category", "value": "electronics", "operator": "eq", "variant": "select" },
      { "id": "price", "value": [0, 100], "operator": "between", "variant": "range" }
    ],
    "joinOperator": "and"
  }
  ```
**THEN** the auto-crud router applies filters automatically
**AND** results are sorted by `createdAt DESC`
**AND** pagination returns `{ data: Product[], total: number }`
**AND** organization filtering is implicit (via scoped-db)

#### Scenario: Create product with permission check (auto-crud + custom middleware)
**WHEN** a user calls `pluginApis.dsuni.product.create`
**WITH** input:
  ```json
  {
    "spuId": "PROD-001",
    "name": "Test Product",
    "category": "electronics",
    "price": 99.99
  }
  ```
**THEN** the system checks permission `dsuni.products.manage` via `ctx.permissions.require()`
**AND** if permission is denied, it throws a permission error
**AND** if permission is granted, the product is created with:
  - `organization_id` from `ctx.organizationId`
  - `created_by` from `ctx.userId`
**AND** the response includes the new product ID

#### Scenario: List products with automatic tenant filtering
**WHEN** calling `pluginApis.dsuni.product.list`
**WITH** query params `{ limit: 20, offset: 0, category: "electronics" }`
**THEN** the query automatically filters by current organization via scoped-db
**AND** results are paginated with total count
**AND** each product includes variations and media (via joins)
**AND** results contain ONLY products from the current organization

#### Scenario: Update product with optimistic locking
**WHEN** updating a product
**THEN** the `updated_at` timestamp is checked for conflicts
**AND** if another user modified the product concurrently, it returns a conflict error
**AND** if no conflict, the product is updated and `updated_at` is set to current timestamp

---

### Requirement: Admin UI Module Federation Integration

The plugin SHALL provide a Module Federation 2.0 remote entry with admin UI for product/order management.

#### Scenario: Plugin menu appears in admin sidebar
**WHEN** an admin user with `dsuni.products.view` permission logs into wordrhyme admin UI
**THEN** the sidebar displays "DSUni E-commerce" menu item
**AND** the menu item has icon specified in `manifest.admin.menus[0].icon`
**AND** clicking it navigates to `/p/com.wordrhyme.dsuni/products`
**AND** the plugin remote entry loads successfully

#### Scenario: Remote entry loads without errors
**WHEN** navigating to the plugin page
**THEN** the Module Federation runtime loads `/plugins/dsuni/dist/admin/remoteEntry.js`
**AND** the remote module exposes `./ProductList` component
**AND** the component renders without console errors
**AND** the UI uses shared dependencies from host (React, @wordrhyme/ui)

#### Scenario: Product data table displays correctly
**WHEN** viewing the product list page
**THEN** it renders a DataTable component from `@wordrhyme/ui`
**AND** the table has columns: SPU ID, Name, Category, Variations, Stock, Price, Status
**AND** the table supports sorting by any column
**AND** the table supports filtering by category and status
**AND** clicking "Add Product" opens a creation dialog
**AND** clicking a row opens product detail view

---

### Requirement: Permission Declarations (CASL-Based)

The plugin SHALL use TypeScript-first permission definitions in manifest.ts that auto-generate CASL-compatible manifest.json at build time, with fine-grained atomic permissions for role-based access control.

#### Scenario: Permissions are defined in manifest.ts
**WHEN** reviewing `manifest.ts`
**THEN** it defines fine-grained permissions using `definePlugin`:
  ```ts
  export const { manifest, PERMISSIONS } = definePlugin({
    pluginId: 'com.wordrhyme.dsuni',
    permissions: {
      products: {
        view: '查看产品列表',
        create: '创建产品',
        update: '更新产品信息',
        delete: '删除产品',
        publish: '发布产品（上架）',
        unpublish: '下架产品',
      },
      variations: {
        view: '查看SKU变体',
        create: '创建SKU',
        update: '更新SKU',
        adjustStock: '调整库存数量',
      },
      orders: {
        view: '查看订单列表',
        updateInfo: '修改订单信息（地址、备注）',  // 客服权限
        fulfill: '标记订单为已发货',              // 仓库权限
        cancel: '取消订单',                      // 客服权限
        refund: '处理退款',                      // 财务权限
      },
      settings: {
        view: '查看插件配置',
        update: '修改插件配置',
      },
    },
  });
  ```
**AND** each permission key is automatically prefixed with `com.wordrhyme.dsuni.`
**AND** TypeScript provides auto-completion for all permission keys
**AND** permissions follow atomic operation principle (no `manage` permission)

#### Scenario: CASL rules are registered to database
**WHEN** the plugin is installed
**THEN** for each permission, a CASL rule is created in `role_permissions` table:
  ```sql
  INSERT INTO role_permissions (role_id, action, subject, source) VALUES
    ('admin-role-id', 'view', 'plugin:com.wordrhyme.dsuni:products', 'com.wordrhyme.dsuni'),
    ('admin-role-id', 'create', 'plugin:com.wordrhyme.dsuni:products', 'com.wordrhyme.dsuni'),
    ('warehouse-role-id', 'fulfill', 'plugin:com.wordrhyme.dsuni:orders', 'com.wordrhyme.dsuni'),
    ...
  ```
**AND** the `source` field is set to plugin ID for tracking
**AND** admins can configure which roles have which permissions in the UI

#### Scenario: Permission checks use CASL format
**WHEN** a developer writes permission checks in code
**THEN** they use the imported PERMISSIONS object:
  ```ts
  import { PERMISSIONS } from '../../manifest';

  pluginProcedure
    .meta({ permission: PERMISSIONS.products.view })
    //                   ^^^^^^^^^^^^^^^^^^^^^^^^^
    //                   'com.wordrhyme.dsuni.products.view'
    .query(...)
  ```
**AND** global middleware automatically converts to CASL check:
  ```ts
  await permissionKernel.can('view', 'plugin:com.wordrhyme.dsuni:products')
  ```
**AND** TypeScript auto-completion prevents typos
**AND** refactoring permission names is IDE-assisted

#### Scenario: Permission checks are enforced via CASL
**WHEN** a user without the required permission tries to create a product
**THEN** the global middleware checks `.meta({ permission })`
**AND** it calls `permissionKernel.can('create', 'plugin:com.wordrhyme.dsuni:products')`
**AND** PermissionKernel loads user's roles from database
**AND** PermissionKernel evaluates CASL rules from `role_permissions` table
**AND** if no matching rule, permission is DENIED (white-list model)
**AND** the tRPC procedure returns HTTP 403 Forbidden
**AND** the error message is "Permission denied: com.wordrhyme.dsuni.products.create"
**AND** the user sees a permission denied error in the UI
**AND** the denial is logged to `audit_logs` table

#### Scenario: Fine-grained permissions enable role separation
**WHEN** configuring roles in the admin UI
**THEN** admins can assign different permissions to different roles:
  - **Warehouse Role**: only `orders.fulfill`, `variations.adjustStock`
  - **Customer Service Role**: only `orders.view`, `orders.updateInfo`, `orders.cancel`
  - **Finance Role**: only `orders.view`, `orders.refund`
  - **Product Manager Role**: all `products.*` and `variations.*` permissions
**AND** each role can only perform actions they are explicitly granted
**AND** this implements principle of least privilege and separation of duties

---

### Requirement: ABAC (Attribute-Based Access Control)

The plugin SHALL support ABAC via CASL conditions for context-aware permission checks based on resource attributes and user context.

#### Scenario: ABAC conditions restrict order modifications
**WHEN** configuring the "Customer Service" role in the admin UI
**THEN** the admin can add ABAC conditions to permissions:
  ```json
  {
    "action": "cancel",
    "subject": "plugin:com.wordrhyme.dsuni:orders",
    "conditions": {
      "status": { "$in": ["pending", "paid"] }
    }
  }
  ```
**AND** this limits customer service to only cancel orders in pending/paid status
**AND** fulfilled orders cannot be cancelled even with the cancel permission

#### Scenario: Dynamic condition interpolation for ownership
**WHEN** configuring permissions with user context variables
**THEN** the system supports template variables in conditions:
  ```json
  {
    "action": "update",
    "subject": "plugin:com.wordrhyme.dsuni:orders",
    "conditions": {
      "createdBy": "${user.id}"
    }
  }
  ```
**AND** at runtime, `${user.id}` is replaced with actual user ID
**AND** users can only update orders they created themselves

#### Scenario: ABAC check with subject instance
**WHEN** checking permission with a specific order instance
**THEN** the code passes the order object:
  ```ts
  const order = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  await ctx.permissions.can('cancel', 'plugin:com.wordrhyme.dsuni:orders', order);
  ```
**AND** CASL evaluates conditions against the order object
**AND** returns true only if conditions match

---

### Requirement: Field-Level Access Control

The plugin SHALL implement field-level permissions to hide sensitive data from unauthorized users.

#### Scenario: Register field-level rules in plugin lifecycle
**WHEN** the plugin's `onEnable` hook executes
**THEN** it registers field rules using FieldGuard:
  ```ts
  ctx.fieldGuard.register({
    entity: 'plugin_dsuni_products',
    rules: [
      { field: 'cost', rule: FieldRules.roles('财务', '老板') },
      { field: 'supplierInfo', rule: FieldRules.roles('采购', '老板') },
    ],
    defaultVisible: true,
  });

  ctx.fieldGuard.register({
    entity: 'plugin_dsuni_orders',
    rules: [
      { field: 'customerPhone', rule: FieldRules.any(
        FieldRules.roles('客服', '物流'),
        FieldRules.ownerOnly('createdBy')
      )},
      { field: 'refundReason', rule: FieldRules.roles('财务', '客服主管') },
    ],
  });
  ```
**AND** field visibility is context-aware based on user keys

#### Scenario: Output sanitization removes restricted fields
**WHEN** a user without "财务" role queries products
**THEN** the tRPC response is filtered through FieldGuard:
  ```ts
  const rawProducts = await ctx.db.select().from(products);
  const sanitized = ctx.fieldGuard.scrubMany('plugin_dsuni_products', rawProducts, ctx.userKeys);
  return sanitized;
  ```
**AND** the `cost` and `supplierInfo` fields are automatically removed from the response
**AND** the user only sees fields they are authorized to view

#### Scenario: CASL field restrictions (alternative approach)
**WHEN** configuring role permissions in the admin UI
**THEN** admins can specify field-level restrictions in CASL rules:
  ```json
  {
    "action": "read",
    "subject": "plugin:com.wordrhyme.dsuni:products",
    "fields": ["id", "name", "category", "price", "stock"]
  }
  ```
**AND** the "Viewer" role can only see these specific fields
**AND** PermissionKernel provides `permittedFields()` API to query allowed fields

---

### Requirement: External Platform Integration via Plugin Dependencies

The plugin SHALL integrate with external platforms (Shopify, WooCommerce) via plugin dependencies and event hooks, not direct SDK calls.

#### Scenario: Plugin declares external platform dependencies
**WHEN** reviewing the plugin manifest
**THEN** `dependencies` includes `com.wordrhyme.shopify` (optional)
**AND** `dependencies` includes `com.wordrhyme.woocommerce` (optional)
**AND** the plugin code checks if dependencies are available:
  ```ts
  const shopifyPlugin = ctx.plugins?.get('com.wordrhyme.shopify');
  if (shopifyPlugin) {
    // Sync enabled
  } else {
    // Sync disabled gracefully
  }
  ```

#### Scenario: Product created hook is emitted
**WHEN** a product is successfully created
**THEN** the plugin emits a hook event via `ctx.hooks.addAction()`
**AND** the hook name is `dsuni.product.created`
**AND** the hook payload includes:
  ```ts
  {
    productId: string,
    spuId: string,
    tenantId: string,
    workspaceId: string,
    data: Product
  }
  ```
**AND** external platform plugins (Shopify, WooCommerce) can listen to this hook
**AND** each platform plugin independently handles the sync

#### Scenario: External platform sync is optional
**WHEN** no external platform plugins are installed
**THEN** the dsuni plugin still functions normally
**AND** product management works without external sync
**AND** the UI shows "External sync disabled" in product settings

---

### Requirement: Order Fulfillment Workflow

The plugin SHALL provide order management with fulfillment tracking and status updates.

#### Scenario: Order is created from external platform webhook
**WHEN** the Shopify plugin receives an order webhook
**AND** it emits a `shopify.order.created` hook event
**THEN** the dsuni plugin listens to this event via `ctx.hooks.addAction('shopify.order.created')`
**AND** it creates an order record:
  ```ts
  {
    orderId: "external-platform-order-id",
    source: "shopify",
    status: "pending",
    lineItems: [...],
    shippingAddress: {...},
    tenantId: "...",
    workspaceId: "...",
    createdAt: new Date()
  }
  ```
**AND** the order appears in the dsuni orders list UI

#### Scenario: Order is fulfilled
**WHEN** an admin updates order status to "fulfilled"
**AND** provides tracking number "TRACK-123456"
**THEN** the order status changes to "fulfilled"
**AND** a fulfillment record is created in `plugin_dsuni_fulfillments`
**AND** `updated_at` timestamp is updated
**AND** a hook event `dsuni.order.fulfilled` is emitted with order data
**AND** the Shopify plugin (if installed) listens to this event and updates the remote order

#### Scenario: Audit trail is recorded
**WHEN** any order status change occurs
**THEN** an audit log entry is created via `ctx.audit.log()`
**AND** the log includes: userId, action, orderId, oldStatus, newStatus, timestamp
**AND** the audit log is visible in wordrhyme's global audit viewer

---

### Requirement: Settings Capability Integration

The plugin SHALL use wordrhyme's settings capability for configuration storage.

#### Scenario: Plugin settings are stored per tenant
**WHEN** an admin configures plugin settings
**THEN** settings are stored via `ctx.settings.set('dsuni.config', {...})`
**AND** settings are scoped to current tenant
**AND** other tenants cannot access these settings
**AND** settings include:
  - `defaultCurrency`: "USD"
  - `autoSyncEnabled`: true
  - `syncPlatforms`: ["shopify", "woocommerce"]

#### Scenario: Settings are retrieved on plugin load
**WHEN** the plugin is enabled
**THEN** it calls `ctx.settings.get('dsuni.config')` in `onEnable` hook
**AND** if settings don't exist, it uses default values
**AND** settings are cached for the plugin session
**AND** settings changes trigger plugin reconfiguration

---

## Success Criteria

All scenarios defined above SHALL pass automated tests before the plugin is marked as production-ready.

**Automated Test Coverage**:
- ✅ Unit tests for tRPC routers with mocked context
- ✅ Integration tests for database operations with test tenant
- ✅ CASL permission tests verifying access control (RBAC + ABAC)
- ✅ LBAC tests verifying scoped-db filtering with aclTags/denyTags
- ✅ Field-level permission tests for FieldGuard rules
- ✅ UI component tests using React Testing Library
- ✅ E2E tests for complete workflows (create product → sync → fulfill order)

**Manual Verification**:
- ✅ Plugin loads in development and production modes
- ✅ manifest.json correctly generated from manifest.ts
- ✅ PERMISSIONS constants provide correct type-safe values
- ✅ Admin UI renders correctly in both light and dark modes
- ✅ Data table sorting, filtering, pagination work as expected
- ✅ Form validation shows appropriate error messages
- ✅ Permission denied states display correctly in UI
- ✅ CASL rules are correctly registered to role_permissions table
- ✅ ABAC conditions work with subject instances
- ✅ Field-level filtering hides sensitive data from unauthorized users
- ✅ LBAC auto-injection works (aclTags default to ['org:{organizationId}'])
- ✅ Empty aclTags blocks all access (security-first verified)
