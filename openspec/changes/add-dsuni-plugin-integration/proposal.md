# Proposal: DSUni Plugin Integration

**Change ID**: `add-dsuni-plugin-integration`
**Schema**: `spec-driven`
**Created**: 2026-01-30
**Status**: PENDING_APPROVAL

---

## Context

### User Need
Integrate the functionality from the `example/dsuni` project (a Next.js-based e-commerce product/order management system) into the wordrhyme ecosystem as a plugin. The dsuni project provides:
- Multi-tenant product catalog management
- Order fulfillment tracking
- External platform integration (1688, AliExpress, Shopify, WooCommerce)
- Team/workspace collaboration features

### Discovered Constraints

#### Hard Constraints (Cannot Change)
1. **Architecture Incompatibility**:
   - dsuni uses Next.js 14 App Router + Server Components
   - wordrhyme requires React + Module Federation 2.0 remotes
   - **Resolution**: Complete frontend rewrite required; cannot reuse Next.js pages

2. **Multi-tenancy Model Mismatch**:
   - dsuni: Flat team-based (`teamId`)
   - wordrhyme: Organization-based (`organization_id`)
   - **Resolution**: Must redesign data model with organization-level multi-tenancy (NO workspace_id needed)

3. **Authentication System**:
   - dsuni: NextAuth.js v5 beta with OAuth providers
   - wordrhyme: Custom auth system with capability-based permissions
   - **Resolution**: Must replace all auth logic with wordrhyme auth APIs

4. **Plugin Contract Boundaries** (from `PLUGIN_CONTRACT.md`):
   - Plugins cannot modify Core state
   - All plugin data must use `plugin_dsuni_*` table prefix
   - Capabilities must be declared in manifest
   - Tenant-scoped data mandatory
   - No runtime hot-swapping (rolling reload only)

5. **Permission Model**:
   - dsuni: role-based (owner/admin/member) + plan-based features
   - wordrhyme: capability-based permissions
   - **Resolution**: Must translate all permissions to capability declarations

#### Soft Constraints (Can Adapt)
1. **UI Component Library**: Both use shadcn/ui + Tailwind CSS (compatible)
2. **Database ORM**: Both use Drizzle ORM + PostgreSQL (compatible)
3. **API Layer**: Both use tRPC (can adapt routers)

### User Decisions (from AskUserQuestion)
1. **Integration Strategy**: Complete Refactor - Extract business logic, rebuild from scratch
2. **External Integrations**: Split into separate plugins (Shopify, WooCommerce, 1688, AliExpress)
3. **Data Migration**: New schema following wordrhyme governance (with migration script)
4. **Use Case**: E-commerce SaaS + Supply chain management

---

## Requirements

### Requirement 1: Core Plugin Structure

**Priority**: MUST HAVE

The dsuni plugin SHALL be structured as a full-stack wordrhyme plugin with proper manifest, lifecycle hooks, and capability declarations.

#### Scenario: Plugin loads on server startup
**WHEN** the wordrhyme server starts
**THEN** the dsuni plugin is discovered in `/plugins/dsuni/`
**AND** manifest.json is validated against `pluginManifestSchema`
**AND** plugin lifecycle `onInstall` → `onEnable` executes successfully
**AND** plugin status is `enabled` in database
**AND** logs show "✅ Plugin loaded: com.wordrhyme.dsuni"

#### Scenario: Plugin manifest declares capabilities and permissions
**WHEN** reviewing the generated manifest.json (built from manifest.ts)
**THEN** it declares required capabilities:
  - `data.write` for product/order management
  - `ui.adminPage` for admin interface
  - `ui.settingsTab` for configuration
**AND** it declares fine-grained permissions (CASL format):
  - `com.wordrhyme.dsuni.products.view` → CASL: `view` on `plugin:com.wordrhyme.dsuni:products`
  - `com.wordrhyme.dsuni.products.create` → CASL: `create` on `plugin:com.wordrhyme.dsuni:products`
  - `com.wordrhyme.dsuni.products.update` → CASL: `update` on `plugin:com.wordrhyme.dsuni:products`
  - `com.wordrhyme.dsuni.products.delete` → CASL: `delete` on `plugin:com.wordrhyme.dsuni:products`
  - `com.wordrhyme.dsuni.orders.view` → CASL: `view` on `plugin:com.wordrhyme.dsuni:orders`
  - `com.wordrhyme.dsuni.orders.fulfill` → CASL: `fulfill` on `plugin:com.wordrhyme.dsuni:orders` (仓库专用)
  - `com.wordrhyme.dsuni.orders.cancel` → CASL: `cancel` on `plugin:com.wordrhyme.dsuni:orders` (客服专用)
  - `com.wordrhyme.dsuni.orders.refund` → CASL: `refund` on `plugin:com.wordrhyme.dsuni:orders` (财务专用)
  - `com.wordrhyme.dsuni.settings.update` → CASL: `update` on `plugin:com.wordrhyme.dsuni:settings`
**AND** it declares dependencies on external platform plugins:
  - `com.wordrhyme.shopify` (optional)
  - `com.wordrhyme.woocommerce` (optional)

### Requirement 2: Multi-tenant Data Model

**Priority**: MUST HAVE

All dsuni plugin tables SHALL follow wordrhyme's multi-tenancy model with proper tenant/workspace isolation and table naming conventions.

#### Scenario: Product table follows naming convention with LBAC fields
**WHEN** examining the database schema
**THEN** the products table is named `plugin_dsuni_products`
**AND** it includes `organization_id` (TEXT, NOT NULL)
**AND** it includes `acl_tags` (TEXT[], NOT NULL, DEFAULT '{}') -- LBAC 访问控制标签
**AND** it includes `deny_tags` (TEXT[], NOT NULL, DEFAULT '{}') -- LBAC 拒绝标签
**AND** it includes `created_by` (TEXT, references users.id)
**AND** it has composite unique constraint on `(organization_id, spu_id)`

#### Scenario: Tenant data isolation is enforced (LBAC + Organization)
**WHEN** a user from organization A queries products
**THEN** the scoped-db automatically filters by `organization_id = A.id`
**AND** the scoped-db automatically filters by `acl_tags && userKeys` (LBAC intersection)
**AND** the scoped-db automatically filters by `NOT (deny_tags && userKeys)` (deny check)
**AND** results contain ONLY products from organization A that the user has LBAC access to
**AND** cross-tenant queries are blocked by automatic filter injection

#### Scenario: Database migrations declare all plugin tables
**WHEN** reviewing `./migrations/001_initial_schema.sql`
**THEN** it creates tables:
  - `plugin_dsuni_products`
  - `plugin_dsuni_product_variations`
  - `plugin_dsuni_product_media`
  - `plugin_dsuni_orders`
  - `plugin_dsuni_order_line_items`
  - `plugin_dsuni_fulfillments`
**AND** manifest.dataRetention declares:
  - `onDisable`: retain
  - `onUninstall`: archive
  - `tables`: [list of all plugin tables]

### Requirement 3: Product Management API (CASL + Auto-CRUD)

**Priority**: MUST HAVE

The plugin SHALL provide a tRPC router using auto-crud-server for product CRUD operations with CASL-based permission checks and automatic tenant/LBAC isolation.

#### Scenario: Create product via tRPC with CASL permission check
**WHEN** an admin calls `pluginApis.dsuni.product.create`
**WITH** product data:
  ```json
  {
    "spuId": "PROD-001",
    "name": "Test Product",
    "category": "electronics",
    "variations": [
      { "skuId": "SKU-001", "price": 99.99, "stock": 100 }
    ]
  }
  ```
**THEN** global middleware checks `.meta({ permission: PERMISSIONS.products.create })`
**AND** PermissionKernel evaluates CASL rule: `can('create', 'plugin:com.wordrhyme.dsuni:products')`
**AND** if permission denied, returns HTTP 403 Forbidden
**AND** if permission granted, product is created with:
  - `organization_id` = `ctx.organizationId` (auto by scoped-db)
  - `acl_tags` = `['org:{organizationId}']` (auto by auto-crud-server)
  - `deny_tags` = `[]`
  - `created_by` = `ctx.userId`
**AND** response includes the new product ID

#### Scenario: List products with automatic filtering
**WHEN** calling `pluginApis.dsuni.product.list`
**WITH** query params: `{ page: 1, perPage: 20, filters: [{ id: "category", value: "electronics" }] }`
**THEN** global middleware checks `.meta({ permission: PERMISSIONS.products.view })`
**AND** PermissionKernel evaluates: `can('view', 'plugin:com.wordrhyme.dsuni:products')`
**AND** auto-crud-server generates query with filters
**AND** scoped-db automatically injects:
  - `WHERE organization_id = ctx.organizationId`
  - `AND acl_tags && ARRAY['org:{organizationId}', 'user:{userId}', ...]`
  - `AND NOT (deny_tags && ARRAY[...])`
**AND** results are paginated with total count
**AND** results include only products the user has LBAC access to

### Requirement 4: Admin UI Integration

**Priority**: MUST HAVE

The plugin SHALL provide a Module Federation 2.0 remote entry with admin UI for product/order management.

#### Scenario: Admin UI appears in sidebar
**WHEN** an admin user logs into wordrhyme admin UI
**THEN** the sidebar displays a "DSUni E-commerce" menu item
**AND** clicking it navigates to `/p/com.wordrhyme.dsuni`
**AND** the plugin remote entry loads from `/plugins/dsuni/dist/admin/remoteEntry.js`
**AND** the UI renders the product management dashboard

#### Scenario: UI uses @wordrhyme/ui components
**WHEN** examining the plugin frontend code
**THEN** it imports components from `@wordrhyme/ui`:
  - `Button`, `Dialog`, `DataTable`, `Form`
**AND** it does NOT bundle duplicate Radix UI components
**AND** Module Federation shared config marks `@wordrhyme/ui` as singleton

#### Scenario: Data table displays products
**WHEN** viewing the product management page
**THEN** it displays a data table with columns:
  - SPU ID, Name, Category, Variations Count, Stock, Price, Status
**AND** table supports sorting, filtering, pagination
**AND** clicking a row opens product detail dialog
**AND** clicking "Add Product" opens creation form

### Requirement 5: External Platform Plugin Dependencies

**Priority**: SHOULD HAVE

The dsuni plugin SHALL declare dependencies on external platform plugins and integrate via plugin APIs (not direct SDK calls).

#### Scenario: Shopify integration via plugin dependency
**WHEN** reviewing the dsuni plugin manifest
**THEN** it lists `com.wordrhyme.shopify` in `dependencies` (optional)
**AND** the plugin code checks if Shopify plugin is available:
  ```ts
  const shopifyPlugin = ctx.plugins.get('com.wordrhyme.shopify');
  if (shopifyPlugin) {
    // Sync product to Shopify via plugin API
  }
  ```
**AND** sync functionality is gracefully disabled if Shopify plugin is not installed

#### Scenario: Multiple platform syncs via event hooks
**WHEN** a product is created in dsuni
**THEN** the plugin emits a hook event: `dsuni.product.created`
**AND** external platform plugins (Shopify, WooCommerce) listen to this hook
**AND** each platform plugin independently syncs the product
**AND** dsuni plugin does NOT directly call external APIs

### Requirement 6: Order Fulfillment Workflow

**Priority**: MUST HAVE

The plugin SHALL provide order management with fulfillment tracking, integrated with wordrhyme's workflow capabilities.

#### Scenario: Create order from external platform
**WHEN** receiving a webhook from Shopify (via Shopify plugin)
**THEN** dsuni plugin creates an order record:
  ```ts
  {
    orderId: "external-platform-order-id",
    source: "shopify",
    status: "pending",
    lineItems: [...],
    shippingAddress: {...},
    tenantId: "...",
    workspaceId: "..."
  }
  ```
**AND** order is visible in dsuni admin UI
**AND** order lifecycle events are logged in audit trail

#### Scenario: Fulfill order
**WHEN** admin updates order status to "fulfilled"
**AND** provides tracking information
**THEN** order status changes to "fulfilled"
**AND** a fulfillment record is created with tracking number
**AND** a hook event `dsuni.order.fulfilled` is emitted
**AND** external platform plugin updates remote order status

---

## Success Criteria

### Technical Success
1. ✅ Plugin loads successfully on server restart (no errors in logs)
2. ✅ manifest.json correctly generated from manifest.ts at build time
3. ✅ All database tables created with correct naming, multi-tenancy fields, and LBAC fields
4. ✅ tRPC router accessible at `/trpc/pluginApis.dsuni.*`
5. ✅ Admin UI loads as Module Federation remote without errors
6. ✅ Product CRUD operations enforce organization_id auto-filtering (scoped-db)
7. ✅ LBAC auto-injection works (aclTags default: `['org:{organizationId}']`)
8. ✅ Empty aclTags blocks all access (security-first verified)
9. ✅ CASL permission checks work for all protected routes
10. ✅ CASL rules correctly registered to role_permissions table on install
11. ✅ Fine-grained permissions enable role separation (warehouse/customer service/finance)
12. ✅ ABAC conditions work with subject instances (order status restrictions)
13. ✅ Field-level filtering hides sensitive data (cost, supplier info)
14. ✅ Permission types auto-generated and type-safe (PERMISSIONS.products.view)
15. ✅ UI integrates with @wordrhyme/ui design system (no duplicate components)

### Business Success
1. ✅ Admin can create, list, update, delete products
2. ✅ Admin can manage product variations (SKUs) with pricing/stock
3. ✅ Admin can view and fulfill orders
4. ✅ System supports organization-level multi-tenancy (single-level, no workspace hierarchy)
5. ✅ External platform sync works (if plugins installed)
6. ✅ Data migration script successfully imports existing dsuni data

### Verifiable Behaviors
- **Test**: Create product → verify organization_id is auto-populated
- **Test**: Query products from different organization → verify isolation
- **Test**: Create product → verify `aclTags: ['org:{organizationId}']` auto-injected
- **Test**: Query with empty aclTags → verify no results returned (security-first)
- **Test**: Disable plugin → verify data is retained per manifest
- **Test**: Load admin UI → verify no console errors, components render
- **Test**: Submit product form → verify Zod validation works
- **Test**: Fulfill order → verify hook event is emitted
- **Test**: Build plugin → verify manifest.json generated from `src/permissions.ts`
- **Test**: Use permission in code → verify TypeScript auto-completion works

---

## Risks

### High Risk
1. **Data Migration Complexity**: dsuni has 20+ tables with JSONB fields and complex relations
   - **Mitigation**: Create comprehensive migration script with rollback support
   - **Fallback**: Start with minimal schema (products + orders only), expand later

2. **UI Rewrite Effort**: Entire Next.js frontend must be rebuilt as client components
   - **Mitigation**: Extract reusable components from @fsst/ui, rebuild incrementally
   - **Fallback**: Use basic CRUD UI first, enhance UX in later iterations

### Medium Risk
1. **External Platform Integration**: Plugin dependency model is untested at scale
   - **Mitigation**: Design clear plugin API contracts, use event hooks for loose coupling
   - **Fallback**: Implement direct API calls first, refactor to plugin APIs later

2. **Permission Model Translation**: dsuni's role+plan model doesn't map 1:1 to capabilities
   - **Mitigation**: Create capability matrix mapping dsuni features to wordrhyme permissions
   - **Fallback**: Use workspace roles as proxy for capability grants

### Low Risk
1. **Tailwind CSS conflicts**: @fsst/ui and @wordrhyme/ui may have different CSS variables
   - **Mitigation**: Use CSS variable namespacing, test dark mode compatibility
   - **Fallback**: Override plugin CSS with wordrhyme theme variables

---

## Dependencies

### Technical Dependencies
- **Required**:
  - `@wordrhyme/plugin` SDK (workspace:*)
    - 需要包含权限定义构建工具 (`build-manifest` 脚本)
    - 支持从 `src/permissions.ts` 自动生成 manifest.json
  - `@wordrhyme/auto-crud` (前端 CRUD 组件库)
  - `@wordrhyme/auto-crud-server` (后端 CRUD 路由生成器)
    - 需要集成 scoped-db 进行自动租户过滤
    - 需要支持 LBAC 字段的自动注入
  - `drizzle-orm` (compatible with wordrhyme version)
  - `drizzle-zod` (Drizzle schema → Zod schema 转换)
  - `zod` (schema validation)
  - `@wordrhyme/ui` (shared UI components)

- **Optional**:
  - `com.wordrhyme.shopify` plugin
  - `com.wordrhyme.woocommerce` plugin
  - `com.wordrhyme.alibaba` plugin (1688 integration)
  - `com.wordrhyme.aliexpress` plugin

### External Services
- PostgreSQL database (shared with wordrhyme core)
- Redis (for cache/pub-sub if needed)

### Blocking Work
1. **Plugin SDK 增强**:
   - `@wordrhyme/plugin` 需要实现权限定义构建工具
   - 支持集中代码定义 (`src/permissions.ts`) + 构建时生成 manifest
   - 提供 TypeScript 类型安全的权限引用
2. **Auto-CRUD 集成**:
   - `auto-crud-server` 需要集成 scoped-db 进行自动租户过滤
   - 支持 LBAC 字段（`aclTags`/`denyTags`）的自动注入
   - 默认策略：`aclTags: ['org:{organizationId}']`，空数组 = 无权限
3. **外部平台插件**:
   - Shopify/WooCommerce/1688/AliExpress plugins must be scaffolded first (can be empty stubs)
4. **核心系统功能**:
   - Plugin dependency resolution mechanism must be working in PluginManager
   - Hook system must support cross-plugin event emission

---

## Open Questions

### Resolved (via user input)
- ✅ Integration strategy: Complete refactor
- ✅ External platforms: Split into separate plugins
- ✅ Data migration: New schema with migration script
- ✅ Use case: E-commerce SaaS + supply chain

### Still Open
1. **Shared Product Catalog**: Should there be a global "goods" catalog (like dsuni's goods table) or all products tenant-scoped?
   - **Recommendation**: All products tenant-scoped; shared catalog can be a future plugin

2. **Product Mapping**: How to handle cross-platform product ID mapping?
   - **Recommendation**: Add `plugin_dsuni_product_mappings` table with (platformId, externalId, internalId)

3. **Pricing Model**: Should dsuni features be metered via wordrhyme's billing system?
   - **Recommendation**: Yes, declare capabilities like `dsuni.products.bulk_import` with usage limits

4. **API Rate Limiting**: Should external platform API calls be rate-limited per tenant?
   - **Recommendation**: Yes, use wordrhyme's queue capability for async sync jobs with rate limits

---

## Next Steps

### Immediate (Proposal Approval)
1. ✅ Create this proposal document
2. ⏳ Request user review and approval
3. ⏳ Create tasks.md with implementation breakdown

### After Approval
1. Create `openspec/changes/add-dsuni-plugin-integration/tasks.md`
2. Create spec deltas (if needed for affected capabilities)
3. Scaffold plugin directory structure: `/plugins/dsuni/`
4. Begin implementation per task sequence

---

## References

- **dsuni Analysis**: Agent a06bf1c (data layer), a3eb3ec (UI layer)
- **wordrhyme Plugin System**: Agent a39d6e2
- **Governance Docs**:
  - `docs/architecture/PLUGIN_CONTRACT.md`
  - `docs/architecture/DATA_MODEL_GOVERNANCE.md`
  - `docs/architecture/PERMISSION_GOVERNANCE.md`
  - `docs/architecture/SYSTEM_INVARIANTS.md`
- **Enhanced Requirement**: `/tmp/enhanced-prompt-*.md` (ace-tool output)
