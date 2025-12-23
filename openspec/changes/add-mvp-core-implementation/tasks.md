# MVP Implementation Tasks

> **Principle**: Each task should deliver user-visible or testable progress.
> **Order**: Tasks are sequenced to enable parallel work where possible.
> **Validation**: Each phase includes explicit validation criteria.

---

## Phase 1: Project Foundation (Can work in parallel)

### 1.1 Monorepo Setup
- [ ] 1.1.1 Initialize pnpm workspace structure
- [ ] 1.1.2 Configure TypeScript for all packages (shared tsconfig)
- [ ] 1.1.3 Set up ESLint + Prettier (frozen contract: TypeScript strict mode)
- [ ] 1.1.4 Create `packages/plugin-api` package structure
- [ ] 1.1.5 Create `packages/shared` package (shared Zod schemas, tRPC types)
- [ ] 1.1.6 Create `apps/server` NestJS application
- [ ] 1.1.7 Create `apps/admin` React application with Rspack
- [ ] 1.1.8 Verify all packages build successfully (`pnpm build`)

**Validation**: `pnpm install && pnpm build` succeeds across all workspaces.

---

### 1.2 Infrastructure Setup
- [ ] 1.2.1 Create `docker-compose.yml` (PostgreSQL 16 + Redis 7)
- [ ] 1.2.2 Add environment variable template (`.env.example`)
- [ ] 1.2.3 Document local development startup in `GETTING_STARTED.md`
- [ ] 1.2.4 Verify services start: `docker-compose up -d`
- [ ] 1.2.5 Test connectivity from server app

**Validation**: Docker services healthy, server connects to Postgres + Redis.

---

## Phase 2: Core Database Schema & Validation

### 2.1 Drizzle ORM Setup
- [ ] 2.1.1 Install Drizzle ORM + postgres driver
- [ ] 2.1.2 Configure Drizzle schema directory (`apps/server/src/db/schema/`)
- [ ] 2.1.3 Set up migration tooling (drizzle-kit)
- [ ] 2.1.4 Create database connection module (NestJS)
- [ ] 2.1.5 Install `drizzle-zod` for automatic Zod schema generation

**Validation**: Drizzle generates migrations successfully.

---

### 2.2 Core Tables (Per DATA_MODEL_GOVERNANCE.md)
- [ ] 2.2.1 Define `tenants` table (multi-tenancy root)
- [ ] 2.2.2 Define `workspaces` table (tenant sub-scope)
- [ ] 2.2.3 Define `users` table (identity, session handled by better-auth later)
- [ ] 2.2.4 Define `plugins` table (id, version, status, manifest JSONB)
- [ ] 2.2.5 Define `permissions` table (capability definitions)
- [ ] 2.2.6 Define `role_permissions` table (role → capability mapping)
- [ ] 2.2.7 Define `user_roles` table (user → role → tenant-scoped)
- [ ] 2.2.8 Generate Zod schemas using `drizzle-zod` (`createInsertSchema`, `createSelectSchema`)
- [ ] 2.2.9 Export generated schemas for use in tRPC
- [ ] 2.2.10 Run migrations and verify schema in DB

**Validation**: `pnpm db:migrate` succeeds, tables exist in Postgres, Zod schemas auto-generated.

---

## Phase 3: Core Bootstrap Implementation (Sequential)

### 3.1 Kernel & Config (Phase 1 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.1.1 Create Kernel module (`apps/server/src/core/kernel/`)
- [ ] 3.1.2 Implement system config loader (env vars, deployment mode)
- [ ] 3.1.3 Detect `NEBULA_SAFE_MODE` environment variable (skip non-core plugins if enabled)
- [ ] 3.1.4 Implement Kernel state machine (booting → running → reloading)
- [ ] 3.1.5 Add global readonly access to Kernel state

**Validation**: Server starts, Kernel logs state transitions correctly, safe mode detection works.

---

### 3.2 Context Providers (Phase 2 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.2.1 Create Context module (`apps/server/src/core/context/`)
- [ ] 3.2.2 Implement `TenantContextProvider` (request → tenant ID)
- [ ] 3.2.3 Implement `UserContextProvider` (request → user ID, placeholder for better-auth)
- [ ] 3.2.4 Implement `LocaleContextProvider` (default: en-US)
- [ ] 3.2.5 Implement `CurrencyContextProvider` (default: USD)
- [ ] 3.2.6 Implement `TimezoneContextProvider` (default: UTC)
- [ ] 3.2.7 Register all providers in Kernel

**Validation**: Request middleware extracts context correctly (test with mocked tenant).

---

### 3.3 Plugin Manifest Scanning (Phase 3 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.3.1 Create Plugin Loader module (`apps/server/src/plugins/loader/`)
- [ ] 3.3.2 Create Zod schema for `manifest.json` validation (`packages/shared/schemas/manifest.ts`)
- [ ] 3.3.3 Implement manifest scanner (scan `/plugins/*/manifest.json`)
- [ ] 3.3.4 Validate manifest with Zod schema (pluginId, version, vendor, type, runtime, engines.nebula, capabilities, permissions, server, admin)
- [ ] 3.3.5 Implement Static Asset Mapping (map `/plugins/:pluginId/static/admin/*` to `/plugins/{pluginId}/dist/admin/*` securely)
- [ ] 3.3.6 Mark invalid plugins and log audit
- [ ] 3.3.7 Store plugin metadata in `plugins` table

**Validation**: Place a test `manifest.json` in `/plugins/test/`, verify it's scanned and validated.

---

### 3.4 Plugin Dependency Graph (Phase 4 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.4.1 Implement dependency resolver (Core version → engines.nebula)
- [ ] 3.4.2 Detect circular dependencies (reject if found)
- [ ] 3.4.3 Disable conflicting plugins automatically
- [ ] 3.4.4 Log dependency graph on startup

**Validation**: Test with 2 plugins (one valid, one with bad version), verify correct plugin disabled.

---

### 3.5 Capability Initialization (Phase 5 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.5.1 Define Capability interface in `@nebula/plugin-api`
- [ ] 3.5.2 Implement Logger Capability
- [ ] 3.5.3 Implement Permission Capability (connect to Permission Kernel)
- [ ] 3.5.4 Implement Data Access Capability (scoped read/write)
- [ ] 3.5.5 Register capabilities in fixed order (Logger → Permission → Data)
- [ ] 3.5.6 Create Capability injection system for plugins

**Validation**: Plugin can access declared capabilities, blocked from undeclared ones.

---

### 3.6 Plugin Module Registration (Phase 6 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.6.1 Implement `LogicalIsolationRuntime` for in-process execution
- [ ] 3.6.2 Load plugin server entry via dynamic `import()` within Runtime Adapter
- [ ] 3.6.3 Execute plugin code with `try/catch` and time-limit checks (wall-time)
- [ ] 3.6.4 Implement automatic private table migrations (scan `/plugins/{id}/migrations`)
- [ ] 3.6.5 Call `onInstall` lifecycle hook (if first install)
- [ ] 3.6.6 Call `onEnable` lifecycle hook
- [ ] 3.6.7 Handle plugin errors to prevent Core crash (error boundary)
- [ ] 3.6.8 Log plugin registration status

**Validation**: Reference plugin loads, lifecycle hooks execute, errors caught without crashing Core.

---

### 3.7 HTTP Server Start (Phase 7 of CORE_BOOTSTRAP_FLOW.md)
- [ ] 3.7.1 Start Fastify HTTP server
- [ ] 3.7.2 Register Core routes (health check, plugin status API)
- [ ] 3.7.3 Integrate plugin routers via dynamic tRPC merging
- [ ] 3.7.4 Implement Global Exception Filter (standardized JSON errors)
- [ ] 3.7.5 Set Kernel state to `running`

**Validation**: `curl http://localhost:3000/health` returns 200, plugin tRPC routes work.

---

## Phase 4: Permission Kernel & tRPC API (Can work in parallel after 2.2)

### 4.1 Permission Service
- [ ] 4.1.1 Create Permission module (`apps/server/src/core/permission/`)
- [ ] 4.1.2 Implement `can(user, capability, scope)` method
- [ ] 4.1.3 Implement white-list logic (deny by default)
- [ ] 4.1.4 Query `user_roles` + `role_permissions` + context
- [ ] 4.1.5 Add permission caching (in-memory, per-request only)
- [ ] 4.1.6 Implement permission decorator for NestJS routes (`@RequirePermission`)

**Validation**: Test with hardcoded admin role, verify capability check works.

---

### 4.2 Permission API for Plugins
- [ ] 4.2.1 Expose Permission Capability in `@nebula/plugin-api`
- [ ] 4.2.2 Plugin calls `ctx.permissions.can(...)` through API
- [ ] 4.2.3 Plugin cannot bypass permission checks (enforce in loader)

**Validation**: Plugin denied access to capability it didn't declare.

---

### 4.3 tRPC Server Setup
- [ ] 4.3.1 Install tRPC server libraries (`@trpc/server`)
- [ ] 4.3.2 Create tRPC context (includes tenant, user from request)
- [ ] 4.3.3 Create tRPC router in NestJS (`apps/server/src/trpc/`)
- [ ] 4.3.4 Define plugin procedures (list, install, enable, disable, uninstall)
- [ ] 4.3.5 Use auto-generated Zod schemas from `drizzle-zod` for DB operations
- [ ] 4.3.6 Add custom Zod schemas for non-DB inputs (e.g., plugin descriptor validation)
- [ ] 4.3.7 Export router type for client (`AppRouter`)
- [ ] 4.3.8 Add tRPC endpoint to Fastify (`/trpc`)

**Validation**: Test tRPC endpoint, verify auto-generated Zod schemas work correctly.

---

### 4.4 Authentication (MVP Stub)
- [ ] 4.4.1 Implement stub auth mode (localhost only)
- [ ] 4.4.2 Resolve user via `X-User-Id` header OR default to `admin` in stub mode
- [ ] 4.4.3 Ensure Permission Kernel can treat stub `admin` as full access (seed role/capabilities)

**Validation**: Without login, Admin UI can call protected procedures in stub mode; non-stub mode rejects missing user.

---

## Phase 5: Admin UI Host (Can work in parallel after 1.1)

### 5.1 Rspack + Module Federation 2.0 Setup
- [ ] 5.1.1 Install Rspack + `@module-federation/enhanced` (MF 2.0)
- [ ] 5.1.2 Configure Module Federation 2.0 with `@module-federation/enhanced/rspack`
- [ ] 5.1.3 Define standard Shared Dependencies (react, react-dom, lucide-react, shadcn base)
- [ ] 5.1.4 Install Tailwind CSS 4.0 + configure via `@config` directive
- [ ] 5.1.5 Install shadcn/ui CLI (`npx shadcn-ui@latest init`)
- [ ] 5.1.6 Add core shadcn/ui components (Button, Card, Tabs, Dialog, etc.)
- [ ] 5.1.7 Define extension point types (sidebar, settings page, etc.)
- [ ] 5.1.8 Create extension point registry (runtime plugin UI loader)
- [ ] 5.1.9 Test with static remote entry (mock plugin UI)

**Validation**: Host app loads and displays mock remote component via MF 2.0.

---

### 5.2 Basic Layout & Navigation
- [ ] 5.2.1 Create Layout component using shadcn/ui (header, sidebar, content area)
- [ ] 5.2.2 Create Sidebar component (extensible via plugin entries)
- [ ] 5.2.3 Create Settings page container (extensible tabs with shadcn/ui Tabs)
- [ ] 5.2.4 Implement client-side routing (React Router)
- [ ] 5.2.5 Add placeholder "Plugins" page (list installed plugins)
- [ ] 5.2.6 Add dark mode toggle (shadcn/ui theme support)
- [ ] 5.2.7 Create `/login` page (unprotected route)
- [ ] 5.2.8 Implement route protection (redirect to /login if not authenticated)

**Validation**: Admin UI renders, navigation works, settings page displays, login page accessible.

---

### 5.3 tRPC Client Setup
- [ ] 5.3.1 Install tRPC client libraries (`@trpc/client`, `@trpc/react-query`)
- [ ] 5.3.2 Create tRPC client instance
- [ ] 5.3.3 Configure TanStack Query provider (required for tRPC React)
- [ ] 5.3.4 Create tRPC hooks for plugin operations (list, install, enable, disable)
- [ ] 5.3.5 Test tRPC call to server (e.g., fetch plugin list)

**Validation**: Admin UI successfully fetches plugin list from server via tRPC.

---

### 5.4 Plugin UI Integration
- [ ] 5.4.1 Fetch plugin manifests from server API (via tRPC)
- [ ] 5.4.2 Load plugin RemoteEntry.js dynamically
- [ ] 5.4.3 Inject plugin sidebar items
- [ ] 5.4.4 Render plugin settings page tabs
- [ ] 5.4.5 Handle plugin UI errors gracefully (error boundary)
- [ ] 5.4.6 Add global Toast notification system (e.g., sonner)
- [ ] 5.4.7 Add loading states (skeleton screens or spinners)

**Validation**: Reference plugin's admin UI appears in sidebar and settings, errors show toast.

---

## Phase 6: Plugin API Package

### 6.1 TypeScript Types
- [ ] 6.1.1 Define `PluginContext` interface (capabilities, logger, etc.)
- [ ] 6.1.2 Define `PluginManifest` schema
- [ ] 6.1.3 Define Capability interfaces (Logger, Permission, Data)
- [ ] 6.1.4 Define lifecycle hook signatures (`onInstall`, `onEnable`, etc.)
- [ ] 6.1.5 Export all types from `@nebula/plugin-api`

**Validation**: Reference plugin imports types, TypeScript compiles without errors.

---

### 6.2 Runtime Helpers
- [ ] 6.2.1 Create `definePlugin(config)` helper (type-safe plugin definition)
- [ ] 6.2.2 Create logger utilities (scoped to plugin ID)
- [ ] 6.2.3 Create permission check helpers
- [ ] 6.2.4 Document API in JSDoc comments

**Validation**: Reference plugin uses helpers successfully.

---

## Phase 7: Reference Plugin (Hello World)

### 7.1 Backend Plugin
- [ ] 7.1.1 Create `examples/plugin-hello-world` directory
- [ ] 7.1.2 Write `manifest.json` descriptor (identity + entries)
- [ ] 7.1.3 Implement server entry (`src/server.ts`)
- [ ] 7.1.4 Implement lifecycle hooks (`onEnable` logs "Hello World")
- [ ] 7.1.5 Add a simple API route (`GET /hello`)
- [ ] 7.1.6 Use Permission Capability to check access

**Validation**: Plugin loads, logs message, API route returns 200.

---

### 7.2 Frontend Plugin UI
- [ ] 7.2.1 Create admin UI entry (`src/admin.tsx`)
- [ ] 7.2.2 Export RemoteEntry via Rspack Module Federation
- [ ] 7.2.3 Implement sidebar item component
- [ ] 7.2.4 Implement settings page tab component
- [ ] 7.2.5 Build and test in host app

**Validation**: Plugin UI appears in Admin sidebar and settings.

---

## Phase 8: Cluster Coordination (PM2 + Redis)

### 8.1 Rolling Reload Mechanism
- [ ] 8.1.1 Add PM2 configuration (`ecosystem.config.js`)
- [ ] 8.1.2 Implement Redis pub/sub listener for `RELOAD_APP` signal
- [ ] 8.1.3 Trigger graceful shutdown on reload signal
- [ ] 8.1.4 Test PM2 rolling reload (`pm2 reload all`)
- [ ] 8.1.5 Verify plugin changes take effect after reload

**Validation**: Install/enable plugin → Redis broadcast → PM2 reload → plugin active.

---

### 8.2 Plugin Install Flow End-to-End
- [ ] 8.2.1 Create plugin ZIP upload endpoint (multipart) → returns `uploadId`
- [ ] 8.2.2 Create tRPC `plugin.install({ uploadId })` procedure
- [ ] 8.2.3 Validate input with Zod (uploadId, metadata)
- [ ] 8.2.4 Extract ZIP to `/plugins/{pluginId}` (shared storage)
- [ ] 8.2.5 Validate `manifest.json` with Zod schema
- [ ] 8.2.6 Update `plugins` table status
- [ ] 8.2.7 Broadcast `RELOAD_APP` via Redis
- [ ] 8.2.8 Test full flow: upload → install → reload → plugin active

**Validation**: Upload plugin ZIP via Admin UI, verify it loads after reload.

---

## Phase 9: Testing & Validation

### 9.1 Contract Compliance Tests
- [ ] 9.1.1 Test: System boots following CORE_BOOTSTRAP_FLOW phases
- [ ] 9.1.2 Test: Plugin isolated (cannot access Core internals)
- [ ] 9.1.3 Test: Permission checks enforced (deny by default)
- [ ] 9.1.4 Test: Multi-tenant context correctly scoped
- [ ] 9.1.5 Test: Plugin lifecycle hooks execute in order
- [ ] 9.1.6 Test: Invalid plugin manifest rejected

**Validation**: All contract validation tests pass.

---

### 9.2 Integration Tests
- [ ] 9.2.1 Test: Install → Enable → Disable → Uninstall plugin
- [ ] 9.2.2 Test: Plugin UI loads in Admin host
- [ ] 9.2.3 Test: Rolling reload with PM2
- [ ] 9.2.4 Test: Multiple tenants isolated
- [ ] 9.2.5 Test: Plugin error does not crash system

**Validation**: All integration tests pass.

---

## Phase 10: Documentation

### 10.1 Developer Guides
- [ ] 10.1.1 Write `GETTING_STARTED.md` (setup, run, test)
- [ ] 10.1.2 Write `PLUGIN_TUTORIAL.md` (build a plugin step-by-step)
- [ ] 10.1.3 Document `@nebula/plugin-api` in API reference
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
