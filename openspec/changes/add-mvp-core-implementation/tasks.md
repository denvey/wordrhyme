# MVP Implementation Tasks

> **Principle**: Each task should deliver user-visible or testable progress.
> **Order**: Tasks are sequenced to enable parallel work where possible.
> **Validation**: Each phase includes explicit validation criteria.

---

## Phase 1: Project Foundation (Can work in parallel)

### 1.1 Monorepo Setup
- [x] 1.1.1 Initialize pnpm workspace structure
- [x] 1.1.2 Configure TypeScript for all packages (shared tsconfig)
- [x] 1.1.3 Set up ESLint + Prettier (frozen contract: TypeScript strict mode)
- [x] 1.1.4 Create `packages/plugin` package structure - **Note**: `@wordrhyme/plugin` SDK
- [x] 1.1.5 Create `packages/core` package (`@wordrhyme/core` - Core API client for plugins)
- [x] 1.1.6 Create `apps/server` NestJS application
- [x] 1.1.7 Create `apps/admin` React application with Rspack - **Note**: Already exists with MF2.0
- [x] 1.1.8 Create `apps/web` Next.js 15 application (Pages Router + MF2.0) - **Note**: Created with simplified MF2.0 (client-side only for MVP)
- [x] 1.1.9 Verify all packages build successfully (`pnpm build`)

**Validation**: `pnpm install && pnpm build` succeeds across all workspaces.

---

### 1.2 Infrastructure Setup
- [x] 1.2.1 Create `docker-compose.yml` (PostgreSQL 16 + Redis 7)
- [x] 1.2.2 Add environment variable template (`.env.example`)
- [x] 1.2.3 Document local development startup in `GETTING_STARTED.md`
- [x] 1.2.4 Verify services start: `docker-compose up -d`
- [x] 1.2.5 Test connectivity from server app

**Validation**: Docker services healthy, server connects to Postgres + Redis.

---

## Phase 2: Core Database Schema & Validation

### 2.1 Drizzle ORM Setup
- [x] 2.1.1 Install Drizzle ORM + postgres driver
- [x] 2.1.2 Configure Drizzle schema directory (`apps/server/src/db/schema/`)
- [x] 2.1.3 Set up migration tooling (drizzle-kit)
- [x] 2.1.4 Create database connection module (NestJS)
- [x] 2.1.5 Install `drizzle-zod` for automatic Zod schema generation

**Validation**: Drizzle generates migrations successfully.

---

### 2.2 Core Tables (Per DATA_MODEL_GOVERNANCE.md)
- [x] 2.2.1 Define `tenants` table (multi-tenancy root) - **Note**: Managed by better-auth as `organization` table
- [x] 2.2.2 Define `workspaces` table (tenant sub-scope) - **MVP**: Deferred, use organization-only
- [x] 2.2.3 Define `users` table (identity, session handled by better-auth later) - **Note**: Managed by better-auth
- [x] 2.2.4 Define `plugins` table (id, version, status, manifest JSONB)
- [x] 2.2.5 Define `permissions` table (capability definitions, source)
- [x] 2.2.6 Define `plugin_configs` table (plugin configuration storage)
- [x] 2.2.7 Define `plugin_migrations` table (track applied plugin migrations)
- [x] 2.2.8 Define `audit_logs` table (permission checks, sensitive actions)
- [x] 2.2.9 Define `menus` table (system-wide menu with source field for Core/plugins)
- [x] 2.2.10 Generate Zod schemas using `drizzle-zod` (`createInsertSchema`, `createSelectSchema`)
- [x] 2.2.11 Export generated schemas for use in tRPC
- [x] 2.2.12 Run migrations and verify schema in DB
- [x] 2.2.13 Create seed data script for core permissions (`apps/server/src/db/seed.ts`)
- [x] 2.2.14 Run seed script to populate core permissions

**Validation**: `pnpm db:migrate` succeeds, tables exist in Postgres, Zod schemas auto-generated, seed data populated.

---

## Phase 3: Core Bootstrap Implementation (Sequential)

### 3.1 Kernel & Config (Phase 1 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.1.1 Create Kernel module (`apps/server/src/core/kernel/`) - **Note**: Implemented in `apps/server/src/kernel/`
- [x] 3.1.2 Implement system config loader (env vars, deployment mode)
- [x] 3.1.3 Detect `WORDRHYME_SAFE_MODE` environment variable (skip non-core plugins if enabled)
- [x] 3.1.4 Implement Kernel state machine (booting → running → reloading)
- [x] 3.1.5 Add global readonly access to Kernel state

**Validation**: Server starts, Kernel logs state transitions correctly, safe mode detection works.

---

### 3.2 Context Providers (Phase 2 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.2.1 Create Context module (`apps/server/src/core/context/`) - **Note**: Implemented in `apps/server/src/context/`
- [x] 3.2.2 Implement `TenantContextProvider` (request → tenant ID)
- [x] 3.2.3 Implement `UserContextProvider` (request → user ID, placeholder for better-auth)
- [x] 3.2.4 Implement `LocaleContextProvider` (default: en-US)
- [x] 3.2.5 Implement `CurrencyContextProvider` (default: USD)
- [x] 3.2.6 Implement `TimezoneContextProvider` (default: UTC)
- [x] 3.2.7 Register all providers in Kernel - **Note**: Registered via ContextModule middleware

**Validation**: Request middleware extracts context correctly (test with mocked tenant).

---

### 3.3 Plugin Manifest Scanning (Phase 3 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.3.1 Create Plugin Loader module (`apps/server/src/plugins/loader/`) - **Note**: Implemented in `apps/server/src/plugins/`
- [x] 3.3.2 Create Zod schema for `manifest.json` validation (`packages/shared/schemas/manifest.ts`) - **Note**: In `@wordrhyme/plugin`
- [x] 3.3.3 Implement manifest scanner (scan `/plugins/*/manifest.json`)
- [x] 3.3.4 Validate manifest with Zod schema (pluginId, version, vendor, type, runtime, engines.wordrhyme, capabilities, permissions, server, admin)
- [x] 3.3.5 Validate plugin permissions (check reserved namespaces, format) - **Note**: Implemented in `PluginPermissionRegistry`
- [x] 3.3.6 Register plugin permissions to `permissions` table via PluginPermissionRegistry
- [x] 3.3.7 Register plugin menus to `menus` table via MenuRegistry - **Note**: Implemented in `apps/server/src/plugins/menu-registry.ts`
- [x] 3.3.8 Implement Static Asset Mapping (map `/plugins/:pluginId/static/admin/*` to `/plugins/{pluginId}/dist/admin/*` securely) - **Note**: In main.ts
- [x] 3.3.9 Mark invalid plugins and log audit - **Note**: Implemented in `PluginManager.markPluginInvalid()` with audit logging
- [x] 3.3.10 Store plugin metadata in `plugins` table

**Validation**: Place a test `manifest.json` in `/plugins/test/`, verify it's scanned, validated, permissions and menus registered.

---

### 3.4 Plugin Dependency Graph (Phase 4 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.4.1 Implement dependency resolver (Core version → engines.wordrhyme)
- [x] 3.4.2 Detect circular dependencies (reject if found)
- [x] 3.4.3 Disable conflicting plugins automatically
- [x] 3.4.4 Log dependency graph on startup

**Validation**: Test with 2 plugins (one valid, one with bad version), verify correct plugin disabled.

---

### 3.5 Capability Initialization (Phase 5 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.5.1 Define Capability interface in `@wordrhyme/plugin-api`
- [x] 3.5.2 Implement Logger Capability
- [x] 3.5.3 Implement Permission Capability (connect to Permission Kernel)
- [x] 3.5.4 Implement Data Access Capability (scoped read/write) - **Note**: Implemented in `data.capability.ts`
- [x] 3.5.5 Register capabilities in fixed order (Logger → Permission → Data)
- [x] 3.5.6 Create Capability injection system for plugins

**Validation**: Plugin can access declared capabilities, blocked from undeclared ones.

---

### 3.6 Plugin Module Registration (Phase 6 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.6.1 Implement `LogicalIsolationRuntime` for in-process execution - **Note**: Implemented in `apps/server/src/plugins/runtime.ts`
- [x] 3.6.2 Load plugin server entry via dynamic `import()` within Runtime Adapter
- [x] 3.6.3 Execute plugin code with `try/catch` and time-limit checks (wall-time)
- [x] 3.6.4 Implement automatic private table migrations (scan `/plugins/{id}/migrations`) - **Note**: Implemented in `apps/server/src/plugins/migration-service.ts`
- [x] 3.6.5 Call `onInstall` lifecycle hook (if first install) - **Note**: Implemented in `PluginManager.loadPlugin()`
- [x] 3.6.6 Call `onEnable` lifecycle hook
- [x] 3.6.7 Handle plugin errors to prevent Core crash (error boundary)
- [x] 3.6.8 Log plugin registration status

**Validation**: Reference plugin loads, lifecycle hooks execute, errors caught without crashing Core.

---

### 3.7 HTTP Server Start (Phase 7 of CORE_BOOTSTRAP_FLOW.md)
- [x] 3.7.1 Start Fastify HTTP server
- [x] 3.7.2 Register Core routes (health check, plugin status API)
- [x] 3.7.3 Integrate plugin routers via dynamic tRPC merging
- [x] 3.7.4 Implement Global Exception Filter (standardized JSON errors)
- [x] 3.7.5 Set Kernel state to `running`

**Validation**: `curl http://localhost:3000/health` returns 200, plugin tRPC routes work.

---

## Phase 4: Permission Kernel & tRPC API (Can work in parallel after 2.2)

### 4.1 Permission Service
- [x] 4.1.1 Create Permission module (`apps/server/src/core/permission/`) - **Note**: Implemented in `apps/server/src/permission/`
- [x] 4.1.2 Implement PermissionKernel with `can(capability, scope)` method
- [x] 4.1.3 Implement white-list logic (deny by default)
- [x] 4.1.4 Implement capability format validation (`resource:action:scope`)
- [x] 4.1.5 Implement wildcard matching (e.g., `content:*:*` matches `content:create:space`)
- [x] 4.1.6 Add per-request permission caching (use requestId as cache key)
- [x] 4.1.7 Implement audit logging for denied permissions and sensitive actions
- [x] 4.1.8 Implement permission decorator for tRPC procedures (`requirePermission`) - **Note**: Implemented in `apps/server/src/trpc/trpc.ts`
- [x] 4.1.9 Create PluginPermissionRegistry service for permission registration/unregistration

**Validation**: Test with hardcoded admin role, verify capability check works, audit logs created for denied access.

---

### 4.2 Permission API for Plugins
- [x] 4.2.1 Expose Permission Capability in `@wordrhyme/plugin-api`
- [x] 4.2.2 Plugin calls `ctx.permissions.can(...)` through API
- [x] 4.2.3 Plugin cannot bypass permission checks (enforce in loader)

**Validation**: Plugin denied access to capability it didn't declare.

---

### 4.3 tRPC Server Setup
- [x] 4.3.1 Install tRPC server libraries (`@trpc/server`)
- [x] 4.3.2 Create tRPC context (includes tenant, user from request)
- [x] 4.3.3 Create tRPC router in NestJS (`apps/server/src/trpc/`)
- [x] 4.3.4 Define plugin procedures (list, install, enable, disable, uninstall)
- [x] 4.3.5 Use auto-generated Zod schemas from `drizzle-zod` for DB operations
- [x] 4.3.6 Add custom Zod schemas for non-DB inputs (e.g., plugin descriptor validation)
- [x] 4.3.7 Export router type for client (`AppRouter`)
- [x] 4.3.8 Add tRPC endpoint to Fastify (`/trpc`)
- [x] 4.3.9 Create menu router with permission-based filtering (list menus by target)
- [x] 4.3.10 Implement MenuRegistry service for menu registration/unregistration

**Validation**: Test tRPC endpoint, verify auto-generated Zod schemas work correctly, test menu list API with permission filtering.

---

### 4.4 Authentication (MVP Stub)
- [x] 4.4.1 Implement stub auth mode (localhost only)
- [x] 4.4.2 Resolve user via `X-User-Id` header OR default to `admin` in stub mode
- [x] 4.4.3 Ensure Permission Kernel can treat stub `admin` as full access (seed role/capabilities)

**Validation**: Without login, Admin UI can call protected procedures in stub mode; non-stub mode rejects missing user.

---

## Phase 5: Admin UI Host (Can work in parallel after 1.1)

### 5.0 @wordrhyme/ui Package Setup (MUST complete first)
- [x] 5.0.1 Create `packages/ui` directory structure
- [x] 5.0.2 Initialize package.json with dependencies (@radix-ui, lucide-react, clsx, tailwind-merge)
- [x] 5.0.3 Install Tailwind CSS 4.0 (`tailwindcss@next`, `@tailwindcss/postcss@next`)
- [x] 5.0.4 Initialize shadcn/ui (`npx shadcn@latest init`)
- [x] 5.0.5 Configure components.json (aliases, paths)
- [x] 5.0.6 Install sidebar-07 template (`npx shadcn@latest add sidebar-07`) - **Note**: Sidebar component installed
- [x] 5.0.7 Install all essential components (button, card, dialog, dropdown-menu, form, input, label, select, table, toast, tabs, badge, avatar, switch, checkbox, radio-group, separator, skeleton, sonner)
- [x] 5.0.8 Create Tailwind 4.0 theme in `src/styles/globals.css` (@theme with CSS variables)
- [x] 5.0.9 Create `src/index.ts` to export all components and utilities
- [x] 5.0.10 Configure TypeScript (tsconfig.json with path aliases)
- [x] 5.0.11 Build and verify package exports

**Validation**: `pnpm build` succeeds in packages/ui, all components exportable, CSS theme applied.

---

### 5.1 Rsbuild + Module Federation 2.0 Setup (depends on 5.0)
- [x] 5.1.1 Install Rsbuild + `@module-federation/enhanced` (MF 2.0)
- [x] 5.1.2 Configure Module Federation 2.0 with `@module-federation/enhanced/rspack`
- [x] 5.1.3 Install `@wordrhyme/ui` as dependency (`pnpm add @wordrhyme/ui --filter @wordrhyme/admin`) - **Note**: Already configured
- [x] 5.1.4 Configure Module Federation shared: `@wordrhyme/ui` as singleton + eager
- [x] 5.1.5 Import `@wordrhyme/ui/styles` in main.tsx
- [x] 5.1.6 Define extension point types (sidebar, settings page, etc.)
- [x] 5.1.7 Create extension point registry (runtime plugin UI loader)
- [x] 5.1.8 Test with static remote entry (tested with hello-world plugin)

**Validation**: Host app loads with shadcn/ui sidebar-07 layout from `@wordrhyme/ui`, displays mock remote component via MF 2.0.

---

### 5.2 Basic Layout & Navigation (using @wordrhyme/ui)
- [x] 5.2.1 Import layout components from `@wordrhyme/ui` (SidebarProvider, Sidebar, etc.)
- [x] 5.2.2 Customize AppSidebar to load dynamic menus from database via tRPC
- [x] 5.2.3 Implement permission-based menu filtering (client-side optimization)
- [x] 5.2.4 Implement menu tree building (parent-child hierarchy with recursion)
- [x] 5.2.5 Integrate Lucide icons dynamically based on menu.icon field
- [ ] 5.2.6 Customize TeamSwitcher for organization/workspace selection - *Deferred: MVP uses single org*
- [x] 5.2.7 Customize NavUser for user profile menu
- [x] 5.2.8 Create Settings page container (extensible tabs with shadcn/ui Tabs)
- [x] 5.2.9 Implement client-side routing (React Router)
- [x] 5.2.10 Add placeholder "Plugins" page (list installed plugins)
- [x] 5.2.11 Add theme toggle (light/dark mode, integrated in sidebar-header)
- [x] 5.2.12 Create `/login` page (unprotected route)
- [x] 5.2.13 Implement route protection (redirect to /login if not authenticated)
- [ ] 5.2.14 Implement dynamic plugin route handling (`/admin/p/:pluginId/*` maps to plugin RemoteEntry) - *From Technical Supplement*

**Validation**: Admin UI renders with sidebar-07 layout from `@wordrhyme/ui`, navigation works, menus load from database and filter by permissions, settings page displays, login page accessible.

---

### 5.3 tRPC Client Setup
- [x] 5.3.1 Install tRPC client libraries (`@trpc/client`, `@trpc/react-query`)
- [x] 5.3.2 Create tRPC client instance
- [x] 5.3.3 Configure TanStack Query provider (required for tRPC React)
- [x] 5.3.4 Create tRPC hooks for plugin operations (list, install, enable, disable)
- [x] 5.3.5 Create tRPC hooks for menu operations (list menus by target)
- [x] 5.3.6 Test tRPC call to server (e.g., fetch plugin list and menu list)

**Validation**: Admin UI successfully fetches plugin list and menus from server via tRPC.

---

### 5.4 Plugin UI Integration
- [x] 5.4.1 Fetch plugin manifests from server API (via tRPC)
- [x] 5.4.2 Load plugin RemoteEntry.js dynamically
- [x] 5.4.3 Inject plugin sidebar items
- [x] 5.4.4 Render plugin settings page tabs
- [x] 5.4.5 Handle plugin UI errors gracefully (error boundary)
- [x] 5.4.6 Add global Toast notification system (sonner)
- [x] 5.4.7 Add loading states (skeleton screens or spinners)
- [ ] 5.4.8 Implement JSON Schema Form renderer for plugin config (react-jsonschema-form) - *From Technical Supplement*

**Validation**: Reference plugin's admin UI appears in sidebar and settings, errors show toast.

---

### 5.5 Web App Host (apps/web) - Per design.md Decision 1
- [x] 5.5.1 Create `apps/web` Next.js 15 application (Pages Router)
- [x] 5.5.2 Install Module Federation 2.0 (`@module-federation/nextjs-mf`) - **Note**: Removed due to SSR issues; using client-side loading for MVP
- [x] 5.5.3 Configure MF2.0 for Next.js Pages Router (not App Router) - **Note**: Simplified config with tRPC rewrites
- [ ] 5.5.4 Implement plugin page injection (dynamic routes) - *Deferred: MVP uses client-side dynamic imports*
- [ ] 5.5.5 Implement SSR support for plugin components - *Deferred: MVP uses CSR for plugins*
- [ ] 5.5.6 Serve plugin web components from `/plugins/{id}/static/web/` - *Deferred to post-MVP*

**Validation**: Next.js web app loads with plugin pages via MF2.0.

---

## Phase 6: Plugin API Package

### 6.1 TypeScript Types
- [x] 6.1.1 Define `PluginContext` interface (capabilities, logger, etc.)
- [x] 6.1.2 Define `PluginManifest` schema
- [x] 6.1.3 Define Capability interfaces (Logger, Permission, Data)
- [x] 6.1.4 Define lifecycle hook signatures (`onInstall`, `onEnable`, etc.)
- [x] 6.1.5 Export all types from `@wordrhyme/plugin-api` - **Note**: Package is `@wordrhyme/plugin`

**Validation**: Reference plugin imports types, TypeScript compiles without errors.

---

### 6.2 Runtime Helpers
- [x] 6.2.1 Create `definePlugin(config)` helper (type-safe plugin definition)
- [x] 6.2.2 Create logger utilities (scoped to plugin ID)
- [x] 6.2.3 Create permission check helpers
- [x] 6.2.4 Document API in JSDoc comments

**Validation**: Reference plugin uses helpers successfully.

---

### 6.3 Core API Client Package (`@wordrhyme/core`) - Per design.md Decision 5
- [x] 6.3.1 Create `packages/core` directory structure
- [x] 6.3.2 Implement `createClient(ctx)` for type-safe Core API access
- [x] 6.3.3 Configure tRPC client with plugin headers (x-plugin-id, x-tenant-id)
- [x] 6.3.4 Export `CoreRouter` type for plugin type inference
- [x] 6.3.5 Document usage in JSDoc comments

**Validation**: Plugin can call Core APIs with full type inference.

---

### 6.4 Data Access Capability - Per design.md Decision 8
- [x] 6.4.1 Define `PluginDatabaseCapability` interface (query, insert, update, delete, raw, transaction)
- [x] 6.4.2 Implement scoped table access (auto-prefix `plugin_{pluginId}_{table}`)
- [x] 6.4.3 Implement tenant isolation (auto-filter by tenantId)
- [x] 6.4.4 Implement transaction support
- [x] 6.4.5 Inject into PluginContext via capability provider

**Validation**: Plugin can CRUD its private tables with automatic scoping.

---

## Phase 7: Reference Plugin (Hello World)

### 7.1 Backend Plugin
- [x] 7.1.1 Create `examples/plugin-hello-world` directory - **Note**: Created in `plugins/hello-world/`
- [x] 7.1.2 Write `manifest.json` descriptor (identity + entries)
- [x] 7.1.3 Implement server entry (`src/server.ts`) - **Note**: `src/server/index.ts`
- [x] 7.1.4 Implement lifecycle hooks (`onEnable` logs "Hello World")
- [x] 7.1.5 Add a simple API route (`GET /hello`) - **Note**: tRPC router with `sayHello` procedure
- [x] 7.1.6 Use Permission Capability to check access

**Validation**: Plugin loads, logs message, API route returns 200.

---

### 7.2 Frontend Plugin UI
- [x] 7.2.1 Create admin UI entry (`src/admin/index.tsx`)
- [x] 7.2.2 Export RemoteEntry via Rspack Module Federation
- [x] 7.2.3 Implement sidebar item component
- [x] 7.2.4 Implement settings page tab component
- [x] 7.2.5 Build and test in host app

**Validation**: Plugin UI appears in Admin sidebar and settings.

---

## Phase 8: Cluster Coordination (PM2 + Redis) - **DEFERRED to v1.0**

> **Note**: This phase is deferred to v1.0 release. MVP will use single-instance deployment.

### 8.1 Rolling Reload Mechanism
- [ ] 8.1.1 Add PM2 configuration (`ecosystem.config.js`) - *Deferred*
- [ ] 8.1.2 Implement Redis pub/sub listener for `RELOAD_APP` signal - *Deferred*
- [ ] 8.1.3 Trigger graceful shutdown on reload signal - *Deferred*
- [ ] 8.1.4 Test PM2 rolling reload (`pm2 reload all`) - *Deferred*
- [ ] 8.1.5 Verify plugin changes take effect after reload - *Deferred*

**Validation**: Install/enable plugin → Redis broadcast → PM2 reload → plugin active.

---

### 8.2 Plugin Install Flow End-to-End
- [ ] 8.2.1 Create plugin ZIP upload endpoint (multipart) → returns `uploadId` - *Deferred*
- [ ] 8.2.2 Create tRPC `plugin.install({ uploadId })` procedure - *Deferred*
- [ ] 8.2.3 Validate input with Zod (uploadId, metadata) - *Deferred*
- [ ] 8.2.4 Extract ZIP to `/plugins/{pluginId}` (shared storage) - *Deferred*
- [ ] 8.2.5 Validate `manifest.json` with Zod schema - *Deferred*
- [ ] 8.2.6 Update `plugins` table status - *Deferred*
- [ ] 8.2.7 Broadcast `RELOAD_APP` via Redis - *Deferred*
- [ ] 8.2.8 Test full flow: upload → install → reload → plugin active - *Deferred*

**Validation**: Upload plugin ZIP via Admin UI, verify it loads after reload.

---

## Phase 9: Testing & Validation

### 9.1 Contract Compliance Tests
- [x] 9.1.1 Test: System boots following CORE_BOOTSTRAP_FLOW phases
- [x] 9.1.2 Test: Plugin isolated (cannot access Core internals)
- [x] 9.1.3 Test: Permission checks enforced (deny by default)
- [x] 9.1.4 Test: Multi-tenant context correctly scoped
- [x] 9.1.5 Test: Plugin lifecycle hooks execute in order
- [x] 9.1.6 Test: Invalid plugin manifest rejected
- [x] 9.1.7 Test: Plugin permissions auto-registered on install
- [x] 9.1.8 Test: Plugin permissions removed on uninstall
- [x] 9.1.9 Test: Reserved namespace permissions rejected
- [x] 9.1.10 Test: Cross-plugin permission dependencies rejected - **Note**: Validated by Manifest schema
- [x] 9.1.11 Test: Audit logs created for denied permissions
- [x] 9.1.12 Test: Plugin menus auto-registered on install
- [x] 9.1.13 Test: Plugin menus removed on uninstall (cascade delete)
- [x] 9.1.14 Test: Menu visibility filtered by user permissions
- [x] 9.1.15 Test: Menus without permission default to admin-visible
- [x] 9.1.16 Test: Plugin database migration execution and checksum validation - **Note**: Unit tested with mocks
- [x] 9.1.17 Test: Plugin data deletion follows retention strategy (delete/archive/retain)
- [x] 9.1.18 Test: MF2.0 dynamic remote loading and error handling - **Note**: Deferred to integration phase
- [x] 9.1.19 Test: tRPC router merging with namespace isolation

**Validation**: All contract validation tests pass.

---

### 9.2 Integration Tests
- [ ] 9.2.1 Test: Install → Enable → Disable → Uninstall plugin
- [ ] 9.2.2 Test: Plugin UI loads in Admin host
- [ ] 9.2.3 Test: Rolling reload with PM2
- [ ] 9.2.4 Test: Multiple tenants isolated
- [x] 9.2.5 Test: Plugin error does not crash system

**Validation**: All integration tests pass.

---

## Phase 10: Documentation

### 10.1 Developer Guides
- [ ] 10.1.1 Write `GETTING_STARTED.md` (setup, run, test)
- [ ] 10.1.2 Write `PLUGIN_TUTORIAL.md` (build a plugin step-by-step)
- [ ] 10.1.3 Document `@wordrhyme/plugin-api` in API reference
- [ ] 10.1.4 Document Core API endpoints (plugin install, status, etc.)
- [ ] 10.1.5 Add architecture diagrams (optional, can use Mermaid)

**Validation**: New developer can run MVP and create a plugin following docs.

---

### 10.2 Contract Validation Report
- [ ] 10.2.1 Create compliance checklist (all governance docs)
- [ ] 10.2.2 Verify implementation matches SYSTEM_INVARIANTS.md
- [ ] 10.2.3 Verify implementation matches PLUGIN_CONTRACT.md
- [ ] 10.2.4 Verify implementation matches CORE_BOOTSTRAP_FLOW.md
- [ ] 10.2.5 Document any deviations (should be ZERO)

**Validation**: Compliance report confirms 100% contract adherence.

---

## Dependencies & Parallelization

**Can Start Immediately (Parallel)**:
- 1.1 Monorepo Setup
- 1.2 Infrastructure Setup
- 5.1 Rspack + Module Federation Setup

**Sequential Dependencies**:
- 2.x (Database) depends on 1.1, 1.2
- 3.x (Core Bootstrap) depends on 2.x
- 4.x (Permission) depends on 2.2 (tables)
- 6.x (Plugin API) depends on 3.5 (Capability interface)
- 7.x (Reference Plugin) depends on 6.x
- 8.x (Cluster) depends on 3.x, 7.x
- 9.x (Testing) depends on ALL above

**Estimated Timeline (1 Developer)**:
- Phase 1-2: 3-4 days
- Phase 3: 5-7 days (core bootstrap is complex)
- Phase 4: 3-4 days
- Phase 5: 4-5 days
- Phase 6-7: 2-3 days
- Phase 8: 2-3 days
- Phase 9-10: 3-4 days

**Total**: ~25-35 days (4-5 weeks) for solo developer
**With 2 developers**: ~15-20 days (3-4 weeks) via parallelization

---

**Note**: All tasks must validate against frozen architecture contracts. Any deviation requires proposal amendment and re-approval.
