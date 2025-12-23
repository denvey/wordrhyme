# Change: Nebula CMS MVP Core Implementation

## Why

Nebula CMS currently exists only as architecture documentation (v0.1). To validate the frozen architecture contracts and enable plugin ecosystem development, we need a **Minimal Viable Product (MVP)** that implements:

1. **Core System Bootstrap** - Demonstrates the deterministic startup flow defined in `CORE_BOOTSTRAP_FLOW.md`
2. **Plugin Lifecycle Management** - Validates the plugin contract via at least one reference plugin
3. **Permission Kernel** - Implements the centralized authorization model
4. **Multi-tenant Context** - Proves tenant isolation works as designed
5. **Basic Admin UI** - Provides a host application for plugin UI integration

The MVP must strictly follow all frozen contracts and governance documents. It is **NOT** about building a feature-complete CMS, but rather proving the architecture is implementable and the contracts are correct.

## What Changes

### New Capabilities (All ADDED)

- **core-bootstrap**: System initialization following `CORE_BOOTSTRAP_FLOW.md`
- **plugin-runtime**: Plugin loading, lifecycle management, and isolation
- **plugin-assets**: Secure static asset serving for plugin UI
- **permission-kernel**: Centralized permission evaluation and enforcement
- **multi-tenant-context**: Tenant/Workspace/User context providers
- **admin-ui-host**: React + Rspack + Module Federation 2.0 host application
- **plugin-api**: Public API boundary for plugins (`@nebula/plugin-api`)
- **database-schema**: Core PostgreSQL schema (Drizzle ORM)
- **cluster-coordination**: Redis-based reload signaling (PM2 integration)

### Implementation Scope

**Backend (NestJS + Fastify + tRPC)**:
- Core kernel with deterministic bootstrap phases (1-7)
- Plugin manifest (`manifest.json`) scanning and validation with Zod
- Capability injection system (Logger, Permission, Data Migrator)
- Plugin database migrations (automatic private table setup)
- Secure plugin static asset serving (for Module Federation entries)
- Permission service (capability-based authorization)
- Context providers (tenant, user, locale, currency, timezone)
- Database models (Core tables only - no plugin data yet)
- Rolling reload mechanism via PM2
- tRPC API router for type-safe client-server communication

**Frontend (React + Rspack + Module Federation + shadcn/ui)**:
- Admin UI host application with shadcn/ui components
- Extension point registry (sidebar, settings pages)
- Plugin remote entry loader (Module Federation)
- Basic layout (header, sidebar, content area)
- tRPC client for type-safe server calls
- Tailwind CSS + shadcn/ui for consistent design system

**Developer Experience**:
- `@nebula/plugin-api` package (TypeScript types + runtime)
- Reference plugin example (demonstrates lifecycle + UI extension)
- Development environment setup (Docker Compose for Postgres + Redis)
- CLI for plugin scaffolding (optional, can defer)

**Out of Scope (Explicitly NOT in MVP)**:
- ❌ Billing & Marketplace (defer to post-MVP)
- ❌ Event hooks (defer to post-MVP)
- ❌ Globalization runtime (defer, use English + USD defaults)
- ❌ Observability dashboard (defer, logs only)
- ❌ Plugin marketplace UI
- ❌ Advanced permission UI (just API + hardcoded admin role)
- ❌ Content modeling (CMS-specific features)
- ❌ API gateway / rate limiting

## Impact

### Affected Specs (New Specs Created)
All specs are **NEW** (no existing specs to modify):

- `specs/core-bootstrap/spec.md` - System initialization requirements
- `specs/plugin-runtime/spec.md` - Plugin lifecycle and loading
- `specs/permission-kernel/spec.md` - Authorization model
- `specs/multi-tenant-context/spec.md` - Context providers
- `specs/admin-ui-host/spec.md` - Frontend host application
- `specs/plugin-api/spec.md` - Public plugin API contract
- `specs/database-schema/spec.md` - Core data models
- `specs/cluster-coordination/spec.md` - Multi-node reload

### Affected Code
All code is **NEW**:

- `apps/server/` - Backend application
- `apps/admin/` - Frontend application
- `packages/plugin-api/` - Shared plugin API package
- `packages/core/` - Core domain logic (if needed)
- `examples/plugin-hello-world/` - Reference plugin
- `infra/docker-compose.yml` - Local development environment
- `package.json` - Monorepo setup (pnpm workspaces or npm workspaces)

### Validation Criteria

The MVP is considered **successful** if:

1. ✅ System boots deterministically following `CORE_BOOTSTRAP_FLOW.md` phases
2. ✅ A reference plugin can be installed, enabled, disabled, uninstalled
3. ✅ Plugin UI appears in Admin host via Module Federation
4. ✅ Permission checks block unauthorized capability access
5. ✅ Multi-tenant context is correctly resolved per request
6. ✅ Rolling reload works via PM2 when plugin state changes
7. ✅ All governance contracts are validated (no violations)

### Breaking Changes

**NONE** - This is the first implementation. All contracts remain frozen.

### Dependencies

**Runtime**:
- Node.js 20+ (LTS)
- PostgreSQL 16+
- Redis 7+
- pnpm 9+ (package manager)

**Key Libraries**:
- NestJS + Fastify (backend framework)
- Drizzle ORM + drizzle-zod (database + auto-generated schemas)
- tRPC (type-safe API)
- Zod (validation, auto-generated from Drizzle for DB operations)
- React + Rspack (frontend)
- Module Federation 2.0 (`@module-federation/enhanced`) (plugin UI loading)
- shadcn/ui + Tailwind CSS 4.0 (UI components)

### Architecture Alignment

This MVP implementation **MUST** comply with:

- ✅ `SYSTEM_INVARIANTS.md` - All constitutional rules
- ✅ `CORE_DOMAIN_CONTRACT.md` - Core boundary enforcement
- ✅ `PLUGIN_CONTRACT.md` - Plugin isolation and capability model
- ✅ `CORE_BOOTSTRAP_FLOW.md` - Bootstrap phase ordering
- ✅ `PERMISSION_GOVERNANCE.md` - White-list authorization model
- ✅ `RUNTIME_GOVERNANCE.md` - Plugin execution boundaries
- ✅ `DATA_MODEL_GOVERNANCE.md` - Core vs plugin data ownership

Any implementation detail that conflicts with these contracts is **invalid by definition**.

---

**Proposal Status**: Pending approval
**Target Version**: v0.1-alpha.1 (first implementation)
**Estimated Complexity**: HIGH (foundational work, ~3-4 week effort for 1 developer)
**Risk Level**: MEDIUM (architecture validation, no production users yet)
