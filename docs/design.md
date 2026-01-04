# MVP Design Document

## Context

WordRhyme exists as a frozen architecture specification (v0.1) with no implementation code. The MVP must prove:

1. The frozen contracts are **implementable** and **correct**
2. The plugin isolation model works in practice
3. The bootstrap flow is deterministic and testable
4. Module Federation 2.0 can support plugin UI integration

**Stakeholders**:
- Core development team (validating architecture)
- Plugin authors (need stable API to build against)
- Future SaaS operators (need to understand deployment model)

**Constraints**:
- MUST comply with ALL frozen governance documents
- MUST NOT introduce features outside contract scope
- MUST use specified tech stack (no alternatives)
- MUST be production-grade code quality (not prototype-quality)

---

## Goals / Non-Goals

### Goals

1. **Validate Bootstrap Flow**: Prove `CORE_BOOTSTRAP_FLOW.md` phases work sequentially
2. **Validate Plugin Contract**: Reference plugin demonstrates isolation and capability model
3. **Validate Permission Model**: White-list authorization with centralized kernel works
4. **Validate Multi-Tenancy**: Context providers correctly scope all operations
5. **Validate UI Extension**: Module Federation loads plugin UI without Core coupling
6. **Validate Rolling Reload**: PM2 + Redis enables zero-downtime plugin changes

### Non-Goals

1. ❌ Feature completeness (no content modeling, no workflows, no SEO)
2. ❌ Production deployment (no CI/CD, no monitoring dashboard, no backups)
3. ❌ Marketplace (no billing, no payment gateway, no plugin discovery)
4. ❌ Advanced permissions UI (just API, hardcoded admin role is sufficient)
5. ❌ Observability beyond logging (no metrics, no tracing, no APM)
6. ❌ Globalization runtime (defaults to en-US + USD, i18n structure can wait)

---

## Decisions

### Decision 1: Monorepo Structure

**Choice**: Turborepo + pnpm workspaces with separate `apps/` and `packages/`

**Why**:
- Plugin API must be a separate package (plugins import it, not Core)
- Three frontend apps (Admin + Web) + Backend (Server) are distinct deployables
- Turborepo provides efficient build orchestration and caching
- Enables shared TypeScript configs and tooling

**Alternatives Considered**:
- Multi-repo (rejected: increases coordination overhead for MVP)
- Nx (rejected: more complex than needed for MVP)
- pnpm workspaces alone (rejected: lacks build orchestration)

**Structure**:
```
wordrhyme/
├── apps/
│   ├── server/          # NestJS + Fastify backend (API server)
│   ├── admin/           # React + Rspack (Admin dashboard, 后台管理)
│   └── web/             # Next.js 15 (Frontend website, 前台展示)
├── packages/
│   ├── plugin/          # @wordrhyme/plugin (Plugin SDK)
│   └── core/            # @wordrhyme/core (Core API client)
├── examples/
│   └── plugin-hello-world/
├── infra/
│   └── docker-compose.yml
├── turbo.json           # Turborepo configuration
└── pnpm-workspace.yaml  # pnpm workspace definition
```

**Tech Stack by App**:

| App | Tech Stack | Purpose | Plugin Integration |
|-----|-----------|---------|-------------------|
| **server** | NestJS + Fastify + tRPC + Drizzle | API backend | tRPC Router (required) + NestJS Module (optional) |
| **admin** | React + Rspack + TanStack Router + MF2.0 | Admin dashboard | MF2.0 Runtime API (dynamic remotes) |
| **web** | Next.js 15 (Pages Router) + MF2.0 | Public-facing website | MF2.0 Runtime API (dynamic remotes) |

**Plugin Development Options**:

| Aspect | Simple Plugin | Advanced Plugin |
|--------|--------------|----------------|
| **Server** | tRPC Router only | tRPC Router + NestJS Module |
| **Admin UI** | MF2.0 components | MF2.0 components + pages |
| **Web UI** | MF2.0 pages | MF2.0 pages + SSR |
| **Database** | PluginContext.db | PluginContext.db + migrations |
| **Lifecycle** | onEnable/onDisable | Full lifecycle + custom hooks |

---

### Decision 2: Database Schema Strategy

**Choice**: Drizzle ORM with explicit schema files + automatic Zod schema generation via `drizzle-zod`

**Why**:
- Drizzle is lightweight (fast startup, contractually required)
- Explicit migrations avoid implicit schema drift
- TypeScript-native (type safety for queries)
- **Single source of truth**: Database schema → Auto-generate Zod schemas
- Eliminates manual schema duplication (no separate Zod definitions)

**Implementation**:
```ts
// 1. Define Drizzle schema
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  email: text('email').notNull(),
});

// 2. Auto-generate Zod schema
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// 3. Use in tRPC
export const userRouter = router({
  create: publicProcedure
    .input(insertUserSchema)
    .mutation(({ input }) => db.insert(users).values(input)),
});
```

**Alternatives Considered**:
- Prisma (rejected: slower startup, magic ORM behavior)
- TypeORM (rejected: decorator-heavy, hidden complexity)
- Knex.js (rejected: too low-level, no type safety)
- Manual Zod schemas (rejected: duplicates database schema, error-prone)

**Migration Strategy**:
- Development: `drizzle-kit generate` + manual review
- Production: Versioned migrations in git (no auto-apply)

---

### Decision 3: MVP Runtime Simplifications (Pragmatic Approach)

**Choice**: Logical isolation only (no Worker Thread/Process/WASM) for MVP phase

**Why**:
- **MVP goal**: Validate plugin integration mechanics, not security isolation
- **Time-to-market**: Minimize complexity to ship faster and iterate
- **Risk acceptable**: MVP only loads first-party trusted plugins (not marketplace plugins)
- **Future-proof**: Contracts remain unchanged, can upgrade to WASM in v2.0 without breaking Plugin API

**What This Means for MVP**:

| Contract Requirement | MVP Implementation | Deferred To |
|---------------------|-------------------|-------------|
| Plugin code never in Core execution context | ❌ **Simplified**: Direct `import()` in same process | v1.0+ (Worker/Process) |
| Runtime must be forcibly terminable | ❌ **Simplified**: No timeout enforcement | v1.0+ |
| Resource limits (CPU, Memory, Task Count) | ❌ **Simplified**: No monitoring | v1.0+ |
| Three isolation levels (Logic/Thread/Memory) | ⚠️ **Partial**: Logic isolation only (try/catch) | v2.0 (WASM) |
| Rolling Reload (PM2 + Redis) | ⚠️ **Simplified**: Single-process hot reload via `import()` | v1.0+ (PM2) |

**MVP Implementation**:
```ts
// Simplified Runtime (no Worker Thread, no Process isolation)
class LogicalIsolationRuntime implements PluginRuntime {
  private plugins = new Map<string, PluginModule>();

  async load(pluginId: string, entryPath: string) {
    try {
      // Direct dynamic import (same process, same thread)
      const module = await import(entryPath);
      this.plugins.set(pluginId, module);

      // Call lifecycle hook if exists
      if (module.onEnable) {
        await module.onEnable(this.buildContext(pluginId));
      }
    } catch (error) {
      console.error(`Failed to load plugin ${pluginId}:`, error);
      throw error;
    }
  }

  async execute(pluginId: string, method: string, params: any) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin?.handlers?.[method]) {
      throw new Error(`Method ${method} not found in plugin ${pluginId}`);
    }

    try {
      // Direct invocation (no IPC, no Worker message passing)
      return await plugin.handlers[method](params, this.buildContext(pluginId));
    } catch (error) {
      // Simple error boundary
      console.error(`Plugin ${pluginId}.${method} failed:`, error);
      throw error;
    }
  }

  private buildContext(pluginId: string): PluginContext {
    return {
      pluginId,
      logger: console, // Simplified: use global console
      // Capabilities will be added incrementally
    };
  }
}
```

**Deferred to v1.0+**:
- Resource monitoring and limits
- Forcible termination capability
- Worker Thread / Process isolation
- Crash recovery and quarantine
- PM2 cluster mode with rolling reload

**Deferred to v2.0**:
- WASM sandbox isolation (target architecture)
- Capability-based security model (fine-grained)
- Multi-runtime support (Node/Edge/WASM)
- Plugin signature verification

**Migration Path**:
- `PluginRuntime` interface remains abstract (contract unchanged)
- Implementation can be swapped: `LogicalIsolationRuntime` → `WorkerThreadRuntime` → `WASMRuntime`
- Plugin API stays stable across all runtime implementations
- v2.0 upgrade: Replace runtime implementation, plugins don't need changes

**Why This Is Acceptable for MVP**:
1. **Scope**: MVP validates contracts are implementable, not production-ready security
2. **Risk**: Only first-party plugins (no untrusted third-party code)
3. **Iteration**: Can upgrade runtime without breaking plugins
4. **Focus**: Spend time on plugin integration (tRPC + Module Federation), not isolation complexity

**Documentation Note**:
- Mark `RUNTIME_GOVERNANCE.md` sections with `<!-- MVP: Deferred to v1.0+ -->`
- Add comment in code: `// TODO(v1.0): Replace with WorkerThreadRuntime`
- Keep contracts frozen (they define v2.0 target, not MVP constraints)

---

### Decision 4: Plugin Capability Injection (Simplified for MVP)

**Choice**: Direct object injection (no Runtime Adapter boundary for MVP)

**Why**:
- **Simplified**: Since we're using logical isolation (Decision 3), no need for IPC-based capability injection
- **Future-proof**: Can add Runtime Adapter layer in v1.0 when upgrading to Worker/Process isolation

**MVP Implementation**:
```ts
// Simplified capability injection (direct object passing)
const context: PluginContext = {
  pluginId: manifest.pluginId,
  logger: console, // Direct reference (same process)
  // Add more capabilities incrementally
};

// Direct invocation (no Worker, no message passing)
await plugin.handlers.someMethod(params, context);
```

**Deferred to v1.0+** (when using Worker/Process):
```ts
// Future: Capability injection via IPC/Worker message passing
const capabilitySet = buildCapabilitySetForPlugin(manifest.capabilities);
const runtime = runtimeRegistry.getOrCreate(manifest.pluginId);

await runtime.execute({
  kind: 'lifecycle',
  pluginId: manifest.pluginId,
  entry: manifest.server.entry,
  hook: 'onEnable',
  context: freezePluginContext({
    logger: capabilitySet.logger,          // Proxied facade
    permissions: permissionServiceFacade,  // Serializable API
    data: capabilitySet.data,              // RPC-based data access
  }),
});
```

**Trade-off**:
- ✅ MVP: Simpler, faster to implement
- ❌ MVP: No process-level isolation (acceptable for trusted plugins)
- ✅ Future: Can upgrade to proxied capabilities without changing Plugin API surface

---

### Decision 5 (formerly Decision 3): Plugin Capability Injection (Full Implementation - Deferred)

> **Note**: This decision describes the **target architecture** for v1.0+. MVP uses simplified approach (see Decision 4).

**Choice**: Capability injection via Core-owned adapters + Runtime Adapter boundary (plugins do not execute in Core call stack)

**Why**:
- Complies with `RUNTIME_GOVERNANCE.md`: plugin code is executed through a single Runtime Adapter entrypoint and can be terminated/timed-out without taking Core down
- Complies with `PLUGIN_CONTRACT.md` / `SYSTEM_INVARIANTS.md`: plugins only interact with Core through Capability API facades
- Enforces capability white-listing at injection time (undeclared capabilities never become available)

**Implementation**:
```ts
// In Core (no plugin code execution here)
const capabilitySet = buildCapabilitySetForPlugin(manifest.capabilities);
const runtime = runtimeRegistry.getOrCreate(manifest.pluginId); // e.g., WorkerThreadRuntime for node plugins

// Execute plugin lifecycle via Runtime Adapter (single entrypoint)
await runtime.execute({
  kind: 'lifecycle',
  pluginId: manifest.pluginId,
  entry: manifest.server.entry, // e.g. "./dist/server.js"
  hook: 'onEnable',
  context: freezePluginContext({
    logger: capabilitySet.logger,          // Core-owned facade/proxy
    permissions: permissionServiceFacade,  // always available adjudicator facade
    data: capabilitySet.data,              // only if declared
    dbMigrator: capabilitySet.dbMigrator,  // Core executes migrations on behalf of plugin
  }),
});
```

**Alternatives Considered**:
- Global singletons (rejected: violates isolation)
- Direct `import()` + in-process hook execution (rejected: violates Runtime Governance “single execution entry” and termination guarantees)

---

### Decision 4: Plugin UI Loading Strategy

**Choice**: **Module Federation 2.0** with runtime remote entry URLs

**Why**:
- Contractually required (REFERENCE_ARCHITECTURE.md specifies MF 2.0)
- **Module Federation 2.0 improvements** over 1.0:
  - Better runtime performance (optimized chunk loading)
  - Enhanced type safety (automatic TypeScript types sharing)
  - Improved error handling
  - Native support for modern bundlers (Rspack, Vite)
 - Bundle/runtime *dependency* isolation (plugins don’t bundle host code; not a security sandbox)
 - Supports plugin versioning (can load multiple versions)

**Module Federation 2.0 Key Features**:
- `@module-federation/enhanced` - Modern runtime with better DX
- Type-safe shared dependencies
- Dynamic remote loading with better error boundaries
- Built-in support for async boundary handling

**Implementation**:
- Host defines extension points: `registerExtension(point, component)`
- Plugin manifest includes `admin.remoteEntry` as a file path relative to the plugin root (example: `"./dist/admin/remoteEntry.js"`)
- Host fetches plugin descriptors from the server API; the server returns a fully-resolved `admin.remoteEntryUrl` (example: `"/plugins/{pluginId}/static/admin/remoteEntry.js"`)
- Host loads the remote entry URL at runtime
- Error boundary per plugin UI (failure isolated)
- Use `@module-federation/enhanced/rspack` for Rspack integration

**Shared Dependencies**:
To ensure UI consistency and avoid runtime errors, the Host must share:
- `react`, `react-dom`
- `lucide-react`
- `@wordrhyme/plugin-api` (essential for runtime context)
- Basic CSS variables and theme tokens (Tailwind/shadcn base)

---

### Decision 5: tRPC Dynamic Plugin Routing (Hot Reload + Type Safety)

**Choice**: Dynamic router merging with full type inference support

**Why**:
- tRPC's `router.merge()` enables runtime router composition
- Plugins define routers like normal tRPC projects (excellent DX)
- Full type safety: plugin types exported and imported by frontend
- Hot reload: install/uninstall plugins without restarting server
- **Best of both worlds**: Developer experience + Type safety + Hot reload

**Architecture Overview**:

```
┌─────────────────────────────────────────────────────────────┐
│                     Plugin Developer                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Define Router (like normal tRPC project)                 │
│     import { router, publicProcedure } from '@wordrhyme/plugin' │
│                                                               │
│  2. Call Core APIs (type-safe)                               │
│     import { createClient } from '@wordrhyme/core'              │
│     const core = createClient(ctx);                          │
│     await core.user.list.query();  ← Full type inference!   │
│                                                               │
│  3. Export types for frontend                                │
│     export type AnalyticsRouter = typeof router;             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

#### Part 1: Core Router (Dynamic Merging)

```ts
// ===== apps/server/src/trpc/router.ts =====
import { router } from './trpc';
import { userRouter } from './routers/user';
import { contentRouter } from './routers/content';
import { pluginManagementRouter } from './routers/plugin';

// Core routes (static)
const coreRouter = router({
  user: userRouter,
  content: contentRouter,
  plugin: pluginManagementRouter, // Plugin management APIs
});

// Plugin routers (dynamic)
const pluginRouters = new Map<string, any>();

// Export current app router (dynamically updated)
let _appRouter = coreRouter;

export const getAppRouter = () => _appRouter;

// Register plugin router (called by PluginManager)
export function registerPluginRouter(pluginId: string, pluginRouter: any) {
  // 1. Store plugin router
  pluginRouters.set(pluginId, pluginRouter);

  // 2. Rebuild app router (merge all plugins)
  _appRouter = rebuildAppRouter();

  console.log(`[tRPC] Plugin router registered: ${pluginId}`);
}

// Unregister plugin router
export function unregisterPluginRouter(pluginId: string) {
  pluginRouters.delete(pluginId);
  _appRouter = rebuildAppRouter();

  console.log(`[tRPC] Plugin router unregistered: ${pluginId}`);
}

// Rebuild app router by merging core + all plugins
function rebuildAppRouter() {
  let merged = coreRouter;

  // Merge each plugin router under its namespace
  for (const [pluginId, pluginRouter] of pluginRouters.entries()) {
    const namespace = pluginId.replace(/\./g, '_'); // com.example.analytics → com_example_analytics
    merged = merged.merge(namespace, pluginRouter);
  }

  return merged;
}

// Export type for client
export type AppRouter = typeof _appRouter;

// Export core router type (for plugins to call system APIs)
export type CoreRouter = typeof coreRouter;
```

#### Part 2: Plugin Management Router

```ts
// ===== apps/server/src/trpc/routers/plugin.ts =====
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { pluginManager } from '../../plugins/plugin-manager';

export const pluginManagementRouter = router({
  // List all plugins
  list: publicProcedure.query(async () => {
    return db.select().from(pluginsTable);
  }),

  // Get plugin info (for UI loading)
  getInfo: publicProcedure
    .input(z.object({ pluginId: z.string() }))
    .query(async ({ input }) => {
      const plugin = pluginManager.get(input.pluginId);
      return {
        ...plugin?.manifest,
        admin: {
          remoteEntryUrl: `/plugins/${input.pluginId}/dist/admin/remoteEntry.js`,
        },
      };
    }),

  // Install plugin (hot reload)
  install: publicProcedure
    .input(z.object({ uploadId: z.string() }))
    .mutation(async ({ input }) => {
      const pluginId = await pluginManager.install(input.uploadId);
      return { pluginId };
    }),

  // Uninstall plugin
  uninstall: publicProcedure
    .input(z.object({ pluginId: z.string() }))
    .mutation(async ({ input }) => {
      await pluginManager.uninstall(input.pluginId);
      return { success: true };
    }),
});
```

#### Part 3: Plugin Development Experience

**Package 1: @wordrhyme/plugin** (Plugin SDK)
```ts
// ===== packages/plugin/src/trpc.ts =====
// Re-export tRPC builders for plugins
export { router, publicProcedure } from '@trpc/server';
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

// Plugin context type
export interface PluginContext {
  pluginId: string;
  tenantId?: string;
  userId?: string;
  logger: {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
  // TODO: Add more capabilities (db, permissions, etc.)
}

// Helper to create plugin procedure with context
import { initTRPC } from '@trpc/server';

const t = initTRPC.context<PluginContext>().create();

export const pluginRouter = t.router;
export const pluginProcedure = t.procedure;
```

**Package 2: @wordrhyme/core** (Core API Client)
```ts
// ===== packages/core/src/index.ts =====
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { CoreRouter } from '@server/trpc/router';
import type { PluginContext } from '@wordrhyme/plugin';

/**
 * Create type-safe client for calling Core APIs from plugins
 *
 * Usage: Plugins use this to call Core APIs (user management, content, etc.)
 *
 * @param ctx - Plugin context
 * @returns Type-safe Core API client
 *
 * @example
 * ```ts
 * import { createClient } from '@wordrhyme/core';
 *
 * const api = createClient(ctx);
 *
 * // Full type inference and autocomplete
 * const currentUser = await api.user.getCurrent.query();
 * const allUsers = await api.user.list.query();
 * const newContent = await api.content.create.mutate({ ... });
 * ```
 */
export function createClient(ctx: PluginContext) {
  return createTRPCProxyClient<CoreRouter>({
    links: [
      httpBatchLink({
        url: process.env.WORDRHYME_API_URL || 'http://localhost:3000/trpc',
        headers: {
          'x-plugin-id': ctx.pluginId,
          'x-tenant-id': ctx.tenantId || '',
          'x-user-id': ctx.userId || '',
        },
      }),
    ],
  });
}

// Export core router type for type inference
export type { CoreRouter };
export type CoreClient = ReturnType<typeof createClient>;
```

#### Part 4: Plugin Example (Full Experience)

```ts
// ===== examples/plugin-analytics/src/server/router.ts =====
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/trpc';
import { createClient } from '@wordrhyme/core';  // ← Call Core APIs
import { z } from 'zod';

export const router = pluginRouter({
  // Define plugin's own APIs
  trackEvent: pluginProcedure
    .input(z.object({
      event: z.string(),
      page: z.string(),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 1. Call Core APIs (type-safe!)
      const api = createClient(ctx);
      const currentUser = await api.user.getCurrent.query();  // ← Autocomplete!

      // 2. Plugin business logic
      ctx.logger.info('Tracking event', {
        event: input.event,
        page: input.page,
        user: currentUser.id,
      });

      // 3. Store in plugin's private table (future)
      // await ctx.db.insert(eventsTable).values({ ... });

      return {
        success: true,
        timestamp: Date.now(),
        userId: currentUser.id,
      };
    }),

  getStats: pluginProcedure
    .input(z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }))
    .query(async ({ input, ctx }) => {
      // Query plugin data
      return {
        pageViews: 1234,
        uniqueVisitors: 567,
      };
    }),
});

// Export type for frontend
export type AnalyticsRouter = typeof router;
```

```ts
// ===== examples/plugin-analytics/src/server/index.ts =====
import { router } from './router';

// Export router (PluginManager will auto-register)
export { router };

// Optional lifecycle hooks
export async function onEnable(ctx: PluginContext) {
  ctx.logger.info('Analytics plugin enabled');
}

export async function onDisable(ctx: PluginContext) {
  ctx.logger.info('Analytics plugin disabled');
}
```

#### Part 5: Frontend Type-Safe Usage

```ts
// ===== apps/admin/src/hooks/use-plugin.ts =====
import { trpc } from '../utils/trpc';
import type { inferRouterProxyClient } from '@trpc/client';

/**
 * Create type-safe plugin client
 *
 * @example
 * ```ts
 * import type { AnalyticsRouter } from '@plugins/analytics';
 *
 * const analytics = usePluginClient<AnalyticsRouter>('com.example.analytics');
 * const stats = await analytics.getStats.query({ ... });
 * ```
 */
export function usePluginClient<TRouter>(pluginId: string) {
  const namespace = pluginId.replace(/\./g, '_');
  return (trpc as any)[namespace] as inferRouterProxyClient<TRouter>;
}
```

```ts
// ===== apps/admin/src/features/analytics/use-analytics.ts =====
import type { AnalyticsRouter } from '@plugins/analytics';
import { usePluginClient } from '@/hooks/use-plugin';

export function useAnalytics() {
  const client = usePluginClient<AnalyticsRouter>('com.example.analytics');

  return {
    trackEvent: client.trackEvent.useMutation(),
    getStats: client.getStats.useQuery,
  };
}
```

```tsx
// ===== apps/admin/src/pages/Dashboard.tsx =====
import { useAnalytics } from '@/features/analytics/use-analytics';

function Dashboard() {
  const { trackEvent, getStats } = useAnalytics();

  // Full type inference and autocomplete!
  const stats = getStats({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-12-31T23:59:59Z',
  });

  const handleClick = () => {
    trackEvent.mutate({
      event: 'dashboard_view',  // ✅ TypeScript autocomplete
      page: '/dashboard',        // ✅ Type checking
      metadata: { source: 'navbar' },
    });
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Page Views: {stats.data?.pageViews}</p>
      <button onClick={handleClick}>Track View</button>
    </div>
  );
}
```

#### Part 6: PluginManager Integration

```ts
// ===== apps/server/src/plugins/plugin-manager.ts =====
import { registerPluginRouter, unregisterPluginRouter } from '../trpc/router';
import path from 'path';
import { extractZip } from '../utils/zip';
import { db, pluginsTable } from '../db';
import type { PluginContext } from '@wordrhyme/plugin-api';

class PluginManager {
  private plugins = new Map<string, PluginModule>();

  async install(uploadId: string): Promise<string> {
    // 1. Extract ZIP
    const zipPath = `/tmp/uploads/${uploadId}.zip`;
    const pluginDir = await extractZip(zipPath, '/plugins');

    // 2. Load manifest
    const manifest = await this.loadManifest(pluginDir);

    // 3. Dynamic import plugin module
    const serverEntry = path.join(pluginDir, manifest.server.entry);
    const pluginModule = await import(serverEntry + '?t=' + Date.now());

    // 4. Register plugin router (if exists)
    if (pluginModule.router) {
      registerPluginRouter(manifest.pluginId, pluginModule.router);
    }

    // 5. Call onEnable lifecycle hook
    if (pluginModule.onEnable) {
      const ctx = this.buildContext(manifest.pluginId);
      await pluginModule.onEnable(ctx);
    }

    // 6. Store in memory
    this.plugins.set(manifest.pluginId, {
      manifest,
      module: pluginModule,
    });

    // 7. Persist to database
    await db.insert(pluginsTable).values({
      pluginId: manifest.pluginId,
      status: 'enabled',
      version: manifest.version,
    });

    console.log(`[PluginManager] Plugin installed: ${manifest.pluginId}`);
    return manifest.pluginId;
  }

  async uninstall(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // 1. Call onDisable lifecycle hook
    if (plugin.module.onDisable) {
      const ctx = this.buildContext(pluginId);
      await plugin.module.onDisable(ctx);
    }

    // 2. Unregister router
    unregisterPluginRouter(pluginId);

    // 3. Remove from memory
    this.plugins.delete(pluginId);

    // 4. Clear module cache
    const modulePath = require.resolve(`/plugins/${pluginId}/dist/server.js`);
    delete require.cache[modulePath];

    // 5. Update database
    await db.update(pluginsTable)
      .set({ status: 'disabled' })
      .where(eq(pluginsTable.pluginId, pluginId));

    console.log(`[PluginManager] Plugin uninstalled: ${pluginId}`);
  }

  get(pluginId: string) {
    return this.plugins.get(pluginId);
  }

  private buildContext(pluginId: string): PluginContext {
    return {
      pluginId,
      logger: {
        info: (msg, meta) => console.log(`[${pluginId}]`, msg, meta),
        error: (msg, meta) => console.error(`[${pluginId}]`, msg, meta),
      },
      // TODO: Add more capabilities
    };
  }

  private async loadManifest(pluginDir: string) {
    const manifestPath = path.join(pluginDir, 'manifest.json');
    const manifest = await import(manifestPath);
    // TODO: Validate with Zod schema
    return manifest;
  }
}

export const pluginManager = new PluginManager();

interface PluginModule {
  manifest: PluginManifest;
  module: {
    router?: any;
    onEnable?: (ctx: PluginContext) => Promise<void>;
    onDisable?: (ctx: PluginContext) => Promise<void>;
  };
}
```

---

**Package Structure**:

```
wordrhyme/
├── apps/
│   ├── server/          # Core backend
│   │   ├── src/
│   │   │   ├── trpc/
│   │   │   │   ├── router.ts        # Dynamic router merging
│   │   │   │   └── routers/
│   │   │   │       ├── user.ts      # Core routes (user.list, user.getCurrent, ...)
│   │   │   │       ├── content.ts   # Core routes (content.create, ...)
│   │   │   │       └── plugin.ts    # Plugin management (plugin.install, ...)
│   │   │   └── plugins/
│   │   │       └── plugin-manager.ts
│   └── admin/           # Frontend
│       └── src/
│           └── hooks/
│               └── use-plugin.ts    # Type-safe plugin client
├── packages/
│   ├── plugin/          # Plugin SDK (tRPC builders)
│   │   ├── src/
│   │   │   ├── trpc.ts              # pluginRouter, pluginProcedure
│   │   │   └── types.ts             # PluginContext
│   │   └── package.json
│   └── core/            # Core API client for plugins
│       ├── src/
│       │   └── index.ts             # createClient(ctx)
│       └── package.json
└── examples/
    └── plugin-analytics/
        ├── src/
        │   └── server/
        │       ├── router.ts        # Plugin router definition (trackEvent, getStats)
        │       └── index.ts         # Export router + hooks
        ├── types.ts                 # Export types for frontend (AnalyticsRouter)
        └── package.json
```

---

**Key Benefits**:

| Aspect | Experience |
|--------|-----------|
| **Plugin Developer** | Define router like normal tRPC project (no learning curve) |
| **Type Safety** | ✅ Full inference (backend → frontend, system API → plugin) |
| **Hot Reload** | ✅ Install/uninstall without restart |
| **System API Access** | ✅ `createClient(ctx)` with full type safety |
| **Frontend Integration** | ✅ `usePluginClient<T>()` with autocomplete |
| **Monorepo Friendly** | ✅ Plugin as workspace package |

**Package Responsibilities**:

| Package | Purpose | Key Export |
|---------|---------|-----------|
| `@wordrhyme/plugin` | Plugin SDK | `pluginRouter`, `pluginProcedure`, `PluginContext` |
| `@wordrhyme/core` | Core API client | `createClient(ctx)`, `CoreRouter` |

---

**Trade-offs**:

| Aspect | Dynamic Router | Unified Gateway |
|--------|---------------|-----------------|
| **Type Safety** | ✅ Full | ❌ None |
| **Hot Reload** | ✅ Yes | ✅ Yes |
| **Complexity** | ⚠️ Medium | ✅ Low |
| **Router Rebuild Cost** | ⚠️ ~5ms per install | N/A |

**Recommendation**: Use Dynamic Router for MVP
- Complexity increase is minimal (~100 lines)
- Type safety prevents runtime errors
- Excellent developer experience
- Easy to maintain and extend

---

**Alternatives Considered**:

1. **Unified Gateway** (rejected: no type safety)
   - Single `trpc.plugin.call` endpoint
   - Manual method invocation
   - No frontend type inference

2. **Static Routes** (rejected: requires restart)
   - Plugins registered at startup only
   - No hot reload capability

3. **Separate tRPC Server** (rejected: over-engineering)
   - Each plugin runs own tRPC server
   - Complex port management
   - Network overhead

---

### Decision 6: Plugin Static Asset Serving

**Choice**: Fastify static file server with dynamic route mapping

**Why**:
- Admin UI Host needs to load plugin `remoteEntry.js` and chunks.
- Server must serve these files from the `/plugins/{pluginId}/dist/admin/` directory.
- Security: Must prevent path traversal (e.g., `../../etc/passwd`).

**Implementation**:
- Route: `/plugins/:pluginId/static/admin/*` (mapped to `/plugins/{pluginId}/dist/admin/*`)
- Resolver: Map `:pluginId` to the validated plugin directory (no symlink escape; no `..` segments; allowlist by scanned manifests).
- Middleware: Cache headers for performance.

---

### Decision 6: Plugin Database Migration Service

**Choice**: Core migrator that scans and executes migrations from plugin subdirectories.

**Why**:
- Plugins may require private tables (`plugin_{id}_*`).
- `onInstall` hook is the standard place to initialize data.
- Core should provide the migrator instance to ensure consistency and logging.

**Implementation**:
- Capability: `dbMigrator` injected into `onInstall`.
- Engine: Drizzle migrations compatible with Core's setup.

---

#### 6.1 Plugin Migration Directory Structure

```text
{pluginId}/
├── manifest.json
├── migrations/
│   ├── 0001_create_events.sql
│   ├── 0002_add_metadata.sql
│   └── 0003_add_indexes.sql
└── dist/
```

**Naming Convention**: `{sequence}_{description}.sql`
- `sequence`: 4-digit zero-padded number (0001, 0002, ...)
- `description`: snake_case description
- Files are executed in lexicographic order

---

#### 6.2 Migration Tracking Table

```typescript
// apps/server/src/db/schema/plugin-migrations.ts
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const pluginMigrations = pgTable('plugin_migrations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pluginId: text('plugin_id').notNull(),
  organizationId: text('organization_id').notNull(),
  migrationFile: text('migration_file').notNull(),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
  checksum: text('checksum').notNull(), // SHA256 of file content
}, (table) => ({
  uniqueMigration: uniqueIndex('unique_plugin_migration')
    .on(table.organizationId, table.pluginId, table.migrationFile),
}));
```

---

#### 6.3 Migration Execution Strategy

```typescript
// apps/server/src/plugins/migration-runner.ts
export class PluginMigrationRunner {
  async runMigrations(pluginId: string, pluginDir: string): Promise<void> {
    const migrationsDir = path.join(pluginDir, 'migrations');
    
    // 1. Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      return; // No migrations for this plugin
    }

    // 2. Scan migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Lexicographic order

    const ctx = getContext();
    const { tenantId } = ctx;

    // 3. Get already applied migrations
    const applied = await db.select()
      .from(pluginMigrations)
      .where(and(
        eq(pluginMigrations.pluginId, pluginId),
        eq(pluginMigrations.organizationId, tenantId)
      ));

    const appliedSet = new Set(applied.map(m => m.migrationFile));

    // 4. Execute pending migrations in transaction
    await db.transaction(async (tx) => {
      for (const file of files) {
        if (appliedSet.has(file)) continue;

        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');

        // Execute SQL
        await tx.execute(sql);

        // Record migration
        await tx.insert(pluginMigrations).values({
          pluginId,
          organizationId: tenantId,
          migrationFile: file,
          checksum,
        });

        console.log(`[Migration] Applied: ${pluginId}/${file}`);
      }
    });
  }
}
```

---

#### 6.4 Rollback Strategy (MVP)

> [!CAUTION]
> MVP 不支持自动回滚。如果迁移失败，整个安装操作回滚，插件保持未安装状态。

**Future (v2.0)**:
- 支持 `down.sql` 对应每个 `up.sql`
- `PluginManager.uninstall()` 执行逆向迁移
- 迁移版本锁定 (防止生产环境意外回滚)

---

### Decision 7: Three-Tier Plugin Integration Strategy (Server + Admin + Web)

**Context**: Plugins must work across three applications while supporting **two modes**:
1. **Local Development Mode**: Plugin as monorepo workspace (hot reload, type checking)
2. **Production Mode**: Plugin as ZIP package (dynamic install, no restart)

**Choice**: Dual-mode plugin resolution with unified manifest

---

#### 7.1 Plugin Directory Structure

**Unified Layout** (supports both modes):

```text
# Production: /plugins/{pluginId}/
# Development: /examples/{pluginId}/ or /plugins-dev/{pluginId}/

{pluginId}/
├── manifest.json          # Unified manifest for all three apps
├── dist/
│   ├── server/
│   │   └── index.js       # tRPC router + lifecycle hooks
│   ├── admin/
│   │   └── remoteEntry.js # Module Federation remote
│   └── web/
│       └── index.js       # Next.js components/pages
├── src/                   # Source (development only)
│   ├── server/
│   ├── admin/
│   └── web/
├── migrations/            # Drizzle migrations
└── package.json           # For development mode
```

**Manifest Schema** (supports all three tiers):

```json
{
  "pluginId": "com.example.analytics",
  "version": "1.0.0",
  "name": "Analytics Plugin",
  "vendor": "Example Inc",

  "server": {
    "entry": "./dist/server/index.js",
    "router": true,
    "hooks": ["onEnable", "onDisable"]
  },

  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "exposes": {
      "./SettingsPage": "./src/admin/pages/SettingsPage",
      "./Widget": "./src/admin/components/Widget"
    }
  },

  "web": {
    "entry": "./dist/web/index.js",
    "routes": [
      { "path": "/analytics", "component": "AnalyticsPage" }
    ],
    "components": ["AnalyticsWidget", "AnalyticsChart"]
  },

  "capabilities": {
    "ui": { "adminPage": true, "webPage": true },
    "data": { "read": true, "write": true }
  }
}
```

---

#### 7.2 Server Integration (tRPC Router)

**Local Development Mode**:

```typescript
// turbo.json
{
  "pipeline": {
    "dev:server": {
      "dependsOn": ["^build"],
      "env": ["PLUGIN_MODE=development"]
    }
  }
}

// apps/server/src/plugins/plugin-loader.ts
export class PluginLoader {
  async loadPlugins() {
    const mode = process.env.PLUGIN_MODE || 'production';

    if (mode === 'development') {
      // Local: Load from monorepo workspace
      return this.loadFromWorkspace();
    } else {
      // Production: Load from /plugins directory
      return this.loadFromPluginsDir();
    }
  }

  private async loadFromWorkspace() {
    // Scan examples/ or plugins-dev/
    const workspacePlugins = await glob('examples/plugin-*');

    for (const pluginPath of workspacePlugins) {
      const manifest = await this.loadManifest(pluginPath);
      const module = await import(resolve(pluginPath, manifest.server.entry));

      // Register router (hot reload via Vite/tsup watch)
      if (module.router) {
        registerPluginRouter(manifest.pluginId, module.router);
      }
    }
  }

  private async loadFromPluginsDir() {
    // Production: Load from /plugins
    const installedPlugins = await glob('/plugins/*');

    for (const pluginPath of installedPlugins) {
      const manifest = await this.loadManifest(pluginPath);
      const module = await import(resolve(pluginPath, manifest.server.entry) + '?t=' + Date.now());

      if (module.router) {
        registerPluginRouter(manifest.pluginId, module.router);
      }
    }
  }
}
```

**Production Mode** (unchanged): Dynamic `import()` with cache busting

---

#### 7.3 Admin Integration (Module Federation 2.0)

**Local Development Mode**:

```typescript
// apps/admin/rspack.config.ts
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

export default {
  plugins: [
    new ModuleFederationPlugin({
      name: 'admin',

      // Dynamic remotes (resolved at runtime)
      remotes: process.env.NODE_ENV === 'development'
        ? {
            // Local dev: Load from workspace (Rspack dev server)
            'plugin-analytics': 'plugin-analytics@http://localhost:3001/remoteEntry.js',
          }
        : {
            // Production: Load from server's static file serving
            // Resolved via API: /api/plugins/{id}/info → remoteEntryUrl
          }
    })
  ]
}

// apps/admin/src/plugins/plugin-registry.tsx
export function PluginRegistry() {
  const { data: plugins } = trpc.plugin.list.useQuery();

  return (
    <>
      {plugins.map(plugin => (
        <RemoteComponent
          key={plugin.pluginId}
          remoteUrl={plugin.admin.remoteEntryUrl}
          module="./SettingsPage"
        />
      ))}
    </>
  );
}
```

**Local Development**: Each plugin runs its own Rspack dev server (port 3001, 3002, etc.)

**Production Mode**: Server serves `/plugins/{id}/static/admin/remoteEntry.js`

---

#### 7.4 Web Integration (Next.js + Module Federation 2.0)

**Next.js Configuration** (Pages Router + MF2.0):

```typescript
// apps/web/next.config.js
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');
const path = require('path');

module.exports = {
  webpack: (config, options) => {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'web',
        remotes: {}, // Runtime dynamic registration
        filename: 'static/chunks/remoteEntry.js',

        // ✅ Next.js Presets (automatic shared dependencies)
        extraOptions: {
          exposePages: true,  // Auto-expose all pages
          enableImageLoaderFix: true,
          enableUrlLoaderFix: true,
          skipSharingNextInternals: false,  // Auto-share Next.js internals
        },

        shared: {
          react: {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          },
          'react-dom': {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          }
        }
      })
    );

    // Development mode: serve /plugins directory
    if (options.dev) {
      config.devServer = {
        ...config.devServer,
        static: [
          ...(config.devServer?.static || []),
          {
            directory: path.resolve(__dirname, '../../plugins'),
            publicPath: '/plugins',
          }
        ]
      };
    }

    return config;
  },

  // ✅ Required: use local webpack
  env: {
    NEXT_PRIVATE_LOCAL_WEBPACK: 'true',
  }
}
```

**Plugin Page Component** (Runtime Dynamic Loading):

```typescript
// pages/plugins/[...slug].tsx
import React from 'react';
import { loadRemote } from '@module-federation/nextjs-mf/utils';
import { registerRemotes } from '@module-federation/enhanced/runtime';

export default function PluginPage({ pluginId, componentName }) {
  const [Component, setComponent] = React.useState(null);

  React.useEffect(() => {
    // 1. Register plugin remote
    registerRemotes([
      {
        name: pluginId,
        entry: `/plugins/${pluginId}/dist/web/remoteEntry.js`,
        alias: pluginId,
      }
    ], { force: true });

    // 2. Load component
    loadRemote(`${pluginId}/${componentName}`)
      .then(module => setComponent(() => module.default))
      .catch(console.error);
  }, [pluginId, componentName]);

  if (!Component) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component />
    </React.Suspense>
  );
}

// SSR: Get plugin info from server
export async function getServerSideProps(context) {
  const [pluginId, ...rest] = context.params.slug;

  // Resolve component name from path
  const componentName = rest.join('/') || 'Page';

  return {
    props: {
      pluginId,
      componentName,
    }
  };
}
```

**Development Mode**:
- Plugins run their own Rspack dev server (port 4001, 4002, etc.)
- OR plugins build to `/plugins/{id}/dist/web` and served by Next.js dev server

**Production Mode**:
- Plugins served from `/plugins/{id}/dist/web/remoteEntry.js`
- SSR support via `getServerSideProps`

**Note**: Next.js App Router is **not supported** by Module Federation. Web app uses **Pages Router** for plugin pages.

---

#### 7.5 Plugin Development Workflow

**Step 1: Create Plugin in Workspace**

```bash
# Developer creates plugin in examples/
pnpm create-wordrhyme-plugin examples/plugin-analytics

# Result:
examples/plugin-analytics/
├── package.json         # name: "@plugins/analytics"
├── manifest.json
├── src/
│   ├── server/
│   │   └── router.ts    # tRPC router
│   ├── admin/
│   │   ├── pages/
│   │   └── rspack.config.ts
│   └── web/
│       └── components/
└── tsconfig.json
```

**Step 2: Local Development**

```bash
# Start all apps + plugin in dev mode
pnpm turbo dev

# Turborepo starts:
# - apps/server (port 3000) - loads examples/plugin-analytics via workspace
# - apps/admin (port 3001)  - MF2 remote from plugin's dev server
# - apps/web (port 3002)    - transpiles @plugins/analytics
# - examples/plugin-analytics (port 4001) - Rspack dev server for admin UI
```

**Step 3: Build for Production**

```bash
# Build plugin as ZIP
cd examples/plugin-analytics
pnpm build  # Outputs to dist/

# Package
pnpm pack-plugin  # Creates plugin-analytics-1.0.0.zip

# Upload to admin
# Admin → Plugins → Upload → plugin-analytics-1.0.0.zip
```

**Step 4: Production Install**

```bash
# User uploads ZIP via admin UI
# Server:
# 1. Extract to /plugins/com.example.analytics/
# 2. Validate manifest
# 3. Load server router (registerPluginRouter)
# 4. Serve admin remoteEntry.js at /plugins/{id}/static/admin/
# 5. Serve web components at /plugins/{id}/static/web/
```

---

#### 7.6 Type Safety Across Modes

**Development Mode** (full type safety):

```typescript
// apps/admin/src/pages/Dashboard.tsx
import type { AnalyticsRouter } from '@plugins/analytics'; // ✅ Workspace import

const client = usePluginClient<AnalyticsRouter>('com.example.analytics');
client.trackEvent.mutate({ event: 'click' }); // ✅ Full autocomplete
```

**Production Mode** (runtime types):

```typescript
// apps/admin/src/pages/Dashboard.tsx
const client = usePluginClient('com.example.analytics'); // ⚠️ No compile-time types
client.trackEvent.mutate({ event: 'click' }); // ⚠️ Runtime validation only
```

---

#### 7.7 Comparison: Development vs Production

| Aspect | Development Mode | Production Mode |
|--------|-----------------|-----------------|
| **Plugin Location** | `examples/` or `plugins-dev/` (⚠️ deprecated) OR `/plugins/` | `/plugins/` |
| **Package** | Workspace package OR source in `/plugins/` | ZIP file extracted to `/plugins/` |
| **Hot Reload** | ✅ tsx/Rspack/Next.js HMR | ⚠️ Requires server restart (MVP) |
| **Type Safety** | ✅ Full TypeScript (workspace packages) | ⚠️ Runtime only |
| **Build** | Watch mode (tsx/tsup/rspack) | Pre-built dist/ |
| **Server Router** | Direct import from src/ (tsx) | Dynamic import from dist/ + cache bust |
| **Admin UI** | MF2 from plugin dev server OR dist/ | MF2 from `/plugins/{id}/static/admin/` |
| **Web UI** | MF2 from plugin dev server OR dist/ | MF2 from `/plugins/{id}/dist/web/` |
| **Installation** | Git clone + `pnpm install` OR copy to `/plugins/` | Upload ZIP via admin |

---

#### 7.8 Key Benefits

1. **DX**: Developers work in monorepo with full tooling
2. **Type Safety**: Development mode has full TypeScript inference
3. **Hot Reload**: All three apps reload on plugin changes (dev mode)
4. **Production Ready**: Same plugin works in production without changes
5. **Unified Manifest**: Single source of truth for all three tiers

---

**Alternatives Considered**:

1. **Always use /plugins** (rejected: poor local DX, no hot reload)
2. **Separate dev and prod plugins** (rejected: duplicates code, drift risk)
3. **Only workspace mode** (rejected: can't support dynamic install)
4. **Symbolic links in /plugins** (rejected: complex, breaks in containers)

---

### Decision 8: Plugin Database Access Strategy

**Context**: Plugins using tRPC need to access databases for storing their private data, but direct database access violates isolation principles.

**Choice**: Inject database capability through PluginContext (Capability-based model)

---

#### 8.1 Architecture Design

**PluginContext Extension**:

```typescript
// @wordrhyme/plugin/src/index.ts
export interface PluginContext {
  pluginId: string;
  tenantId?: string;
  userId?: string;
  logger: PluginLogger;

  // ✅ Database capability injection
  db: PluginDatabaseCapability;
}

export interface PluginDatabaseCapability {
  /**
   * Query plugin private table
   * Automatically adds pluginId and tenantId filters
   *
   * @param options.table - Short table name (e.g., 'events')
   *                        Maps to: plugin_{pluginId}_{table}
   */
  query<T>(options: {
    table: string;
    where?: Record<string, any>;
    limit?: number;
    offset?: number;
  }): Promise<T[]>;

  /**
   * Insert data into plugin private table
   */
  insert<T>(options: {
    table: string;
    data: T | T[];
  }): Promise<void>;

  /**
   * Update plugin private table
   */
  update<T>(options: {
    table: string;
    where: Record<string, any>;
    data: Partial<T>;
  }): Promise<void>;

  /**
   * Delete from plugin private table
   */
  delete(options: {
    table: string;
    where: Record<string, any>;
  }): Promise<void>;

  /**
   * Execute raw SQL (advanced, requires permission)
   */
  raw<T>(sql: string, params?: any[]): Promise<T>;

  /**
   * Transaction support
   */
  transaction<T>(callback: (tx: PluginDatabaseCapability) => Promise<T>): Promise<T>;
}
```

---

#### 8.2 Plugin Usage Example

```typescript
// /plugins/plugin-analytics/src/server/router.ts
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin';
import { z } from 'zod';

export const router = pluginRouter({
  // Query events
  getEvents: pluginProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
    }))
    .query(async ({ input, ctx }) => {
      // ✅ Access database via ctx.db
      const events = await ctx.db.query({
        table: 'events',  // Maps to: plugin_com_example_analytics_events
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      });

      return events;
    }),

  // Track event
  trackEvent: pluginProcedure
    .input(z.object({
      event: z.string(),
      page: z.string(),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // ✅ Insert data
      await ctx.db.insert({
        table: 'events',
        data: {
          event: input.event,
          page: input.page,
          metadata: input.metadata,
          timestamp: new Date(),
        }
      });

      return { success: true };
    }),

  // Generate report with transaction
  generateReport: pluginProcedure
    .mutation(async ({ ctx }) => {
      // ✅ Transaction support
      const result = await ctx.db.transaction(async (tx) => {
        const events = await tx.query({ table: 'events' });
        const stats = calculateStats(events);

        await tx.insert({
          table: 'reports',
          data: { stats, generatedAt: new Date() }
        });

        return stats;
      });

      return result;
    }),
});
```

---

#### 8.3 Core Implementation

```typescript
// apps/server/src/plugins/capabilities/database.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';

export class DatabaseCapabilityProvider {
  constructor(
    private db: ReturnType<typeof drizzle>,
    private pluginId: string,
    private tenantId: string
  ) {}

  create(): PluginDatabaseCapability {
    return {
      query: async (options) => {
        // 1. Table name mapping: events → plugin_com_example_analytics_events
        const tableName = this.mapTableName(options.table);

        // 2. Auto-add filters (multi-tenant isolation)
        const where = {
          ...options.where,
          pluginId: this.pluginId,
          tenantId: this.tenantId,
        };

        // 3. Execute query
        return this.db
          .select()
          .from(tableName)
          .where(this.buildWhere(where))
          .limit(options.limit)
          .offset(options.offset);
      },

      insert: async (options) => {
        const tableName = this.mapTableName(options.table);

        // Auto-add pluginId and tenantId
        const data = Array.isArray(options.data)
          ? options.data.map(d => this.addMetadata(d))
          : this.addMetadata(options.data);

        await this.db.insert(tableName).values(data);
      },

      update: async (options) => {
        const tableName = this.mapTableName(options.table);
        const where = this.addMetadata(options.where);

        await this.db
          .update(tableName)
          .set(options.data)
          .where(this.buildWhere(where));
      },

      delete: async (options) => {
        const tableName = this.mapTableName(options.table);
        const where = this.addMetadata(options.where);

        await this.db
          .delete(tableName)
          .where(this.buildWhere(where));
      },

      raw: async (sql, params) => {
        // ⚠️ Requires permission check
        if (!this.hasRawSQLPermission()) {
          throw new Error('Plugin does not have raw SQL permission');
        }
        return this.db.execute(sql, params);
      },

      transaction: async (callback) => {
        return this.db.transaction(async (tx) => {
          const txCapability = new DatabaseCapabilityProvider(
            tx,
            this.pluginId,
            this.tenantId
          ).create();

          return callback(txCapability);
        });
      },
    };
  }

  /**
   * Table name mapping: events → plugin_com_example_analytics_events
   */
  private mapTableName(shortName: string): string {
    const safePluginId = this.pluginId.replace(/\./g, '_');
    return `plugin_${safePluginId}_${shortName}`;
  }

  /**
   * Auto-add metadata (multi-tenant isolation)
   */
  private addMetadata(data: any): any {
    return {
      ...data,
      pluginId: this.pluginId,
      tenantId: this.tenantId,
    };
  }

  private buildWhere(conditions: Record<string, any>) {
    return and(
      ...Object.entries(conditions).map(([key, value]) => eq(key, value))
    );
  }

  private hasRawSQLPermission(): boolean {
    // TODO: Check plugin manifest for raw SQL permission
    return false; // Disabled in MVP
  }
}
```

---

#### 8.4 Security Benefits

| Security Feature | Implementation |
|------------------|----------------|
| **Multi-tenant Isolation** | ✅ Auto-inject `tenantId` filter in all queries |
| **Plugin Isolation** | ✅ Auto-inject `pluginId` filter (prevents cross-plugin access) |
| **Table Namespace** | ✅ Force table prefix: `plugin_{pluginId}_*` |
| **Query Monitoring** | ✅ All queries go through capability layer (auditable) |
| **Permission Control** | ✅ Raw SQL requires explicit permission |

---

**Alternatives Considered**:

1. **Direct Drizzle Access** (rejected: no isolation, security risk)
2. **Core API Proxy** (rejected: extra network overhead, complex)
3. **ORM Wrapper** (rejected: limits flexibility, high learning curve)

---

#### 8.5 Unified Database Access: Application-Level Scoped Drizzle

> [!IMPORTANT]
> Core 和 Plugin 使用 **统一的 Scoped Drizzle** 模式，自动注入租户过滤，同时保持完整的 Drizzle 类型安全。

**架构概览**:

```
┌─────────────────────────────────────────────────────────┐
│  Request → ALS Middleware → 存储 tenantId to ALS       │
├─────────────────────────────────────────────────────────┤
│  Core / Plugin Code                                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │ const db = getScopedDb();  // 从 ALS 读取租户    │    │
│  │ await db.select().from(posts);  // 完整 Drizzle │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  Scoped Drizzle Wrapper                                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 自动添加 WHERE tenant_id = ? 到所有查询          │    │
│  │ 自动注入 tenant_id 到所有 INSERT                 │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

#### 8.5.1 Scoped Drizzle Factory

```typescript
// apps/server/src/db/scoped-db.ts
import { getContext } from '../context/async-local-storage';
import { db } from './index';
import { eq, and, SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

type TenantTable = PgTable & { tenantId: any };

/**
 * 创建带有自动租户过滤的 Scoped Drizzle 实例
 * 
 * Core 和 Plugin 都使用此方法，获得统一的开发体验
 */
export function getScopedDb() {
  const ctx = getContext();
  const tenantId = ctx.tenantId;

  return {
    /**
     * SELECT - 自动添加 tenant_id 过滤
     */
    select: <T extends Record<string, any>>(fields?: T) => ({
      from: <TTable extends TenantTable>(table: TTable) => {
        const baseQuery = fields 
          ? db.select(fields).from(table)
          : db.select().from(table);
        
        // 自动添加租户过滤
        return baseQuery.where(eq(table.tenantId, tenantId));
      },
    }),

    /**
     * INSERT - 自动注入 tenant_id
     */
    insert: <TTable extends TenantTable>(table: TTable) => ({
      values: <TData extends Record<string, any>>(data: TData | TData[]) => {
        const enrichedData = Array.isArray(data)
          ? data.map(d => ({ ...d, tenantId }))
          : { ...data, tenantId };
        
        return db.insert(table).values(enrichedData as any);
      },
    }),

    /**
     * UPDATE - 自动添加 tenant_id 条件
     */
    update: <TTable extends TenantTable>(table: TTable) => ({
      set: <TData extends Record<string, any>>(data: TData) => ({
        where: (condition: SQL) => 
          db.update(table)
            .set(data as any)
            .where(and(eq(table.tenantId, tenantId), condition)),
      }),
    }),

    /**
     * DELETE - 自动添加 tenant_id 条件
     */
    delete: <TTable extends TenantTable>(table: TTable) => ({
      where: (condition: SQL) => 
        db.delete(table)
          .where(and(eq(table.tenantId, tenantId), condition)),
    }),

    /**
     * 事务 - 内部使用 scoped db
     */
    transaction: db.transaction,

    /**
     * 原始 db 访问 (仅限 Core 内部使用，需谨慎)
     */
    $raw: db,
  };
}

export type ScopedDb = ReturnType<typeof getScopedDb>;
```

---

#### 8.5.2 使用示例

**Core 代码**:

```typescript
// apps/server/src/trpc/routers/content.ts
import { getScopedDb } from '../../db/scoped-db';
import { posts } from '../../db/schema';

export const contentRouter = router({
  list: publicProcedure.query(async () => {
    const db = getScopedDb();
    
    // ✅ 自动过滤当前租户，完整类型安全
    return db.select().from(posts);
  }),

  create: publicProcedure
    .input(z.object({ title: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      const db = getScopedDb();
      
      // ✅ 自动注入 tenantId
      return db.insert(posts).values({
        title: input.title,
        content: input.content,
        // tenantId 自动注入，无需手动添加
      });
    }),
});
```

**Plugin 代码**:

```typescript
// plugins/plugin-analytics/src/server/router.ts
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin';
import { analyticsEvents } from './schema';  // Plugin 自定义表

export const router = pluginRouter({
  trackEvent: pluginProcedure
    .input(z.object({ event: z.string(), page: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // ✅ ctx.db 就是 getScopedDb() 的结果
      // ✅ 完整 Drizzle 体验，完整类型安全
      await ctx.db.insert(analyticsEvents).values({
        event: input.event,
        page: input.page,
        // tenantId 自动注入
      });

      return { success: true };
    }),

  getEvents: pluginProcedure.query(async ({ ctx }) => {
    // ✅ 自动过滤租户
    return ctx.db.select().from(analyticsEvents);
  }),
});
```

---

#### 8.5.3 Plugin 表定义

```typescript
// plugins/plugin-analytics/src/server/schema.ts
import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';

// Plugin 表必须包含 tenantId 和 pluginId
export const analyticsEvents = pgTable('plugin_analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),  // 必需：租户隔离
  pluginId: text('plugin_id').notNull(),  // 必需：插件隔离
  event: text('event').notNull(),
  page: text('page').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

#### 8.5.4 方案优势

| 方面 | 效果 |
|------|------|
| **Core 开发体验** | ✅ 自动租户过滤 + 完整 Drizzle |
| **Plugin 开发体验** | ✅ 自动租户过滤 + 完整 Drizzle |
| **类型安全** | ✅ 编译时类型检查 |
| **数据库兼容性** | ✅ 不依赖 PostgreSQL RLS |
| **隔离保证** | ⚠️ 应用层 (可升级到 RLS) |
| **审计能力** | ✅ 所有查询经过 wrapper |

**Future Enhancement (v2.0)**:

如果需要更强的数据库层隔离，可以在 Scoped Drizzle 基础上叠加 PostgreSQL RLS，无需修改业务代码。

---

### Decision 9: Module Federation Version Management

**Context**: Plugins may use different versions of shared dependencies (React, React Router, etc.), causing runtime conflicts.

**Choice**: Singleton + Version Range + Runtime Warning + Manifest Declaration

---

#### 9.1 Version Management Strategy

**Host Configuration** (Lenient Policy):

```typescript
// apps/admin/rspack.config.ts
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

export default {
  plugins: [
    new ModuleFederationPlugin({
      name: 'admin',

      shared: {
        react: {
          singleton: true,              // ✅ Force singleton (only one React instance)
          strictVersion: false,         // ✅ Allow minor version differences
          requiredVersion: '^18.0.0',   // ✅ Support 18.x
          version: '18.3.1',            // Host version
        },
        'react-dom': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^18.0.0',
        },
        '@tanstack/react-router': {
          singleton: true,
          strictVersion: true,          // ⚠️ Router requires strict version
          requiredVersion: '^1.0.0',
        },
        'lucide-react': {
          singleton: false,             // Icons can have multiple versions
        }
      }
    })
  ]
}

// apps/web/next.config.js (similar configuration)
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

module.exports = {
  webpack: (config) => {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'web',
        shared: {
          react: {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          },
          'react-dom': {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          }
        },
        extraOptions: {
          exposePages: true,  // Next.js Presets
          skipSharingNextInternals: false,
        }
      })
    );
    return config;
  },

  env: {
    NEXT_PRIVATE_LOCAL_WEBPACK: 'true',
  }
}
```

---

#### 9.2 Plugin Manifest Declaration

```json
// /plugins/plugin-analytics/manifest.json
{
  "pluginId": "com.example.analytics",
  "version": "1.0.0",

  "engines": {
    "wordrhyme": "^0.1.0",
    "node": ">=18.0.0"
  },

  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@tanstack/react-router": "^1.0.0"
  },

  "compatibilityMode": "lenient"  // strict | lenient | fallback
}
```

---

#### 9.3 Runtime Version Checker

```typescript
// apps/admin/src/plugins/version-checker.ts
import { registerRemotes } from '@module-federation/enhanced/runtime';
import React from 'react';
import semver from 'semver';

export async function loadPluginWithVersionCheck(
  pluginId: string,
  remoteUrl: string,
  manifest: PluginManifest
) {
  const hostReactVersion = React.version; // e.g., "18.3.1"
  const requiredReactVersion = manifest.peerDependencies?.react;

  // 1. Version compatibility check
  if (requiredReactVersion && !semver.satisfies(hostReactVersion, requiredReactVersion)) {
    console.warn(
      `[Plugin ${pluginId}] React version mismatch:`,
      `Plugin requires ${requiredReactVersion}, Host provides ${hostReactVersion}`
    );

    // 2. Check compatibility mode
    if (manifest.compatibilityMode === 'strict') {
      throw new Error(
        `Cannot load plugin ${pluginId}: React version incompatible ` +
        `(required ${requiredReactVersion}, host ${hostReactVersion})`
      );
    }

    // 3. Show warning in UI
    showVersionWarning({
      pluginId,
      dependency: 'React',
      required: requiredReactVersion,
      host: hostReactVersion,
      severity: getMajorVersionDiff(requiredReactVersion, hostReactVersion) > 0 ? 'error' : 'warning',
    });
  }

  // 4. Register plugin
  registerRemotes([
    { name: pluginId, entry: remoteUrl, alias: pluginId }
  ], { force: true });
}

function getMajorVersionDiff(required: string, host: string): number {
  const requiredMajor = semver.major(semver.coerce(required) || '0.0.0');
  const hostMajor = semver.major(host);
  return Math.abs(requiredMajor - hostMajor);
}
```

---

#### 9.4 UI Warning Display

```typescript
// apps/admin/src/pages/PluginSettings.tsx
import { Alert, AlertCircle, AlertTitle, AlertDescription } from '@/components/ui/alert';

export function PluginSettings() {
  const { data: plugins } = trpc.plugin.list.useQuery();

  return (
    <div className="space-y-4">
      {plugins.map(plugin => (
        <Card key={plugin.pluginId}>
          <CardHeader>
            <CardTitle>{plugin.name}</CardTitle>
          </CardHeader>

          <CardContent>
            {/* ⚠️ Version compatibility warning */}
            {plugin.versionWarnings?.map(warning => (
              <Alert
                key={warning.dependency}
                variant={warning.severity === 'error' ? 'destructive' : 'warning'}
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>版本兼容性{warning.severity === 'error' ? '错误' : '警告'}</AlertTitle>
                <AlertDescription>
                  此插件需要 {warning.dependency} {warning.required}，
                  当前系统使用 {warning.host}。
                  {warning.severity === 'error' ? (
                    <><br />插件无法加载，请联系开发者更新插件。</>
                  ) : (
                    <><br />插件可能无法正常工作，建议联系开发者升级。</>
                  )}
                </AlertDescription>
              </Alert>
            ))}

            <Button
              onClick={() => enablePlugin(plugin.pluginId)}
              disabled={plugin.versionWarnings?.some(w => w.severity === 'error')}
            >
              {plugin.enabled ? '禁用插件' : '启用插件'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

#### 9.5 Plugin Upgrade Strategy

**Scenario 1: Major Version Upgrade (React 18 → 19)**

```
When system upgrades to React 19:

✅ Plugin A (React ^18.0.0 || ^19.0.0) → Compatible
⚠️ Plugin B (React ^18.0.0, lenient mode) → Warning (continues to work)
❌ Plugin C (React ^17.0.0) → Refused to load (incompatible)
```

**Scenario 2: Plugin Developer Delayed Upgrade**

```json
// Plugin manifest (still declares React 18)
{
  "peerDependencies": {
    "react": "^18.0.0"
  },
  "compatibilityMode": "lenient"  // ✅ Allow loading in React 19 environment
}
```

**Runtime Handling**:
```typescript
if (hostReactVersion.major === 19 && pluginRequires.major === 18) {
  if (manifest.compatibilityMode === 'lenient') {
    console.warn(`Loading plugin with React 18 declaration in React 19 environment`);
    // ✅ Allow loading (uses Host's React 19)
  }
}
```

---

#### 9.6 Core Validation on Install

```typescript
// apps/server/src/plugins/validator.ts
export class PluginValidator {
  validateDependencies(manifest: PluginManifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check React version
    const requiredReact = manifest.peerDependencies?.react;
    const hostReact = this.getHostReactVersion();

    if (requiredReact && !semver.satisfies(hostReact, requiredReact)) {
      const majorDiff = getMajorVersionDiff(requiredReact, hostReact);

      if (majorDiff > 0) {
        // Major version mismatch
        if (manifest.compatibilityMode === 'strict') {
          errors.push(
            `React major version incompatible: Plugin requires ${requiredReact}, Host ${hostReact}`
          );
        } else {
          warnings.push(
            `React major version mismatch (lenient mode): Plugin ${requiredReact}, Host ${hostReact}`
          );
        }
      } else {
        // Minor version difference
        warnings.push(
          `React minor version difference: Plugin ${requiredReact}, Host ${hostReact}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      canLoadWithWarnings: manifest.compatibilityMode === 'lenient' && errors.length === 0,
      errors,
      warnings,
    };
  }

  private getHostReactVersion(): string {
    // Read from package.json or runtime detection
    return '18.3.1';
  }
}
```

---

#### 9.7 Best Practices for Plugin Developers

**Dependency Declaration**:

```json
{
  "peerDependencies": {
    "react": "^18.0.0",           // ✅ Use semver range
    "react-dom": "^18.0.0",
    "@tanstack/react-router": "^1.0.0"
  },
  "compatibilityMode": "lenient"  // ✅ Recommended for most plugins
}
```

**DO**:
- ✅ Use semver ranges (`^18.0.0`)
- ✅ Set `compatibilityMode: "lenient"`
- ✅ Keep dependencies up to date
- ✅ Test with multiple React versions

**DON'T**:
- ❌ Pin exact versions (`18.3.1`)
- ❌ Use outdated major versions (`^17.0.0`)
- ❌ Bundle React in plugin output
- ❌ Use `compatibilityMode: "strict"` unless necessary

---

**Alternatives Considered**:

1. **Strict Version Matching** (rejected: breaks plugins frequently)
2. **Multiple React Instances** (rejected: causes DOM conflicts)
3. **Version Fallback** (rejected: too complex, unpredictable behavior)
4. **No Version Check** (rejected: runtime errors, poor UX)

---

---

### Decision 11: Cross-Plugin Permission Dependencies (Forbidden)

**Choice**: Plugins CANNOT depend on permissions defined by other plugins

**Why**:
- **Isolation**: Plugins must remain independent (per `PLUGIN_CONTRACT.md`)
- **Lifecycle**: Plugin A cannot assume Plugin B is installed/enabled
- **Security**: Prevents permission escalation via plugin chaining
- **Marketplace**: Plugin dependencies complicate marketplace economics

**Rules**:
- ❌ Plugin A manifest CANNOT declare `requiredPermissions: ['plugin:B:*']`
- ❌ Plugin A code CANNOT check `ctx.permissions.can('plugin:seo:settings.read')`
- ✅ Plugin A CAN depend on Core permissions: `content:read:space`
- ✅ Future: Plugins coordinate via Core-mediated Events (not MVP)

**Validation**:
```typescript
// apps/server/src/plugins/manifest-validator.ts
function validatePluginManifest(manifest: PluginManifest): void {
  if (manifest.permissions?.required) {
    for (const perm of manifest.permissions.required) {
      // 禁止依赖其他插件的权限
      if (perm.startsWith('plugin:') && !perm.startsWith(`plugin:${manifest.pluginId}:`)) {
        throw new Error(
          `Plugin ${manifest.pluginId} cannot depend on other plugin permissions: ${perm}. ` +
          `Use Core-mediated events for plugin coordination (future feature).`
        );
      }
    }
  }
}
```

**Alternatives Considered**:
- Plugin permission delegation (rejected: creates transitive trust chains)
- Plugin-to-plugin RPC (rejected: breaks isolation model)
- Shared permission namespaces (rejected: violates white-list model)

**Future Evolution (v2.0+)**:
When plugins need to coordinate:
1. Plugin A emits Core event: `core.events.emit('seo.analyzed', data)`
2. Core validates: Plugin A has `events:emit:seo.analyzed`
3. Core broadcasts to subscribers (including Plugin B)
4. Plugin B receives via: `core.events.on('seo.analyzed', handler)`
5. Plugin B validates its own permissions before acting

---

### Decision 10: Permission Scope Hierarchy

**Choice**: Align with frozen scope hierarchy: `instance → organization → space → project` (PERMISSION_GOVERNANCE.md)

**Why**:
- Contract specifies `instance → organization → space → project` (PERMISSION_GOVERNANCE.md)
- MVP only needs organization-level isolation (space/project can default to null)
- We still keep `tenantId` as the multi-tenant isolation key; for MVP terminology mapping: `tenantId ≈ organizationId`, `workspaceId ≈ spaceId`

**Implementation**:
```ts
interface PermissionScope {
  tenantId: string; // organizationId in PERMISSION_GOVERNANCE.md terms
  spaceId?: string; // nullable in MVP (stored as workspaceId in DB for now)
  projectId?: string; // nullable in MVP
}

can(user, capability, scope: PermissionScope): boolean
```

**Alternatives Considered**:
- Flat tenant-only model (rejected: requires schema migration later)
- Full hierarchy enforcement (rejected: overkill for MVP, no UX for workspace management)

---

### Decision 9: Rolling Reload Trigger Mechanism

**Choice**: Redis Pub/Sub with `RELOAD_APP` channel, PM2 graceful reload

**Why**:
- Redis already required for cluster coordination
- Pub/Sub is simple, reliable, low-latency
- PM2 built-in graceful reload (no custom process management)
- Aligns with `CORE_BOOTSTRAP_FLOW.md` reload model: a reload re-runs Core-controlled phases after a graceful drain; implementation may be in-process (single node) or process replacement (cluster), but MUST preserve external consistency

**Flow**:
1. Plugin install API → Update DB → Publish `RELOAD_APP` to Redis
2. All server nodes subscribe to `RELOAD_APP`
3. On message → Trigger graceful reload:
   - **Cluster mode (PM2)**: `pm2 reload <app-name>` (rolling process replacement; requests drained)
   - **Single-node dev mode**: in-process “reload” that re-runs Phase 2→7 without exiting (optional)
4. Kernel transitions `running → reloading → running` and logs phase execution

**Alternatives Considered**:
- Webhook-based (rejected: requires HTTP polling or webhooks, more complex)
- File-watch based (rejected: unreliable in distributed systems)
- Manual restart (rejected: violates zero-downtime requirement)

---

### Decision 10: Context Resolution Strategy

**Choice**: Async Local Storage (ALS) for request-scoped context

**Why**:
- Node.js native (no dependencies)
- Automatically propagates through async calls
- Avoids passing `ctx` parameter everywhere

**Implementation**:
```ts
// In Fastify middleware
asyncLocalStorage.run(context, async () => {
  await next();
});

// Anywhere in request lifecycle
const ctx = asyncLocalStorage.getStore();
console.log(ctx.tenantId, ctx.userId);
```

**Alternatives Considered**:
- Manual context passing (rejected: too verbose, error-prone)
- Thread-local (rejected: Node.js is single-threaded)
- Request object mutation (rejected: less type-safe)

---

### Decision 11: Admin UI State Management

**Choice**: No global state library for MVP (React Context + local state only)

**Why**:
- MVP scope is small (plugin list, settings UI)
- Global state adds complexity without clear benefit
- Can defer to post-MVP when UX patterns emerge

**Alternatives Considered**:
- Redux (rejected: overkill for MVP)
- Zustand (rejected: adding dependency prematurely)
- TanStack Query (considered for later: API state management)

---

### Decision 12: Frontend-Backend Communication (tRPC)

**Choice**: tRPC for type-safe API communication between Admin UI and Server

**Why**:
- End-to-end type safety (TypeScript types shared across client/server)
- No code generation required (unlike GraphQL or OpenAPI)
- Excellent DX (auto-completion, compile-time errors)
- Perfect fit for monorepo structure (shared types in workspace)
- Reduces boilerplate compared to REST

**Implementation**:
```ts
// Server: Define tRPC router
export const appRouter = router({
  plugin: {
    list: publicProcedure.query(() => getPlugins()),
    // In Node.js, file upload is handled via a dedicated multipart endpoint.
    // tRPC triggers install by reference (e.g., an uploadId or a local path in dev).
    install: publicProcedure
      .input(z.object({ uploadId: z.string().min(1) }))
      .mutation(({ input }) => installPluginFromUpload(input.uploadId)),
  },
});

// Client: Type-safe calls
const plugins = await trpc.plugin.list.query();
await trpc.plugin.install.mutate({ uploadId });
```

**Alternatives Considered**:
- REST API (rejected: no type safety, manual validation)
- GraphQL (rejected: overkill for MVP, adds complexity)
- gRPC (rejected: not web-native, requires code generation)

---

### Decision 13: Data Validation (Zod + Drizzle Integration)

**Choice**: Zod for runtime validation + `drizzle-zod` for automatic schema generation from database models

**Why**:
- Integrates seamlessly with tRPC (tRPC uses Zod schemas)
- **Single source of truth**: Drizzle schema → Auto-generated Zod schemas
- No manual duplication (database schema defines both DB structure and validation)
- Plugin manifest validation (custom Zod schema, not from DB)
- Environment variable validation

**Implementation**:
```ts
// Database models: Drizzle → Zod (auto-generated)
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { plugins } from './schema';

export const insertPluginSchema = createInsertSchema(plugins);
export const selectPluginSchema = createSelectSchema(plugins);
export type InsertPlugin = z.infer<typeof insertPluginSchema>;
export type SelectPlugin = z.infer<typeof selectPluginSchema>;

// Plugin manifest: Custom Zod schema (not from DB)
export const pluginManifestSchema = z.object({
  pluginId: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  vendor: z.string().min(1),
  type: z.enum(['extension', 'integration', 'feature']),
  runtime: z.enum(['node', 'edge', 'wasm']),
  engines: z.object({
    wordrhyme: z.string(),
  }),
  permissions: z
    .object({
      scope: z.enum(['instance', 'organization', 'space', 'project']),
      definitions: z.array(
        z.object({
          key: z.string().min(1),
          description: z.string().min(1),
        }),
      ),
    })
    .optional(),
  capabilities: z.object({
    ui: z.object({
      adminPage: z.boolean().optional(),
    }).optional(),
  }),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

// tRPC: Use generated schemas
export const pluginRouter = router({
  list: publicProcedure.query(() =>
    db.select().from(plugins)
  ),
  install: publicProcedure
    .input(z.object({
      file: z.instanceof(File),
      manifest: pluginManifestSchema // Custom validation
    }))
    .mutation(({ input }) => {
      // Validate and insert using auto-generated schema
      return db.insert(plugins).values(insertPluginSchema.parse({
        pluginId: input.manifest.pluginId,
        // ... other fields
      }));
    }),
});
```

**Benefits**:
- Database changes automatically propagate to validation schemas
- tRPC procedures get type-safe inputs/outputs from DB models
- Reduces boilerplate by ~50% (no manual Zod schema writing for DB operations)

**Alternatives Considered**:
- JSON Schema (rejected: separate from TypeScript types)
- class-validator (rejected: decorator-based, less composable)
- Yup (rejected: Zod is more modern, better TypeScript support)
- Manual Zod schemas for everything (rejected: duplicates DB schema, error-prone)

---

### Decision 14: UI Component Library (shadcn/ui + Tailwind CSS 4.0)

**Choice**: shadcn/ui for Admin/Web UI components + Tailwind CSS 4.0

**Why**:
- Not a dependency (components copied into codebase, full ownership)
- Built on Radix UI (accessible, headless components)
- **Tailwind CSS 4.0** (latest version, improved performance, native CSS features)
- Customizable without fighting framework abstractions
- High-quality defaults (reduces MVP implementation time)
- **shadcn sidebar-07 template** provides production-ready Admin layout
- **Unified design system** across Admin and Web applications

**Tailwind CSS 4.0 Key Features**:
- Native CSS variables (no PostCSS required for basic usage)
- Improved performance (JIT compilation by default)
- Better theme customization
- CSS-first configuration (not JS config)

**Implementation**:

**Centralized UI Package (`packages/ui`)** - Shared Primitives Only:
```bash
# 1. Create @wordrhyme/ui package
mkdir -p packages/ui/src

# 2. Initialize shadcn/ui in packages/ui
cd packages/ui
npx shadcn@latest init

# 3. Add UI primitive components
npx shadcn@latest add button card dialog dropdown-menu form input label select table tabs badge avatar switch checkbox radio-group separator skeleton sonner

# 4. Export all primitives from index.ts
```

Package structure (primitives only):
```
packages/ui/
├── src/
│   ├── components/
│   │   └── ui/              # shadcn/ui primitives only
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       └── ...
│   ├── lib/
│   │   └── utils.ts         # cn() utility
│   ├── styles/
│   │   └── globals.css      # Tailwind 4.0 theme
│   └── index.ts             # Public API (primitives + utils only)
├── package.json
└── tsconfig.json
```

**Admin App** - Composite Components & Layout:
```bash
# Admin-specific components (sidebar-07 template)
cd apps/admin
npx shadcn@latest add sidebar-07

# Components stay in apps/admin/src/components/
# - app-sidebar.tsx
# - nav-main.tsx
# - nav-user.tsx
# - team-switcher.tsx
```

**Web App** - Composite Components:
```bash
# Web-specific components
cd apps/web
npx shadcn@latest init
npx shadcn@latest add <web-specific-components>
```

**Architecture Rationale** (following shadcn-ui monorepo best practices):
- `@wordrhyme/ui` → **Shared primitives** (consumed by all apps & plugins)
- `apps/admin` → **Admin-specific layouts** (sidebar-07, admin nav)
- `apps/web` → **Web-specific layouts** (public site components)
- Plugins → Import **primitives** from `@wordrhyme/ui`, build custom UIs

**Plugin Usage (Module Federation Shared)**:
```typescript
// Plugins import primitives from host via Module Federation
import { Button, Card, Dialog } from '@wordrhyme/ui';

// Rsbuild Module Federation config
moduleFederation: {
  options: {
    shared: {
      '@wordrhyme/ui': {
        singleton: true,
        requiredVersion: '^0.1.0',
      }
    }
  }
}
```

**Tailwind 4.0 Configuration** (in `packages/ui/src/styles/globals.css`):
```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.5 0.2 250);
  --color-background: oklch(1 0 0);
  --radius: 0.5rem;
}
```

**Benefits**:
1. **Separation of Concerns**: Primitives in shared package, layouts in apps
2. **Module Federation Shared**: Plugins load primitives from host (zero duplication)
3. **Type Safety**: Shared TypeScript types across all applications
4. **Flexible Composition**: Apps build custom layouts from primitives
5. **Tree Shaking**: Apps/plugins only bundle what they use
6. **Follows shadcn-ui Best Practices**: Monorepo structure matches official template

**Alternatives Considered**:
- Material-UI (rejected: heavy, opinionated styling)
- Ant Design (rejected: Chinese-first design language)
- Headless UI (considered: shadcn/ui builds on similar principles)
- Custom components (rejected: slows MVP, reinvents wheel)
- Tailwind CSS 3.x (rejected: 4.0 is production-ready and recommended)

---

### Decision 15: Plugin Manifest File Name

**Choice**: `manifest.json` (single file, follow contracts)

**Why**:
- The ecosystem conventions prefer `manifest.json`
- `CORE_BOOTSTRAP_FLOW.md` specifies scanning `/plugins/*/manifest.json`
- `PLUGIN_CONTRACT.md` specifies capability declaration via `manifest.json`

**Migration Note**:
- Documents previously referenced `plugin.json`; this MVP change uses `manifest.json` consistently

---

### Decision 16: MVP Authentication & Multi-Tenancy Strategy

**Choice**: better-auth with organization plugin for unified user system

**Why**:
- TypeScript-first authentication library with excellent type safety
- Built-in Drizzle adapter (seamless integration with existing ORM)
- **Organization plugin provides native multi-tenancy support**
- Supports multiple auth methods (email/password, OAuth, magic links)
- Automatic session management with cookies
- **Unified user system**: Admin and Web users share same auth (differentiated by roles)
- Future-proof (easy to add OAuth/SSO later)

**Multi-Tenancy Model**:
- **Organization** (tenantId): Primary isolation boundary = Store (一对一映射)
  - Organization = 店铺（电商店铺）
  - 一个用户可以属于多个 Organization（管理多个店铺）
  - 通过切换 Organization 实现店铺切换
- **Space** (spaceId): CMS内容空间，Organization内的子空间（deferred to post-MVP）
- **Project** (projectId): 项目级别隔离（deferred to post-MVP）

**架构说明**：
- 符合实际电商模式（天猫/京东每个店铺独立申请）
- 不需要额外的 stores 表
- Organization 即店铺，商品/订单等直接关联 organizationId

**Implementation**:

```typescript
// apps/server/src/auth/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '../db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // MVP: Simplified
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // Update every 24 hours
  },

  // ✅ Enable organization plugin for multi-tenancy
  plugins: [
    organization({
      // Organization roles
      roles: ['owner', 'admin', 'editor', 'member', 'viewer'],

      // Default role for new members
      defaultRole: 'member',

      // Allow users to create organizations
      allowUserToCreateOrganization: true,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.User;
export type Organization = typeof auth.$Infer.Organization;
```

```typescript
// apps/server/src/middleware/auth.middleware.ts
import { auth } from '../auth/auth';
import { asyncLocalStorage } from './context';

export async function authMiddleware(req, res, next) {
  const session = await auth.api.getSession({
    headers: req.headers
  });

  // Get active organization from session or header
  const activeOrgId = req.headers['x-organization-id'] || session?.user?.activeOrganizationId;

  asyncLocalStorage.run({
    tenantId: activeOrgId || null,  // ✅ Organization ID as tenantId
    userId: session?.user?.id || null,
    role: session?.user?.role || 'guest',
    session,
  }, next);
}
```

```typescript
// apps/server/src/db/seed.ts
export async function seedTestData() {
  console.log('🌱 Seeding database...');

  // 1. Create test admin user
  const adminUser = await auth.api.signUp({
    email: 'admin@example.com',
    password: 'admin123',
    name: 'Admin User',
  });

  // 2. Create test organization (using better-auth organization plugin)
  const org = await auth.api.organization.create({
    name: 'Test Organization',
    slug: 'test-org',
    userId: adminUser.id,
  });

  // 3. Create test web user (C端用户)
  const webUser = await auth.api.signUp({
    email: 'user@test.com',
    password: 'user123',
    name: 'Test User',
  });

  // 4. Add web user to organization as member
  await auth.api.organization.addMember({
    organizationId: org.id,
    userId: webUser.id,
    role: 'member',
  });

  console.log('✅ Test users created:');
  console.log('   Admin: admin@test.com / admin123 (owner)');
  console.log('   User:  user@test.com / user123 (member)');
  console.log(`   Organization: ${org.name} (${org.id})`);
}
```

**Database Schema** (auto-generated by better-auth organization plugin):

```typescript
// better-auth automatically creates these tables:
// - user (standard user fields)
// - session (session management)
// - organization (organizations/tenants)
// - member (organization membership)
// - invitation (organization invitations)

// We extend with additional fields:
export const users = pgTable('user', {
  // better-auth standard fields (auto-created)
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),

  // ✅ Additional fields for our use case
  activeOrganizationId: text('activeOrganizationId'), // Current active org
});

// Organization table (created by better-auth)
export const organizations = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('createdAt').notNull(),
  metadata: jsonb('metadata'),
});

// Member table (created by better-auth)
export const members = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organizations.id),
  userId: text('userId').notNull().references(() => users.id),
  role: text('role').notNull(), // owner | admin | editor | member | viewer
  createdAt: timestamp('createdAt').notNull(),
});
```

**tRPC Context Integration**:

```typescript
// apps/server/src/trpc/context.ts
export async function createContext({ req, res }) {
  const ctx = asyncLocalStorage.getStore();

  return {
    tenantId: ctx?.tenantId,      // ✅ Organization ID
    userId: ctx?.userId,
    role: ctx?.role,
    session: ctx?.session,
    db,
  };
}
```

**User Roles** (Unified System):

| Role | Access | Use Case |
|------|--------|----------|
| **owner** | Full control | Organization creator |
| **admin** | Manage org + content | Admin dashboard users |
| **editor** | Edit content | Content editors |
| **member** | View + comment | Web users (C端) |
| **viewer** | Read-only | Public/guest users |

**Admin vs Web Differentiation**:

```typescript
// Admin UI: Check if user has admin/owner role
const canAccessAdmin = ['owner', 'admin', 'editor'].includes(user.role);

// Web UI: All authenticated users can access
const canAccessWeb = user.role !== null;
```

**Alternatives Considered**:
- Custom multi-tenancy implementation (rejected: better-auth has native support)
- Separate user systems for Admin/Web (rejected: adds complexity)
- Hardcoded test context (rejected: not realistic for MVP)
- Header-based auth (rejected: insecure, poor DX)
- NextAuth.js (rejected: React-specific, less flexible)
- Lucia (rejected: lower-level, more boilerplate)

---

### Decision 17: Plugin Upload and Extraction

**Choice**: Fastify multipart + adm-zip for synchronous extraction

**Why**:
- Fastify multipart is the standard for file uploads in Fastify
- adm-zip is pure JavaScript (no native dependencies)
- Synchronous API is simpler for MVP (async can be added later)
- ZIP format is universal and well-supported

**Implementation**:

```typescript
// apps/server/src/plugins/upload.ts
import multipart from '@fastify/multipart';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

// Register multipart
app.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// Upload endpoint
app.post('/api/plugins/upload', async (req, reply) => {
  const data = await req.file();

  if (!data) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No file uploaded' });
  }

  if (data.mimetype !== 'application/zip') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only ZIP files allowed' });
  }

  // Save to temp directory
  const uploadId = randomUUID();
  const tempPath = path.join('/tmp/uploads', `${uploadId}.zip`);

  mkdirSync(path.dirname(tempPath), { recursive: true });
  writeFileSync(tempPath, await data.toBuffer());

  return { uploadId };
});
```

```typescript
// apps/server/src/plugins/plugin-manager.ts
import AdmZip from 'adm-zip';

export class PluginManager {
  async install(uploadId: string): Promise<string> {
    const zipPath = `/tmp/uploads/${uploadId}.zip`;

    // Extract ZIP
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Validate manifest exists
    const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('manifest.json not found in ZIP');
    }

    // Parse and validate manifest
    const manifestContent = manifestEntry.getData().toString('utf8');
    const manifest = pluginManifestSchema.parse(JSON.parse(manifestContent));

    // Extract to plugin directory
    const pluginDir = path.join(process.env.PLUGIN_DIR || './plugins', manifest.pluginId);
    zip.extractAllTo(pluginDir, true);

    // Load plugin module
    const serverEntry = path.join(pluginDir, manifest.server.entry);
    const pluginModule = await import(serverEntry + '?t=' + Date.now());

    // Register router
    if (pluginModule.router) {
      registerPluginRouter(manifest.pluginId, pluginModule.router);
    }

    // Call lifecycle hook
    if (pluginModule.onEnable) {
      const ctx = this.buildContext(manifest.pluginId);
      await pluginModule.onEnable(ctx);
    }

    // Store in database
    await db.insert(pluginsTable).values({
      pluginId: manifest.pluginId,
      status: 'enabled',
      version: manifest.version,
    });

    return manifest.pluginId;
  }
}
```

**Manifest Validation Schema**:

```typescript
// apps/server/src/plugins/manifest-schema.ts
import { z } from 'zod';

export const pluginManifestSchema = z.object({
  pluginId: z.string().regex(/^[a-z0-9]+(\\.[a-z0-9-]+)+$/),
  version: z.string().regex(/^\\d+\\.\\d+\\.\\d+$/),
  name: z.string().min(1),
  vendor: z.string().min(1),

  server: z.object({
    entry: z.string(),
    router: z.boolean().optional(),
    module: z.string().optional(),
  }),

  admin: z.object({
    remoteEntry: z.string(),
    exposes: z.record(z.string()),
  }).optional(),

  web: z.object({
    entry: z.string(),
    routes: z.array(z.object({
      path: z.string(),
      component: z.string(),
    })),
  }).optional(),

  capabilities: z.object({
    ui: z.object({
      adminPage: z.boolean().optional(),
      webPage: z.boolean().optional(),
    }).optional(),
    data: z.object({
      read: z.boolean().optional(),
      write: z.boolean().optional(),
    }).optional(),
  }),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
```

**Security Measures**:
- File size limit (50MB)
- MIME type validation
- Path traversal prevention (validate pluginId format)
- Manifest schema validation

**Alternatives Considered**:
- unzipper (rejected: async complexity for MVP)
- jszip (rejected: requires manual file writing)
- tar.gz format (rejected: less universal than ZIP)

---

### Decision 18: Module Federation Shared Dependencies

**Choice**: Balanced sharing strategy - core libraries singleton, UI libraries flexible

**Why**:
- Singleton for React/React-DOM prevents multiple instances (critical for hooks)
- Flexible versioning for UI libraries reduces plugin conflicts
- Explicit peerDependencies in plugin manifest ensures compatibility
- Balance between bundle size and version flexibility

**Admin Configuration** (Rspack):

```typescript
// apps/admin/rspack.config.ts
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

export default {
  plugins: [
    new ModuleFederationPlugin({
      name: 'admin',
      filename: 'remoteEntry.js',

      shared: {
        // Core libraries (strict singleton)
        'react': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^18.0.0',
          eager: false,
        },
        'react-dom': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^18.0.0',
          eager: false,
        },

        // Plugin API (strict singleton)
        '@wordrhyme/plugin': {
          singleton: true,
          strictVersion: true,
          requiredVersion: '^0.1.0',
        },

        // Router (strict singleton for Admin)
        '@tanstack/react-router': {
          singleton: true,
          strictVersion: true,
          requiredVersion: '^1.0.0',
        },

        // tRPC (singleton recommended)
        '@trpc/client': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^11.0.0',
        },
        '@trpc/react-query': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^11.0.0',
        },

        // React Query (singleton recommended)
        '@tanstack/react-query': {
          singleton: true,
          strictVersion: false,
          requiredVersion: '^5.0.0',
        },

        // UI libraries (flexible, allow multiple versions)
        'lucide-react': {
          singleton: false,
          requiredVersion: '^0.400.0',
        },

        // Validation (flexible)
        'zod': {
          singleton: false,
          requiredVersion: '^3.0.0',
        },
      },
    }),
  ],
};
```

**Web Configuration** (Next.js):

```typescript
// apps/web/next.config.js
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

module.exports = {
  webpack: (config, options) => {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'web',
        filename: 'static/chunks/remoteEntry.js',

        shared: {
          'react': {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          },
          'react-dom': {
            singleton: true,
            strictVersion: false,
            requiredVersion: '^18.0.0',
          },
          '@wordrhyme/plugin': {
            singleton: true,
            strictVersion: true,
            requiredVersion: '^0.1.0',
          },
        },

        // Next.js Presets (auto-share Next.js internals)
        extraOptions: {
          exposePages: true,
          enableImageLoaderFix: true,
          enableUrlLoaderFix: true,
          skipSharingNextInternals: false,
        },
      })
    );

    return config;
  },

  env: {
    NEXT_PRIVATE_LOCAL_WEBPACK: 'true',
  },
};
```

**Plugin peerDependencies Declaration**:

```json
// examples/plugin-analytics/package.json
{
  "name": "@plugins/analytics",
  "version": "1.0.0",
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@wordrhyme/plugin": "^0.1.0",
    "@tanstack/react-router": "^1.0.0",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0"
  }
}
```

**Shared Dependencies Matrix**:

| Library | Admin | Web | Plugin Must Declare | Singleton | Strict Version |
|---------|-------|-----|---------------------|-----------|----------------|
| react | ✅ | ✅ | ✅ | Yes | No |
| react-dom | ✅ | ✅ | ✅ | Yes | No |
| @wordrhyme/plugin | ✅ | ✅ | ✅ | Yes | Yes |
| @tanstack/react-router | ✅ | ❌ | ⚠️ (Admin only) | Yes | Yes |
| @trpc/client | ✅ | ✅ | ✅ | Yes | No |
| @trpc/react-query | ✅ | ✅ | ✅ | Yes | No |
| @tanstack/react-query | ✅ | ✅ | ✅ | Yes | No |
| lucide-react | ✅ | ❌ | ❌ | No | No |
| zod | ✅ | ✅ | ❌ | No | No |

**Plugin Development Guidelines**:

```typescript
// Plugin Rspack config
export default {
  plugins: [
    new ModuleFederationPlugin({
      name: 'plugin-analytics',
      filename: 'remoteEntry.js',

      exposes: {
        './SettingsPage': './src/admin/pages/SettingsPage',
      },

      shared: {
        // MUST match host configuration
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        '@wordrhyme/plugin': { singleton: true, requiredVersion: '^0.1.0' },

        // Optional: share if used
        '@tanstack/react-router': { singleton: true, requiredVersion: '^1.0.0' },
      },
    }),
  ],
};
```

**Alternatives Considered**:
- Minimal sharing (rejected: large plugin bundles)
- Aggressive sharing (rejected: high version conflict risk)
- No version constraints (rejected: runtime errors)

---

### Decision 19: Error Handling Standards

**Choice**: Custom business error codes with tRPC error wrapper

**Why**:
- tRPC provides type-safe error handling
- Custom error codes provide business context
- Structured error format enables better UI feedback
- Centralized error definitions prevent inconsistency

**Error Code Definitions**:

```typescript
// apps/server/src/errors/codes.ts
export enum ErrorCode {
  // Plugin errors (1000-1999)
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  PLUGIN_ALREADY_INSTALLED = 'PLUGIN_ALREADY_INSTALLED',
  PLUGIN_MANIFEST_INVALID = 'PLUGIN_MANIFEST_INVALID',
  PLUGIN_VERSION_INCOMPATIBLE = 'PLUGIN_VERSION_INCOMPATIBLE',
  PLUGIN_INSTALLATION_FAILED = 'PLUGIN_INSTALLATION_FAILED',
  PLUGIN_LOAD_FAILED = 'PLUGIN_LOAD_FAILED',

  // Permission errors (2000-2999)
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INSUFFICIENT_PRIVILEGES = 'INSUFFICIENT_PRIVILEGES',

  // Validation errors (3000-3999)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',

  // Resource errors (4000-4999)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.PLUGIN_NOT_FOUND]: 'Plugin not found',
  [ErrorCode.PLUGIN_ALREADY_INSTALLED]: 'Plugin is already installed',
  [ErrorCode.PLUGIN_MANIFEST_INVALID]: 'Plugin manifest validation failed',
  [ErrorCode.PLUGIN_VERSION_INCOMPATIBLE]: 'Plugin version is incompatible with system',
  [ErrorCode.PLUGIN_INSTALLATION_FAILED]: 'Plugin installation failed',
  [ErrorCode.PLUGIN_LOAD_FAILED]: 'Failed to load plugin',
  [ErrorCode.PERMISSION_DENIED]: 'Permission denied',
  [ErrorCode.INSUFFICIENT_PRIVILEGES]: 'Insufficient privileges',
  [ErrorCode.VALIDATION_FAILED]: 'Validation failed',
  [ErrorCode.INVALID_INPUT]: 'Invalid input',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'Resource already exists',
};
```

**Error Helper Functions**:

```typescript
// apps/server/src/errors/helpers.ts
import { TRPCError } from '@trpc/server';
import { ErrorCode, ErrorMessages } from './codes';

export function createError(
  code: ErrorCode,
  details?: Record<string, any>
): TRPCError {
  return new TRPCError({
    code: mapToTRPCCode(code),
    message: ErrorMessages[code],
    cause: {
      errorCode: code,
      details,
    },
  });
}

function mapToTRPCCode(code: ErrorCode): TRPCError['code'] {
  if (code.startsWith('PERMISSION_')) return 'FORBIDDEN';
  if (code.startsWith('VALIDATION_') || code.startsWith('INVALID_')) return 'BAD_REQUEST';
  if (code.includes('NOT_FOUND')) return 'NOT_FOUND';
  if (code.includes('ALREADY_EXISTS')) return 'CONFLICT';
  return 'INTERNAL_SERVER_ERROR';
}

export function isPluginError(error: unknown): error is TRPCError {
  return error instanceof TRPCError &&
         typeof error.cause === 'object' &&
         error.cause !== null &&
         'errorCode' in error.cause;
}
```

**Usage in tRPC Procedures**:

```typescript
// apps/server/src/trpc/routers/plugin.ts
import { createError, ErrorCode } from '../../errors';

export const pluginRouter = router({
  install: publicProcedure
    .input(z.object({ uploadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const pluginId = await pluginManager.install(input.uploadId);
        return { pluginId };
      } catch (error) {
        if (error instanceof ZodError) {
          throw createError(ErrorCode.PLUGIN_MANIFEST_INVALID, {
            validationErrors: error.errors,
          });
        }

        if (error.message.includes('already installed')) {
          throw createError(ErrorCode.PLUGIN_ALREADY_INSTALLED, {
            pluginId: error.pluginId,
          });
        }

        throw createError(ErrorCode.PLUGIN_INSTALLATION_FAILED, {
          originalError: error.message,
        });
      }
    }),
});
```

**Frontend Error Handling**:

```typescript
// apps/admin/src/hooks/use-plugin-install.ts
import { trpc } from '../utils/trpc';
import { ErrorCode } from '@server/errors/codes';

export function usePluginInstall() {
  const mutation = trpc.plugin.install.useMutation({
    onError: (error) => {
      const errorCode = error.data?.cause?.errorCode;
      const details = error.data?.cause?.details;

      switch (errorCode) {
        case ErrorCode.PLUGIN_MANIFEST_INVALID:
          toast.error('插件配置文件无效', {
            description: details?.validationErrors?.[0]?.message,
          });
          break;

        case ErrorCode.PLUGIN_VERSION_INCOMPATIBLE:
          toast.error('插件版本不兼容', {
            description: `需要 ${details?.required}，当前系统 ${details?.current}`,
          });
          break;

        case ErrorCode.PLUGIN_ALREADY_INSTALLED:
          toast.warning('插件已安装');
          break;

        default:
          toast.error('安装失败', {
            description: error.message,
          });
      }
    },
  });

  return mutation;
}
```

**Error Response Format**:

```typescript
// Type-safe error structure
interface PluginError {
  code: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR';
  message: string;
  data: {
    cause: {
      errorCode: ErrorCode;
      details?: Record<string, any>;
    };
  };
}
```

**Alternatives Considered**:
- tRPC codes only (rejected: insufficient business context)
- HTTP status codes (rejected: not type-safe)
- Exception classes (rejected: doesn't work well with tRPC)

---

### Decision 20: Development Mode Hot Reload

**Choice**: tsx watch with automatic server restart

**Why**:
- tsx provides fast TypeScript execution without compilation
- Watch mode automatically restarts on file changes
- Simple configuration, no additional dependencies
- Good enough for MVP (3-5 second restart time)
- Can upgrade to more sophisticated solutions later

**Implementation**:

```json
// apps/server/package.json
{
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/main.ts",
    "dev:debug": "tsx watch --inspect --clear-screen=false src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js"
  },
  "devDependencies": {
    "tsx": "^4.0.0"
  }
}
```

```typescript
// apps/server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  await app.listen(process.env.PORT || 3000, '0.0.0.0');

  console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}

bootstrap();
```

**Plugin Hot Reload Strategy**:

For MVP, plugin changes require server restart:

```typescript
// apps/server/src/plugins/plugin-loader.ts
export class PluginLoader {
  async loadPlugins() {
    const mode = process.env.NODE_ENV || 'development';

    if (mode === 'development') {
      console.log('📦 Loading plugins from /plugins (dev mode)');
      return this.loadFromPluginsDir();
    } else {
      console.log('📦 Loading plugins from /plugins (production mode)');
      return this.loadFromPluginsDir();
    }
  }

  private async loadFromPluginsDir() {
    const pluginDirs = await glob('/plugins/*');

    for (const pluginDir of pluginDirs) {
      try {
        const manifest = await this.loadManifest(pluginDir);
        const serverEntry = path.join(pluginDir, manifest.server.entry);

        // Cache busting for development
        const module = await import(serverEntry + '?t=' + Date.now());

        if (module.router) {
          registerPluginRouter(manifest.pluginId, module.router);
        }

        console.log(`✅ Plugin loaded: ${manifest.pluginId}`);
      } catch (error) {
        console.error(`❌ Failed to load plugin from ${pluginDir}:`, error);
      }
    }
  }
}
```

**Development Workflow**:

1. Developer modifies plugin code in `/plugins/{pluginId}/src`
2. Plugin build tool (tsx/tsup) watches and rebuilds to `dist/`
3. tsx watch detects `dist/` changes
4. Server restarts automatically (3-5 seconds)
5. Plugin reloaded with new code

**Plugin Build Configuration**:

```json
// examples/plugin-analytics/package.json
{
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup"
  }
}
```

```typescript
// examples/plugin-analytics/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  outDir: 'dist/server',
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Turborepo Dev Configuration**:

```json
// turbo.json
{
  "pipeline": {
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

```json
// package.json (root)
{
  "scripts": {
    "dev": "turbo run dev --parallel"
  }
}
```

**Future Enhancements** (post-MVP):
- File watcher with selective plugin reload (no full restart)
- PM2 cluster mode with rolling reload
- Redis pub/sub for multi-instance coordination

**Alternatives Considered**:
- nodemon (rejected: tsx watch is simpler and faster)
- File watcher + dynamic reload (rejected: complex for MVP)
- PM2 dev mode (rejected: overkill for local development)

---

### Decision 21: Environment Configuration Management

**Choice**: .env files with Zod validation at startup

**Why**:
- Industry standard approach (.env files)
- Type-safe with Zod schema validation
- Fail-fast on startup if config invalid
- Clear error messages for missing/invalid values
- Easy to document required variables

**Implementation**:

```typescript
// apps/server/src/config/env.ts
import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),

  // Redis (optional for MVP)
  REDIS_URL: z.string().url().optional().describe('Redis connection string'),

  // Authentication
  AUTH_SECRET: z.string().min(32).describe('Secret key for session encryption (min 32 chars)'),
  AUTH_TRUST_HOST: z.coerce.boolean().default(false),

  // Plugins
  PLUGIN_DIR: z.string().default('./plugins').describe('Directory for plugin storage'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

// Validate and export
let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment configuration:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };

// Helper to check if in development
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
```

**Environment File Templates**:

```bash
# .env.example (checked into git)
# Copy this file to .env and fill in the values

# Environment
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wordrhyme

# Redis (optional)
# REDIS_URL=redis://localhost:6379

# Authentication
# Generate with: openssl rand -base64 32
AUTH_SECRET=your-secret-key-min-32-chars-long-replace-this
AUTH_TRUST_HOST=false

# Plugins
PLUGIN_DIR=./plugins

# Logging
LOG_LEVEL=info
```

```bash
# .env.development (local development)
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wordrhyme_dev
AUTH_SECRET=dev-secret-key-min-32-chars-long-only-for-local
AUTH_TRUST_HOST=true
PLUGIN_DIR=./plugins
LOG_LEVEL=debug
```

```bash
# .env.production (production template)
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
AUTH_SECRET=${AUTH_SECRET}
AUTH_TRUST_HOST=false
PLUGIN_DIR=/var/lib/wordrhyme/plugins
LOG_LEVEL=info
```

**Usage in Code**:

```typescript
// apps/server/src/main.ts
import { env, isDev } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await app.listen(env.PORT, '0.0.0.0');

  if (isDev) {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`📦 Plugin directory: ${env.PLUGIN_DIR}`);
  }
}
```

**Docker Compose Integration**:

```yaml
# infra/docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: wordrhyme_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

**Startup Validation**:

```typescript
// apps/server/src/main.ts
import { env } from './config/env';

async function bootstrap() {
  // Environment already validated by env.ts
  console.log('✅ Environment configuration valid');

  // Additional runtime checks
  if (env.NODE_ENV === 'production' && env.AUTH_SECRET.includes('dev')) {
    console.error('❌ Production environment detected with dev secret!');
    process.exit(1);
  }

  // ... rest of bootstrap
}
```

**Alternatives Considered**:
- JSON config files (rejected: less standard, no env var support)
- YAML config (rejected: overkill for MVP)
- No validation (rejected: runtime errors hard to debug)
- dotenv-cli (rejected: Zod validation is better)

---

### Decision 22: Database Initialization Strategy

**Choice**: Drizzle migrations + seed script with idempotent operations

**Why**:
- Drizzle Kit generates type-safe migrations from schema
- Version-controlled migration files (git-tracked)
- Idempotent seed script (safe to run multiple times)
- Clear separation: migrations (schema) vs seeds (data)
- Easy to reset database in development

**Implementation**:

```typescript
// apps/server/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
```

```typescript
// apps/server/src/db/schema/index.ts
export * from './tenants';
export * from './users';
export * from './plugins';
export * from './sessions';
```

```typescript
// apps/server/src/db/schema/tenants.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

```typescript
// apps/server/src/db/schema/plugins.ts
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().unique(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  version: text('version').notNull(),
  status: text('status').notNull(), // 'enabled' | 'disabled'
  manifest: jsonb('manifest').notNull(),
  installedAt: timestamp('installed_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Migration Workflow**:

```json
// apps/server/package.json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "db:reset": "pnpm db:push && pnpm db:seed"
  }
}
```

**Seed Script** (Idempotent):

```typescript
// apps/server/src/db/seed.ts
import { db } from './index';
import { tenants, users } from './schema';
import { auth } from '../auth/auth';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Create test tenant (idempotent)
  const existingTenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, 'test-tenant-001'))
    .limit(1);

  let tenant;
  if (existingTenant.length === 0) {
    [tenant] = await db.insert(tenants).values({
      id: 'test-tenant-001',
      name: 'Test Organization',
    }).returning();
    console.log('✅ Test tenant created');
  } else {
    tenant = existingTenant[0];
    console.log('ℹ️  Test tenant already exists');
  }

  // 2. Create test admin user (idempotent)
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@test.com'))
    .limit(1);

  if (existingUser.length === 0) {
    await auth.api.signUp({
      email: 'admin@test.com',
      password: 'admin123',
      name: 'Admin User',
      data: {
        tenantId: tenant.id,
        role: 'admin',
      }
    });
    console.log('✅ Test admin user created: admin@test.com / admin123');
  } else {
    console.log('ℹ️  Test admin user already exists');
  }

  console.log('🎉 Seeding complete!');
}

seed()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

**Database Connection**:

```typescript
// apps/server/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

**Development Workflow**:

```bash
# 1. Start PostgreSQL
docker-compose up -d postgres

# 2. Generate migration from schema changes
pnpm db:generate

# 3. Apply migrations
pnpm db:migrate

# 4. Seed test data
pnpm db:seed

# Or reset everything
pnpm db:reset
```

**Production Workflow**:

```bash
# 1. Review generated migration files in drizzle/
git diff drizzle/

# 2. Commit migrations
git add drizzle/
git commit -m "Add user table migration"

# 3. Deploy: run migrations before starting server
pnpm db:migrate
pnpm start
```

**Migration File Example**:

```sql
-- drizzle/0000_initial.sql
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "role" text NOT NULL DEFAULT 'viewer',
  "created_at" timestamp DEFAULT now() NOT NULL
);
```

**Alternatives Considered**:
- Prisma migrations (rejected: slower, magic ORM)
- Raw SQL files (rejected: no type safety)
- TypeORM migrations (rejected: decorator-heavy)
- No migrations (rejected: schema drift risk)

---

### Decision 23: Logging System

**Choice**: Console logging for MVP with structured format

**Why**:
- Zero dependencies (built-in console)
- Sufficient for MVP development
- Easy to upgrade to pino/winston later
- Structured format prepares for future log aggregation
- No performance overhead

**Implementation**:

```typescript
// apps/server/src/utils/logger.ts
import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = env.LOG_LEVEL;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext) {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.shouldLog('info')) {
      console.info(this.format('info', message, context));
    }
  }

  warn(message: string, context?: LogContext) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, context));
    }
  }

  error(message: string, context?: LogContext) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, context));
    }
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger();
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
    };

    childLogger.debug = (msg, ctx) => originalMethods.debug(msg, { ...context, ...ctx });
    childLogger.info = (msg, ctx) => originalMethods.info(msg, { ...context, ...ctx });
    childLogger.warn = (msg, ctx) => originalMethods.warn(msg, { ...context, ...ctx });
    childLogger.error = (msg, ctx) => originalMethods.error(msg, { ...context, ...ctx });

    return childLogger;
  }
}

export const logger = new Logger();
```

**Usage Examples**:

```typescript
// Basic logging
logger.info('Server started', { port: 3000 });
logger.error('Database connection failed', { error: err.message });

// Plugin logging (with context)
const pluginLogger = logger.child({ pluginId: 'com.example.analytics' });
pluginLogger.info('Plugin enabled');
pluginLogger.error('Failed to track event', { event: 'click' });

// Request logging (middleware)
app.use((req, res, next) => {
  const requestLogger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.url,
  });

  requestLogger.info('Request started');

  res.on('finish', () => {
    requestLogger.info('Request completed', {
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
    });
  });

  next();
});
```

**Plugin Logger Capability**:

```typescript
// apps/server/src/plugins/capabilities/logger.ts
import { logger } from '../../utils/logger';

export function createPluginLogger(pluginId: string) {
  return logger.child({ pluginId });
}

// Usage in PluginContext
const ctx: PluginContext = {
  pluginId: manifest.pluginId,
  logger: createPluginLogger(manifest.pluginId),
  // ...
};
```

**Log Output Format**:

```
[2025-01-15T10:30:45.123Z] [INFO] Server started {"port":3000}
[2025-01-15T10:30:46.456Z] [INFO] Plugin enabled {"pluginId":"com.example.analytics"}
[2025-01-15T10:30:47.789Z] [ERROR] Failed to track event {"pluginId":"com.example.analytics","event":"click"}
```

**Future Upgrade Path** (post-MVP):

```typescript
// Replace with pino
import pino from 'pino';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

**Alternatives Considered**:
- pino (rejected: MVP doesn't need performance optimization)
- winston (rejected: more complex, heavier)
- Custom file logging (rejected: not needed for MVP)
- No logging (rejected: debugging would be impossible)

---

### Decision 24: Plugin Development Tooling

**Choice**: Turborepo generator with interactive prompts

**Why**:
- Built into Turborepo (no extra dependencies)
- Interactive prompts guide developers
- Template-based generation (consistent structure)
- Automatic workspace integration
- Conditional file generation based on features

**Implementation**:

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "generators": {
    "plugin": {
      "description": "Create a new WordRhyme plugin",
      "prompts": [
        {
          "type": "input",
          "name": "pluginId",
          "message": "Plugin ID (e.g., com.example.myplugin)",
          "validate": "(input) => /^[a-z0-9]+(\\.[a-z0-9-]+)+$/.test(input) || 'Invalid plugin ID format'"
        },
        {
          "type": "input",
          "name": "name",
          "message": "Plugin display name"
        },
        {
          "type": "input",
          "name": "vendor",
          "message": "Vendor name"
        },
        {
          "type": "multiselect",
          "name": "features",
          "message": "Select features to include",
          "choices": [
            { "name": "server", "message": "Server (tRPC Router)", "hint": "Backend API endpoints" },
            { "name": "admin", "message": "Admin UI", "hint": "Admin dashboard components" },
            { "name": "web", "message": "Web UI", "hint": "Public-facing pages" }
          ]
        }
      ],
      "actions": [
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/manifest.json",
          "templateFile": "templates/plugin/manifest.json.hbs"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/package.json",
          "templateFile": "templates/plugin/package.json.hbs"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/tsconfig.json",
          "templateFile": "templates/plugin/tsconfig.json.hbs"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/README.md",
          "templateFile": "templates/plugin/README.md.hbs"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/src/server/index.ts",
          "templateFile": "templates/plugin/server/index.ts.hbs",
          "skip": "(answers) => !answers.features.includes('server')"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/src/server/router.ts",
          "templateFile": "templates/plugin/server/router.ts.hbs",
          "skip": "(answers) => !answers.features.includes('server')"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/src/admin/pages/SettingsPage.tsx",
          "templateFile": "templates/plugin/admin/SettingsPage.tsx.hbs",
          "skip": "(answers) => !answers.features.includes('admin')"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/src/admin/rspack.config.ts",
          "templateFile": "templates/plugin/admin/rspack.config.ts.hbs",
          "skip": "(answers) => !answers.features.includes('admin')"
        },
        {
          "type": "add",
          "path": "examples/{{ dashCase pluginId }}/src/web/pages/Index.tsx",
          "templateFile": "templates/plugin/web/Index.tsx.hbs",
          "skip": "(answers) => !answers.features.includes('web')"
        }
      ]
    }
  }
}
```

**Template Examples**:

```handlebars
{{!-- templates/plugin/manifest.json.hbs --}}
{
  "pluginId": "{{ pluginId }}",
  "version": "1.0.0",
  "name": "{{ name }}",
  "vendor": "{{ vendor }}",

  {{#if (includes features "server")}}
  "server": {
    "entry": "./dist/server/index.js",
    "router": true
  },
  {{/if}}

  {{#if (includes features "admin")}}
  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "exposes": {
      "./SettingsPage": "./src/admin/pages/SettingsPage"
    }
  },
  {{/if}}

  {{#if (includes features "web")}}
  "web": {
    "entry": "./dist/web/index.js",
    "routes": [
      { "path": "/{{ dashCase pluginId }}", "component": "Index" }
    ]
  },
  {{/if}}

  "capabilities": {
    "ui": {
      "adminPage": {{#if (includes features "admin")}}true{{else}}false{{/if}},
      "webPage": {{#if (includes features "web")}}true{{else}}false{{/if}}
    },
    "data": {
      "read": false,
      "write": false
    }
  }
}
```

```handlebars
{{!-- templates/plugin/package.json.hbs --}}
{
  "name": "@plugins/{{ dashCase pluginId }}",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    {{#if (includes features "server")}}
    "dev:server": "tsup --watch",
    "build:server": "tsup",
    {{/if}}
    {{#if (includes features "admin")}}
    "dev:admin": "rspack serve --config src/admin/rspack.config.ts",
    "build:admin": "rspack build --config src/admin/rspack.config.ts",
    {{/if}}
    "build": "pnpm build:server && pnpm build:admin",
    "pack": "zip -r {{ dashCase pluginId }}.zip manifest.json dist/"
  },
  "dependencies": {
    "@wordrhyme/plugin": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

**Usage**:

```bash
# Generate new plugin
pnpm turbo gen plugin

# Interactive prompts:
# ? Plugin ID: com.example.analytics
# ? Plugin display name: Analytics Plugin
# ? Vendor name: Example Inc
# ? Select features: ◉ server ◉ admin ◯ web

# Result:
# ✅ Created examples/com-example-analytics/
# ✅ Generated 8 files
#
# Next steps:
#   cd examples/com-example-analytics
#   pnpm install
#   pnpm dev
```

**Generated Structure**:

```
examples/com-example-analytics/
├── manifest.json
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── server/
│   │   ├── index.ts
│   │   └── router.ts
│   └── admin/
│       ├── pages/
│       │   └── SettingsPage.tsx
│       └── rspack.config.ts
└── dist/ (generated by build)
```

**Alternatives Considered**:
- Custom CLI tool (rejected: more maintenance, Turborepo is sufficient)
- Manual copying (rejected: error-prone, inconsistent)
- Yeoman generator (rejected: extra dependency, overkill)

---

### Decision 25: Version Compatibility Checking

**Choice**: Dual-phase validation (install-time + runtime) with manifest declaration

**Why**:
- Install-time check prevents incompatible plugins from being installed
- Runtime check provides user-friendly warnings in UI
- Manifest declaration makes requirements explicit
- Lenient mode allows minor version differences
- Prepares for future marketplace validation

**Implementation**:

**Phase 1: Install-Time Validation**

```typescript
// apps/server/src/plugins/version-validator.ts
import semver from 'semver';
import { PluginManifest } from './manifest-schema';

export interface ValidationResult {
  valid: boolean;
  canLoadWithWarnings: boolean;
  errors: string[];
  warnings: string[];
}

export class PluginVersionValidator {
  private hostVersions = {
    react: '18.3.1',
    'react-dom': '18.3.1',
    '@wordrhyme/plugin': '0.1.0',
    '@tanstack/react-router': '1.0.0',
  };

  validate(manifest: PluginManifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check peerDependencies
    const peerDeps = manifest.peerDependencies || {};

    for (const [dep, requiredVersion] of Object.entries(peerDeps)) {
      const hostVersion = this.hostVersions[dep];

      if (!hostVersion) {
        warnings.push(`Unknown dependency: ${dep}`);
        continue;
      }

      if (!semver.satisfies(hostVersion, requiredVersion)) {
        const majorDiff = this.getMajorVersionDiff(requiredVersion, hostVersion);

        if (majorDiff > 0) {
          // Major version mismatch
          if (manifest.compatibilityMode === 'strict') {
            errors.push(
              `${dep}: Plugin requires ${requiredVersion}, Host has ${hostVersion} (major version mismatch)`
            );
          } else {
            warnings.push(
              `${dep}: Plugin requires ${requiredVersion}, Host has ${hostVersion} (lenient mode)`
            );
          }
        } else {
          // Minor version difference
          warnings.push(
            `${dep}: Plugin requires ${requiredVersion}, Host has ${hostVersion} (minor difference)`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      canLoadWithWarnings: manifest.compatibilityMode === 'lenient' && errors.length === 0,
      errors,
      warnings,
    };
  }

  private getMajorVersionDiff(required: string, host: string): number {
    const requiredMajor = semver.major(semver.coerce(required) || '0.0.0');
    const hostMajor = semver.major(host);
    return Math.abs(requiredMajor - hostMajor);
  }
}
```

```typescript
// apps/server/src/plugins/plugin-manager.ts (updated)
export class PluginManager {
  private validator = new PluginVersionValidator();

  async install(uploadId: string): Promise<string> {
    // ... extract and parse manifest ...

    // Validate versions
    const validation = this.validator.validate(manifest);

    if (!validation.valid) {
      throw createError(ErrorCode.PLUGIN_VERSION_INCOMPATIBLE, {
        errors: validation.errors,
      });
    }

    // Store warnings in database
    if (validation.warnings.length > 0) {
      await db.insert(pluginWarnings).values({
        pluginId: manifest.pluginId,
        warnings: validation.warnings,
      });
    }

    // ... continue installation ...
  }
}
```

**Phase 2: Runtime UI Warnings**

```typescript
// apps/admin/src/components/PluginVersionWarning.tsx
import { Alert, AlertCircle, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface VersionWarning {
  dependency: string;
  required: string;
  host: string;
  severity: 'error' | 'warning';
}

export function PluginVersionWarning({ warnings }: { warnings: VersionWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <Alert
          key={warning.dependency}
          variant={warning.severity === 'error' ? 'destructive' : 'default'}
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {warning.severity === 'error' ? '版本不兼容' : '版本警告'}
          </AlertTitle>
          <AlertDescription>
            <strong>{warning.dependency}</strong>: 插件需要 {warning.required}，
            当前系统使用 {warning.host}
            {warning.severity === 'error' && (
              <>
                <br />
                插件无法加载，请联系开发者更新插件。
              </>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
```

```typescript
// apps/admin/src/pages/PluginSettings.tsx
export function PluginSettings() {
  const { data: plugins } = trpc.plugin.list.useQuery();

  return (
    <div className="space-y-4">
      {plugins?.map((plugin) => (
        <Card key={plugin.pluginId}>
          <CardHeader>
            <CardTitle>{plugin.name}</CardTitle>
            <CardDescription>v{plugin.version}</CardDescription>
          </CardHeader>

          <CardContent>
            {/* Version warnings */}
            {plugin.warnings && (
              <PluginVersionWarning warnings={plugin.warnings} />
            )}

            <Button
              onClick={() => togglePlugin(plugin.pluginId)}
              disabled={plugin.warnings?.some(w => w.severity === 'error')}
            >
              {plugin.enabled ? '禁用' : '启用'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Manifest Schema Extension**:

```typescript
// Update pluginManifestSchema
export const pluginManifestSchema = z.object({
  // ... existing fields ...

  peerDependencies: z.record(z.string()).optional(),
  compatibilityMode: z.enum(['strict', 'lenient', 'fallback']).default('lenient'),
});
```

**Database Schema for Warnings**:

```typescript
// apps/server/src/db/schema/plugin-warnings.ts
export const pluginWarnings = pgTable('plugin_warnings', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.pluginId),
  warnings: jsonb('warnings').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**Alternatives Considered**:
- Runtime-only checking (rejected: allows incompatible installs)
- Install-only checking (rejected: no user feedback)
- No version checking (rejected: runtime errors)
- Automatic version resolution (rejected: too complex for MVP)

---

### Decision 26: Visual Editor Architecture (Future-Proofing)

> **Note (Non-normative / Out of MVP scope)**: Decisions 16–25 document *potential* extension points and interfaces to reduce future refactor risk. They MUST NOT expand the MVP contract surface area: MVP manifest validation and `@wordrhyme/plugin-api` exports should remain minimal. Any new manifest fields/capability keys that become externally supported require a separate approved change.

**Choice**: Reserve extension points and capability declarations for visual editors, but defer implementation to post-MVP

**Why**:
- Visual editors require complex UI state management (selection, undo/redo, drag-drop)
- Plugins may want to extend editors (custom field types, toolbar buttons)
- Incorrect architecture now = costly refactor later
- MVP goal is plugin system validation, not CMS features

**Reserved Extension Points** (define types only, no implementation):
```typescript
type ExtensionPoint =
  | 'sidebar'
  | 'settings.page'
  | 'content.editor'         // Main editor area
  | 'content.editor.toolbar' // Toolbar extensions
  | 'content.field.renderer' // Custom field renderers
  | 'content.preview';       // Preview mode
```

**Reserved Manifest Capabilities** (define schema, no loader):
```json
{
  "capabilities": {
    "ui": {
      "editorComponent": false,   // Plugin provides editor UI
      "fieldRenderer": false       // Plugin provides field renderer
    }
  }
}
```

**Shared Dependencies Strategy** (document, defer config):
- Rich text editors: `@tiptap/react`, `slate`, or `lexical` (TBD)
- Drag-drop: `@dnd-kit/core` (if needed)
- All editor libraries MUST be singleton shared via Module Federation

**Data Model Separation**:
- `ContentEntry` (persistent): Store in database
- `EditorState` (ephemeral): Keep in frontend only
- Plugins access `ContentEntry` via Data Capability, never `EditorState`

**Implementation Timeline**:
- MVP: Define types and schemas (no runtime logic)
- Post-MVP Phase 1: Implement basic editor extension points
- Post-MVP Phase 2: Enable plugin-provided field renderers

**Alternatives Considered**:
- Implement full editor in MVP (rejected: scope creep, not architecture validation)
- Ignore editor architecture (rejected: high refactor risk)
- Make editor a plugin (considered: viable, but Core should provide base editor)

---

### Decision 27: Queue System Architecture (Future-Proofing)

**Choice**: BullMQ (Redis-based) for async task processing, defer implementation to post-MVP

**Why**:
- Plugins need async task execution (email, image processing, data sync)
- RUNTIME_GOVERNANCE.md requires task count limits and timeouts
- BullMQ is mature, Redis-based (already required), supports priorities and retries

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "queue": {
      "producer": false,  // Plugin can enqueue tasks
      "consumer": false   // Plugin can register task handlers
    }
  }
}
```

**Plugin API Interface** (define, no implementation):
```typescript
export interface QueueCapability {
  enqueue<T>(jobName: string, data: T, options?: {
    delay?: number;
    attempts?: number;
    priority?: number;
  }): Promise<JobId>;

  registerHandler<T>(
    jobName: string,
    handler: (data: T, ctx: PluginContext) => Promise<void>
  ): void;
}
```

**Worker Process Model**:
- PM2 configuration: `web` process + `worker` process
- Workers consume queue tasks in background
- Workers enforce same plugin isolation and resource limits

**Implementation Timeline**:
- MVP: Define API interface and capability schema (no runtime)
- Post-MVP Phase 1: Implement BullMQ integration
- Post-MVP Phase 2: Enable plugin-provided queue consumers

**Alternatives Considered**:
- Bee-Queue (rejected: less feature-rich than BullMQ)
- PostgreSQL-based queue (rejected: Redis already required, less performant)
- No queue system (rejected: plugins will need async tasks)

---

### Decision 28: Notification System Architecture (Future-Proofing)

**Choice**: Reserve extension points for notification system, defer implementation to post-MVP

**Why**:
- Plugins may need to send notifications to users
- Unified notification center improves UX
- Can be implemented as plugin, but Extension Points need reservation

**Reserved Extension Points**:
```typescript
type ExtensionPoint =
  | 'notification.center'    // Notification center UI
  | 'notification.item';     // Custom notification rendering
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "notifications": {
      "send": false,          // Send notification to user
      "subscribe": false      // Subscribe to system events
    }
  }
}
```

**Plugin API Interface** (define, no implementation):
```typescript
export interface NotificationCapability {
  send(userId: string, notification: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    link?: string;
  }): Promise<void>;
}
```

**Implementation Timeline**:
- MVP: Define types and schemas (no runtime)
- Post-MVP: Can be implemented as a plugin (notification-center)

**Alternatives Considered**:
- No notification system (rejected: poor UX, plugins will implement their own)
- WebSocket-based real-time (considered: can add later without breaking API)

---

### Decision 29: Content Versioning Architecture (Future-Proofing)

**Choice**: Reserve database schema for content versioning, defer implementation to post-MVP

**Why**:
- Content versioning is core CMS functionality
- Incorrect data model now = expensive migration later
- Plugins may need to access historical versions

**Reserved Data Model**:
```typescript
interface ContentEntry {
  id: string;
  type: string;
  status: 'draft' | 'published' | 'archived';  // Status field
  version: number;                              // Current version
  publishedVersion?: number;                    // Published version
  fields: Record<string, any>;
}

interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  fields: Record<string, any>;
  createdBy: string;
  createdAt: Date;
}
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "data": {
      "read": true,
      "write": true,
      "readVersions": false,    // Read historical versions
      "revertVersion": false    // Revert to previous version
    }
  }
}
```

**Implementation Timeline**:
- MVP: Define schema fields (status, version), no versions table
- Post-MVP Phase 1: Implement content_versions table
- Post-MVP Phase 2: Enable plugin access to versions

**Alternatives Considered**:
- No versioning (rejected: core CMS requirement)
- Event sourcing (rejected: too complex for MVP scope)

---

### Decision 30: Asset Management Architecture (Future-Proofing)

**Choice**: Reserve extension points for asset storage backends, defer implementation to post-MVP

**Why**:
- Plugins may provide custom storage (S3, Cloudinary, etc.)
- Asset management is common plugin use case
- Storage architecture affects deployment model

**Reserved Extension Points**:
```typescript
type ExtensionPoint =
  | 'asset.storage'      // Custom storage backend
  | 'asset.transformer'; // Image processing (crop, resize)
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "assets": {
      "upload": false,      // Upload assets
      "storage": false      // Provide storage backend
    }
  }
}
```

**Reserved Data Model**:
```typescript
interface Asset {
  id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageProvider: string; // 'local' | 'plugin:s3' | 'plugin:cloudinary'
  url: string;
  metadata?: Record<string, any>;
}
```

**Implementation Timeline**:
- MVP: Define Asset schema, no storage implementation
- Post-MVP: Implement local storage + plugin extension points

**Alternatives Considered**:
- Hardcode S3 (rejected: not flexible, vendor lock-in)
- No asset management (rejected: core CMS requirement)

---

### Decision 31: Public API Layer Architecture (Future-Proofing)

**Choice**: Reserve manifest fields for public API routes, defer implementation to post-MVP

**Why**:
- Plugins may need to expose public APIs (no authentication)
- Content Delivery API is common CMS pattern
- Rate limiting and API keys need architecture consideration

**Reserved Manifest Fields**:
```json
{
  "server": {
    "entry": "./dist/server.js",
    "routes": [
      {
        "method": "GET",
        "path": "/api/custom-data",
        "public": true,           // Public (no auth required)
        "rateLimit": 100          // Requests per minute
      }
    ]
  }
}
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "api": {
      "publicEndpoint": false  // Register public API
    }
  }
}
```

**Implementation Timeline**:
- MVP: Define manifest schema, no public route handling
- Post-MVP: Implement public API routing + rate limiting

**Alternatives Considered**:
- All APIs require auth (rejected: limits use cases)
- Separate API gateway (rejected: adds deployment complexity)

---

### Decision 32: Webhook System Architecture (Future-Proofing)

**Choice**: Reserve capabilities for webhook registration, defer implementation to post-MVP

**Why**:
- Plugins may need to notify external systems
- Webhooks are common integration pattern
- Security (signature verification) needs consideration

**Reserved Extension Points**:
```typescript
type ExtensionPoint =
  | 'webhook.handler'; // Handle incoming webhooks
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "webhooks": {
      "register": false,  // Register outgoing webhook
      "receive": false    // Receive incoming webhook
    }
  }
}
```

**Plugin API Interface** (define, no implementation):
```typescript
export interface WebhookCapability {
  register(event: string, url: string, options?: {
    secret?: string;
    headers?: Record<string, string>;
  }): Promise<WebhookId>;
}
```

**Implementation Timeline**:
- MVP: Define API interface and capability schema
- Post-MVP: Implement webhook delivery + signature verification

**Alternatives Considered**:
- Use queue system for webhooks (considered: webhooks need immediate delivery)
- No webhook system (rejected: common integration requirement)

---

### Decision 33: Scheduled Tasks Architecture (Future-Proofing)

**Choice**: Reserve capabilities for cron-like scheduled tasks, defer implementation to post-MVP

**Why**:
- Plugins may need periodic tasks (cleanup, sync, reports)
- Different from queue system (time-based vs event-based)
- Needs cluster-aware scheduling (only one node executes)

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "scheduler": {
      "register": false  // Register scheduled task
    }
  }
}
```

**Plugin API Interface** (define, no implementation):
```typescript
export interface SchedulerCapability {
  register(schedule: string, handler: () => Promise<void>, options?: {
    timezone?: string;
    enabled?: boolean;
  }): Promise<TaskId>;
}

// Usage example
ctx.scheduler.register('0 2 * * *', async () => {
  // Runs daily at 2 AM
  await cleanupOldData();
});
```

**Implementation Timeline**:
- MVP: Define API interface and capability schema
- Post-MVP: Implement with node-cron or BullMQ repeatable jobs

**Alternatives Considered**:
- Use queue system with delays (rejected: not suitable for recurring tasks)
- External cron (rejected: doesn't integrate with plugin lifecycle)

---

### Decision 34: Audit Log Architecture (Future-Proofing)

**Choice**: Reserve database schema for audit logs, defer implementation to post-MVP

**Why**:
- Security and compliance requirement
- Plugin actions need to be auditable
- Data model must support efficient querying

**Reserved Data Model**:
```typescript
interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  pluginId?: string;        // Which plugin performed action
  action: string;           // 'content.create', 'plugin.install', etc.
  resource: string;         // Resource ID
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
```

**Reserved Capabilities**:
```json
{
  "capabilities": {
    "audit": {
      "write": false,  // Write audit logs (auto-granted to all plugins)
      "read": false    // Read audit logs (admin only)
    }
  }
}
```

**Implementation Timeline**:
- MVP: Define schema, no audit logging
- Post-MVP: Implement automatic audit logging for sensitive operations

**Alternatives Considered**:
- No audit logs (rejected: security requirement)
- External logging service (considered: can add later without breaking schema)

---

### Decision 35: Plugin Configuration UI Architecture (Future-Proofing)

**Choice**: Reserve extension points for plugin settings UI, defer implementation to post-MVP

**Why**:
- Plugins need configuration interfaces
- Settings page already exists, but needs structured approach
- Form schema validation needs consideration

**Reserved Extension Points**:
```typescript
type ExtensionPoint =
  | 'settings.page'
  | 'settings.section'     // Section within settings page
  | 'settings.field';      // Custom field type
```

**Reserved Manifest Fields**:
```json
{
  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "settings": {
      "schema": {
        "apiKey": { "type": "string", "secret": true },
        "enabled": { "type": "boolean", "default": true }
      }
    }
  }
}
```

**Implementation Timeline**:
- MVP: settings.page extension point exists
- Post-MVP: Implement schema-driven settings UI

**Alternatives Considered**:
- Plugins build own settings UI (rejected: inconsistent UX)
- No settings UI (rejected: poor DX)

---

### Decision 36: Testing Strategy (MVP Scope)

**Choice**: Minimal testing for MVP - focus on critical paths only

**Why**:
- MVP goal is to validate architecture, not production readiness
- Time-to-market prioritized over test coverage
- Critical paths (plugin loading, tRPC routing) need validation
- UI testing deferred to post-MVP
- Can add comprehensive tests incrementally

**Testing Scope**:

**Unit Tests** (Vitest):
```typescript
// Test critical business logic only
apps/server/src/plugins/__tests__/
├── plugin-manager.test.ts       // Plugin install/uninstall
├── version-validator.test.ts    // Version compatibility
└── manifest-schema.test.ts      // Manifest validation

apps/server/src/errors/__tests__/
└── error-helpers.test.ts        // Error code mapping
```

**Integration Tests** (Vitest):
```typescript
// Test plugin system end-to-end
apps/server/src/__tests__/integration/
├── plugin-lifecycle.test.ts     // Load → Enable → Disable → Unload
├── trpc-routing.test.ts         // Dynamic router registration
└── database-capability.test.ts  // Plugin DB access
```

**E2E Tests**: ❌ Deferred to post-MVP
- Reason: Complex setup, slow execution
- Alternative: Manual testing checklist

**Test Configuration**:

```typescript
// vitest.config.ts (apps/server)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/main.ts',
      ],
      // MVP: No strict coverage requirements
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
```

**Test Setup**:

```typescript
// apps/server/src/__tests__/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../db';

beforeAll(async () => {
  // Setup test database
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/wordrhyme_test';
  await db.execute('CREATE SCHEMA IF NOT EXISTS test');
});

afterEach(async () => {
  // Clean up test data
  await db.execute('TRUNCATE TABLE plugins CASCADE');
});

afterAll(async () => {
  // Cleanup
  await db.execute('DROP SCHEMA test CASCADE');
});
```

**Example Tests**:

```typescript
// apps/server/src/plugins/__tests__/version-validator.test.ts
import { describe, it, expect } from 'vitest';
import { PluginVersionValidator } from '../version-validator';

describe('PluginVersionValidator', () => {
  const validator = new PluginVersionValidator();

  it('should pass validation for compatible versions', () => {
    const manifest = {
      pluginId: 'com.test.plugin',
      peerDependencies: {
        'react': '^18.0.0',
      },
      compatibilityMode: 'lenient',
    };

    const result = validator.validate(manifest);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail validation for incompatible major versions in strict mode', () => {
    const manifest = {
      pluginId: 'com.test.plugin',
      peerDependencies: {
        'react': '^17.0.0',
      },
      compatibilityMode: 'strict',
    };

    const result = validator.validate(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

**Scripts**:

```json
// apps/server/package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Manual Testing Checklist** (MVP):

```markdown
## Plugin Lifecycle
- [ ] Upload ZIP file via Admin UI
- [ ] Plugin appears in plugin list
- [ ] Enable plugin
- [ ] Plugin tRPC routes accessible
- [ ] Plugin Admin UI loads
- [ ] Disable plugin
- [ ] Plugin routes no longer accessible
- [ ] Uninstall plugin

## Version Compatibility
- [ ] Install plugin with compatible versions
- [ ] Install plugin with incompatible versions (should show warning)
- [ ] Version warnings display in UI

## Database Access
- [ ] Plugin can query data
- [ ] Plugin can insert data
- [ ] Multi-tenant isolation works (data scoped to tenantId)
```

**Post-MVP Testing Roadmap**:
1. Increase unit test coverage to 70%+
2. Add E2E tests with Playwright
3. Add visual regression tests
4. Add performance benchmarks
5. Add security testing (OWASP)

**Alternatives Considered**:
- Jest (rejected: Vitest is faster, better ESM support)
- Comprehensive testing from start (rejected: slows MVP)
- No testing (rejected: too risky for plugin system)

---

### Decision 37: Build Optimization Strategy

**Choice**: Basic optimization for MVP, defer advanced optimizations to post-MVP

**Why**:
- MVP prioritizes functionality over performance
- Basic optimizations (minification, tree-shaking) are free
- Advanced optimizations (code splitting, lazy loading) add complexity
- Can measure and optimize based on real usage data

**Rspack Configuration** (Admin):

```typescript
// apps/admin/rspack.config.ts
import { defineConfig } from '@rspack/cli';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

export default defineConfig({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',

  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin(),
      new rspack.LightningCssMinimizerRspackPlugin(),
    ],

    // Basic code splitting
    splitChunks: {
      chunks: 'async',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
      },
    },

    // Tree shaking (enabled by default in production)
    usedExports: true,
    sideEffects: true,
  },

  // Source maps
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'cheap-module-source-map',

  // Cache (development only)
  cache: process.env.NODE_ENV === 'development' ? {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  } : false,

  plugins: [
    new ModuleFederationPlugin({
      // ... MF config
    }),

    // Bundle analyzer (optional)
    process.env.ANALYZE && new rspack.BundleAnalyzerPlugin(),
  ].filter(Boolean),
});
```

**Next.js Configuration** (Web):

```typescript
// apps/web/next.config.js
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

module.exports = {
  // Production optimizations (enabled by default)
  swcMinify: true,
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },

  webpack: (config, { dev, isServer }) => {
    // Module Federation
    config.plugins.push(
      new NextFederationPlugin({
        // ... MF config
      })
    );

    // Production optimizations
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            framework: {
              name: 'framework',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
              priority: 40,
              enforce: true,
            },
          },
        },
      };
    }

    return config;
  },

  env: {
    NEXT_PRIVATE_LOCAL_WEBPACK: 'true',
  },
};
```

**Server Build** (NestJS):

```json
// apps/server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "removeComments": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

```json
// apps/server/package.json
{
  "scripts": {
    "build": "tsc",
    "build:analyze": "tsc --listFiles > build-output.txt"
  }
}
```

**Bundle Analysis**:

```json
// package.json (root)
{
  "scripts": {
    "analyze:admin": "cd apps/admin && ANALYZE=true pnpm build",
    "analyze:web": "cd apps/web && ANALYZE=true pnpm build"
  }
}
```

**Performance Budgets** (MVP Baseline):

| App | Metric | Target | Current |
|-----|--------|--------|---------|
| Admin | Initial JS | < 500KB | TBD |
| Admin | Initial CSS | < 100KB | TBD |
| Admin | FCP | < 2s | TBD |
| Web | Initial JS | < 300KB | TBD |
| Web | LCP | < 2.5s | TBD |
| Server | Startup | < 5s | TBD |

**Deferred Optimizations** (Post-MVP):

1. **Code Splitting**:
   - Route-based splitting
   - Component lazy loading
   - Dynamic imports for heavy libraries

2. **Asset Optimization**:
   - Image optimization pipeline
   - Font subsetting
   - SVG sprite generation

3. **Caching Strategy**:
   - Service Worker
   - HTTP caching headers
   - CDN integration

4. **Runtime Performance**:
   - React.memo optimization
   - Virtual scrolling for long lists
   - Debouncing/throttling

5. **Build Performance**:
   - Persistent cache
   - Parallel builds
   - Incremental builds

**Monitoring** (Post-MVP):

```typescript
// Future: Add performance monitoring
import { init } from '@sentry/nextjs';

init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
});
```

**Alternatives Considered**:
- Aggressive optimization from start (rejected: premature optimization)
- No optimization (rejected: poor user experience)
- Webpack instead of Rspack (rejected: slower build times)

---

### Decision 38: NestJS + Zod + Drizzle 集成策略

**Choice**: 直接在 tRPC 中使用 Zod 和 Drizzle，不使用 nestjs-zod 和 nestjs-drizzle

**Why**:
- 我们的架构使用 tRPC 作为 API 层，而不是 NestJS Controller
- tRPC 原生支持 Zod 验证
- Drizzle 可以直接在 tRPC context 中使用
- 避免第三方包的 ES modules 兼容性问题
- 更简单、更直接的集成方式

**实现方式**:

```typescript
// ===== Drizzle 集成 =====
// apps/server/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

```typescript
// ===== tRPC Context 注入 =====
// apps/server/src/trpc/context.ts
import { db } from '../db';

export async function createContext({ req, res }) {
  const ctx = asyncLocalStorage.getStore();

  return {
    db,                          // ✅ Drizzle instance
    tenantId: ctx?.tenantId,     // Organization ID
    userId: ctx?.userId,
    role: ctx?.role,
  };
}
```

```typescript
// ===== Zod + Drizzle 自动生成 Schema =====
// apps/server/src/db/schema/products.ts
import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
});

// ✅ 自动生成 Zod schema
export const insertProductSchema = createInsertSchema(products);
export const selectProductSchema = createSelectSchema(products);
```

```typescript
// ===== tRPC Router 使用 =====
// apps/server/src/trpc/routers/product.ts
import { router, publicProcedure } from '../trpc';
import { insertProductSchema } from '../../db/schema/products';

export const productRouter = router({
  create: publicProcedure
    .input(insertProductSchema)  // ✅ Zod 验证
    .mutation(async ({ input, ctx }) => {
      return ctx.db.insert(products).values({
        ...input,
        organizationId: ctx.tenantId,  // ✅ 自动添加租户隔离
      });
    }),
});
```

**NestJS 的作用**:
- ✅ 应用启动和配置
- ✅ 中间件管理（auth、context）
- ✅ 依赖注入（如果需要）
- ❌ 不用于 API 路由（由 tRPC 负责）

**ES Modules 支持**:
- ✅ Drizzle 原生支持 ESM
- ✅ tRPC 原生支持 ESM
- ✅ Zod 原生支持 ESM
- ✅ 不依赖第三方包

**Alternatives Considered**:
- nestjs-drizzle (rejected: 不需要，Drizzle 可以直接使用)
- nestjs-zod (rejected: 不需要，tRPC 原生支持 Zod)

---

### Decision 39: 权限系统实现（RBAC）

**Choice**: MVP 使用 RBAC（基于角色的访问控制）

**Why**:
- 简单直接，易于实现
- 符合 better-auth organization plugin 的设计
- 满足 MVP 需求（Organization 级别权限）
- 未来可扩展到 ABAC（基于属性的访问控制）

**RBAC vs ABAC 对比**:

| 特性 | RBAC | ABAC |
|------|------|------|
| **复杂度** | ✅ 简单 | ❌ 复杂 |
| **灵活性** | ⚠️ 有限 | ✅ 非常灵活 |
| **适用场景** | MVP、简单权限 | 企业级、复杂规则 |
| **示例** | `user.role === 'admin'` | `user.role === 'admin' && resource.status === 'draft'` |

**MVP 实现**:

```typescript
// ===== 角色定义 =====
// Organization 级别角色（better-auth organization plugin）
type OrganizationRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer';

// 角色权限映射
const rolePermissions: Record<OrganizationRole, string[]> = {
  owner: ['*'],  // 所有权限
  admin: ['product:*', 'order:*', 'user:read', 'user:write'],
  editor: ['product:write', 'product:read', 'order:read'],
  member: ['product:read', 'order:read'],
  viewer: ['product:read'],
};
```

```typescript
// ===== 权限检查 =====
// apps/server/src/services/permission.service.ts
export class PermissionService {
  can(user: User, action: string, organizationId: string): boolean {
    // 1. 检查用户是否属于该 Organization
    const membership = user.memberships.find(
      m => m.organizationId === organizationId
    );

    if (!membership) return false;

    // 2. 检查角色权限
    const permissions = rolePermissions[membership.role];

    // 3. 通配符匹配
    return permissions.includes('*') ||
           permissions.includes(action) ||
           permissions.some(p => p.endsWith(':*') && action.startsWith(p.slice(0, -1)));
  }
}
```

```typescript
// ===== tRPC Middleware =====
// apps/server/src/trpc/middleware/permission.ts
export const requirePermission = (action: string) => {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.userId || !ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const canAccess = permissionService.can(
      ctx.userId,
      action,
      ctx.tenantId
    );

    if (!canAccess) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next();
  });
};
```

```typescript
// ===== 使用示例 =====
export const productRouter = router({
  create: publicProcedure
    .use(requirePermission('product:write'))
    .input(insertProductSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.db.insert(products).values(input);
    }),
});
```

**未来扩展到 ABAC**:

```typescript
// 未来：基于属性的访问控制
can(user, 'edit', product) {
  return (
    user.role === 'admin' ||
    (user.role === 'editor' && product.status === 'draft') ||
    (product.authorId === user.id && product.status === 'draft')
  );
}
```

**Alternatives Considered**:
- ABAC (rejected: MVP 过于复杂)
- CASL (rejected: 额外依赖，RBAC 足够)
- 自定义权限表 (rejected: better-auth 已提供角色系统)

---

### Decision 39.5: Cross-Plugin Permission Dependencies Policy

**Choice**: **禁止插件间权限依赖** (Plugins cannot depend on other plugin permissions)

**Why**:
- **Isolation**: 插件必须独立运行，不应假设其他插件存在
- **Security**: 防止插件通过依赖链获取未声明的权限
- **Lifecycle**: 插件A卸载不应影响插件B的功能
- **Future-proof**: 为Event-based插件协作保留设计空间

**Rules**:
1. ❌ **禁止**: Plugin A依赖 `plugin:B:*` 权限
2. ✅ **允许**: Plugin A依赖 Core权限 (如 `content:read:space`)
3. ✅ **允许**: 未来通过Core-mediated Events协作 (v1.0+)

**Implementation**:
```typescript
// apps/server/src/plugins/manifest-validator.ts
export function validatePluginManifest(manifest: PluginManifest) {
  // 检查权限依赖
  if (manifest.permissions?.required) {
    for (const perm of manifest.permissions.required) {
      // 禁止依赖其他插件权限
      if (perm.startsWith('plugin:') && !perm.startsWith(`plugin:${manifest.pluginId}:`)) {
        throw new ManifestValidationError(
          `Plugin ${manifest.pluginId} cannot depend on other plugin permissions: ${perm}`
        );
      }
    }
  }

  // 检查权限声明
  if (manifest.permissions?.definitions) {
    for (const def of manifest.permissions.definitions) {
      // 禁止声明保留命名空间权限
      if (def.key.startsWith('core:') || def.key.startsWith('system:')) {
        throw new ManifestValidationError(
          `Plugin permissions cannot use reserved namespaces: ${def.key}`
        );
      }
    }
  }
}
```

**Example: Valid Plugin Manifest**
```json
{
  "pluginId": "com.vendor.seo",
  "permissions": {
    "definitions": [
      { "key": "settings.read", "description": "Read SEO settings" },
      { "key": "settings.write", "description": "Modify SEO settings" }
    ],
    "required": [
      "content:read:space",  // ✅ Core权限，允许
      "content:update:space" // ✅ Core权限，允许
    ]
  }
}
```

**Example: Invalid Plugin Manifest**
```json
{
  "pluginId": "com.vendor.analytics",
  "permissions": {
    "required": [
      "plugin:seo:settings.read" // ❌ 其他插件权限，禁止
    ]
  }
}
```

**Future: Plugin Collaboration via Events (v1.0+)**
```typescript
// 未来：插件通过Event协作，不依赖权限
// Plugin A 发出事件
ctx.events.emit('content.published', { contentId: '123' });

// Plugin B 订阅事件（需要在manifest声明）
export const onContentPublished = async (event, ctx) => {
  // Plugin B可以响应，但不需要Plugin A的权限
  await sendSEOUpdate(event.contentId);
};
```

**Alternatives Considered**:
- 允许插件间权限依赖 (rejected: 破坏隔离性，增加攻击面)
- 使用Capability Token共享 (rejected: 复杂度高，未来可考虑)

---

### Decision 40: 未来 API 扩展架构（REST/GraphQL）

**Choice**: 三层 API 架构 - tRPC (内部) + REST (对外) + GraphQL (对外)

**Why**:
- MVP 使用 tRPC（类型安全、开发体验好）
- 未来支持对外 API（第三方集成、移动端）
- 复用业务逻辑，避免重复代码
- 灵活扩展，不影响现有架构

**架构设计**:

```
┌──────────────────────────────────────────────────────┐
│                  Presentation Layer                   │
├──────────────────────────────────────────────────────┤
│  tRPC API    │  REST API    │  GraphQL API           │
│  (内部)       │  (对外)       │  (对外)                │
│  Admin/Web   │  第三方集成    │  移动端/灵活查询        │
├──────────────────────────────────────────────────────┤
│              Business Logic Layer (共享)              │
│              ProductService, OrderService...         │
├──────────────────────────────────────────────────────┤
│              Data Access Layer (共享)                 │
│              Drizzle ORM                             │
└──────────────────────────────────────────────────────┘
```

**方案 1: tRPC + tRPC-OpenAPI (简单)**

```typescript
// 使用 tRPC-OpenAPI 自动生成 REST API
import { generateOpenApiDocument } from 'trpc-openapi';

export const productRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/products' } })
    .input(z.object({ page: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return productService.list(input);
    }),
});

// 自动生成 OpenAPI 文档
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'WordRhyme API',
  version: '1.0.0',
});
```

**优势**: 自动生成 REST API，无需额外代码
**劣势**: REST API 受限于 tRPC 设计

**方案 2: Service Layer + 多 API 层 (灵活，推荐)**

```typescript
// ===== Business Logic Layer (共享) =====
@Injectable()
export class ProductService {
  async list(params: ListProductsParams) {
    return this.db.query.products.findMany({
      where: eq(products.organizationId, params.organizationId),
    });
  }
}

// ===== tRPC API (内部) =====
export const productRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return productService.list({ organizationId: ctx.tenantId });
  }),
});

// ===== REST API (对外) =====
@Controller('api/v1/products')
export class ProductController {
  @Get()
  async list(@Query() query: ListProductsDto) {
    return this.productService.list(query);
  }
}

// ===== GraphQL API (对外) =====
@Resolver(() => Product)
export class ProductResolver {
  @Query(() => [Product])
  async products(@Args('organizationId') organizationId: string) {
    return this.productService.list({ organizationId });
  }
}
```

**GraphQL 集成**:

```typescript
// apps/server/src/app.module.ts
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      autoSchemaFile: true,  // Code First
      playground: true,
    }),
  ],
})
export class AppModule {}
```

**实现时机**:
- **MVP**: 只用 tRPC（内部 API）
- **Post-MVP**: 根据需求添加 REST/GraphQL

**Alternatives Considered**:
- 只用 REST (rejected: 失去 tRPC 的类型安全优势)
- 只用 GraphQL (rejected: 学习曲线高，MVP 过度设计)
- 分离服务 (rejected: 增加部署复杂度)

---

## Risks / Trade-offs

### Risk 1: Module Federation Browser Compatibility

**Risk**: MF 2.0 may have edge cases in older browsers (Safari, mobile)

**Mitigation**:
- Document required browser versions (Chrome 90+, Firefox 88+, Safari 14+)
- Test reference plugin in all target browsers
- Use MF 2.0 stable release (not beta/RC)

**Trade-off**: Accept limited browser support for MVP (can polyfill later)

---

### Risk 2: Drizzle ORM Maturity

**Risk**: Drizzle is newer than Prisma/TypeORM, may have fewer resources

**Mitigation**:
- Use only stable Drizzle features (basic CRUD, migrations)
- Avoid advanced features (multi-DB, complex joins) for MVP
- Keep Core queries simple (can refactor later if needed)

**Trade-off**: Faster startup vs. ecosystem maturity (acceptable for MVP)

---

### Risk 3: Plugin Security (Untrusted Code)

**Risk**: MVP will not ship “strong sandbox” isolation (WASM/VM) and must still obey Runtime Governance invariants.

**Mitigation**:
- Use **Logical Isolation (In-Process)** with `try/catch` and manual timeout checks for MVP
- Enforce the Runtime Adapter as the *only* execution entrypoint
- Document clearly: **MVP is not for running untrusted third-party plugins**
- Keep the design compatible with future stronger isolation (Worker/WASM) without changing the Plugin API surface

**Trade-off**: Security vs. complexity (defer to v1.x as per contract)

---

### Risk 4: PM2 Dependency for Development

**Risk**: Developers may not want to run PM2 locally (prefer `npm run dev`)

**Mitigation**:
- Support both modes:
  - **Development**: `pnpm dev` (no PM2, manual restart, hot reload via nodemon)
  - **Production-like**: `pm2 start ecosystem.config.js` (tests rolling reload)
- Document when PM2 is required (integration tests, reload testing)

**Trade-off**: DX flexibility vs. production parity

---

## Migration Plan

**N/A** - This is the first implementation (no existing system to migrate).

**Rollback**:
- If MVP validation fails (contracts unimplementable), freeze implementation and update contracts
- Git tag `v0.1-alpha.1` allows reverting to pure architecture docs

---

## Open Questions

### Q1: Authentication Integration Timing

**Question**: Should MVP include better-auth integration, or stub authentication?

**Options**:
1. Full better-auth integration (OAuth, session management)
2. Hardcoded admin user in DB (fast, minimal)
3. JWT-only (no session, stateless)

**Recommendation**: **Option 2 (hardcoded admin)** for MVP
- Reason: Authentication is not being validated by MVP (permission kernel is)
- Can integrate better-auth post-MVP without contract changes

---

### Q2: Plugin API Versioning

**Question**: Should `@wordrhyme/plugin-api` version be separate from Core version?

**Options**:
1. Same version (Core 0.1.0 → Plugin API 0.1.0)
2. Independent versioning (Core 0.1.0 → Plugin API 1.0.0)

**Recommendation**: **Option 1 (same version)** for MVP
- Reason: Simpler for MVP, plugins declare `engines.wordrhyme: "0.1.x"`
- Can decouple later if API stabilizes faster than Core

---

### Q3: Plugin Storage Location

**Question**: Should `/plugins` be configurable, or hardcoded?

**Options**:
1. Hardcoded `/plugins` (relative to server root)
2. Configurable via `PLUGIN_DIR` env var
3. Configurable per-tenant (multi-tenancy)

**Recommendation**: **Option 2 (env var)** for MVP
- Reason: Allows Docker volume mounts, NFS paths
- Default to `./plugins` in development

---

### Q4: Admin UI Authentication

**Question**: How does Admin UI authenticate API requests?

**Options**:
1. Session cookies (better-auth)
2. JWT in localStorage
3. No auth for MVP (trust localhost)

**Recommendation**: **Option 3 (no auth)** for MVP
- Reason: Localhost-only, focus on plugin loading mechanics
- Add better-auth post-MVP

---

## Implementation Notes

### Code Quality Standards

- TypeScript strict mode (required by CLAUDE.md)
- ESLint errors must be fixed (warnings allowed for MVP)
- All Core modules must have JSDoc comments (public API)
- Plugin API must have full TSDoc documentation

### Testing Requirements

- Unit tests for permission checks (critical path)
- Integration test for plugin lifecycle
- Manual test: Reference plugin loads in Admin UI
- Manual test: Rolling reload works with PM2

### Performance Targets (MVP Baseline)

- Server startup: < 3 seconds (without plugins)
- Server startup: < 5 seconds (with 1 plugin)
- Plugin install: < 10 seconds (extract + reload)
- Admin UI load: < 2 seconds (first paint)

### Security Notes

- **DO NOT** implement plugin signature verification (defer to v1.x)
- **DO** enforce capability white-listing at injection time (undeclared capability = not present)
- **DO** enforce permission checks at Capability boundaries (plugins cannot bypass by “not calling can()”)
- **DO** validate plugin manifest schema (prevent malformed JSON)
- **DO** sanitize plugin IDs (prevent directory traversal)

---

## Success Criteria Checklist (MVP Adjusted)

The MVP design is successful if implementation can demonstrate:

- ✅ Server boots following simplified bootstrap flow
- ✅ Reference plugin installs, enables, disables, uninstalls **without restart**
- ✅ Reference plugin UI appears in Admin sidebar via Module Federation
- ✅ Plugin methods callable via `trpc.plugin.call` gateway
- ⚠️ Permission checks (simplified: no fine-grained enforcement for MVP)
- ⚠️ Multi-tenant context (basic isolation, no cross-tenant validation)
- ⚠️ Hot reload works (single-node `import()` cache busting, no PM2/Redis)
- ⚠️ Contract compliance **deferred** (see Decision 3 simplifications)

**Key Changes from Original**:
- ❌ Removed: "No governance contract violations (100% compliance)" - MVP pragmatically simplifies contracts
- ✅ Added: "Plugin install without restart" - Core MVP requirement
- ⚠️ Adjusted: Rolling reload simplified to single-node hot reload (no cluster)

---

## v2.0 Evolution: WASM Sandbox Target Architecture

> **Note**: This section documents the **long-term vision** for plugin isolation. MVP uses logical isolation (Decision 3). v1.0 may use Worker/Process. v2.0 is the target state.

### Why WASM for Plugin Isolation?

**Problems with Current Approaches**:

| Approach | Memory Overhead | Security | Startup Time | Ecosystem |
|----------|----------------|----------|--------------|-----------|
| **Logical Isolation** (MVP) | ✅ Minimal | ❌ None | ✅ Instant | ✅ Full Node.js |
| **Worker Thread** | ⚠️ ~20MB/plugin | ⚠️ Thread-level | ⚠️ 50-200ms | ✅ Full Node.js |
| **Child Process** (VS Code) | ❌ ~50MB/plugin | ✅ Process-level | ❌ 100-500ms | ✅ Full Node.js |
| **WASM** (v2.0 target) | ✅ ~5MB/plugin | ✅ Memory-isolated | ✅ 10-50ms | ⚠️ WASI subset |

**WASM Advantages**:
1. **True Memory Isolation**: Linear memory sandbox, cannot access host memory
2. **Lightweight**: 10x smaller than process isolation
3. **Fast Startup**: Compile once, instantiate quickly
4. **Capability-based**: Can only call imported functions (natural capability model)
5. **Cross-platform**: Run in Node.js, Edge, Browser (same binary)

### v2.0 Architecture Overview

```typescript
// ===== v2.0: WASM Runtime Implementation =====
import { WASI } from 'wasi';

class WASMRuntime implements PluginRuntime {
  private instances = new Map<string, WebAssembly.Instance>();

  async load(pluginId: string, wasmPath: string, manifest: PluginManifest) {
    // 1. Create WASI instance with limited capabilities
    const wasi = new WASI({
      version: 'preview1',

      // Only expose declared capabilities via preopens
      preopens: this.buildPreopens(manifest.capabilities),

      // Environment isolation
      env: {
        PLUGIN_ID: pluginId,
        // No access to host env vars
      },

      // Redirect stdout/stderr to plugin logger
      stdout: this.createPluginLogger(pluginId, 'info'),
      stderr: this.createPluginLogger(pluginId, 'error'),
    });

    // 2. Load and compile WASM module
    const wasmBuffer = await fs.readFile(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBuffer);

    // 3. Create imports (capability injection)
    const imports = {
      wasi_snapshot_preview1: wasi.wasiImport,

      // Custom capability APIs (host functions)
      wordrhyme: {
        // Data capability
        db_query: this.createCapabilityFunction('data.read', async (ptr, len) => {
          const sql = this.readString(instance, ptr, len);
          const result = await db.query(sql);
          return this.writeJSON(instance, result);
        }),

        // Permission capability
        check_permission: this.createCapabilityFunction('permissions.check', (capPtr, capLen) => {
          const capability = this.readString(instance, capPtr, capLen);
          return permissionService.can(pluginId, capability) ? 1 : 0;
        }),

        // Logger capability (always available)
        log: (level, msgPtr, msgLen) => {
          const message = this.readString(instance, msgPtr, msgLen);
          console.log(`[${pluginId}] [${level}] ${message}`);
        },
      },
    };

    // 4. Instantiate WASM module
    const instance = await WebAssembly.instantiate(wasmModule, imports);
    this.instances.set(pluginId, instance);

    // 5. Initialize WASI
    wasi.start(instance);

    // 6. Call lifecycle hook
    if (instance.exports.onEnable) {
      instance.exports.onEnable();
    }
  }

  async execute(pluginId: string, method: string, params: any) {
    const instance = this.instances.get(pluginId);
    if (!instance) throw new Error('Plugin not loaded');

    // 1. Serialize params to WASM memory
    const paramsPtr = this.writeJSON(instance, params);

    // 2. Call plugin function (type-safe via Component Model)
    const resultPtr = instance.exports[method](paramsPtr);

    // 3. Deserialize result from WASM memory
    return this.readJSON(instance, resultPtr);
  }

  private buildPreopens(capabilities: ManifestCapabilities) {
    const preopens: Record<string, string> = {};

    // Data capability → mount plugin data directory
    if (capabilities.data?.read || capabilities.data?.write) {
      preopens['/data'] = `/plugins-data/${pluginId}`;
    }

    // No file system access by default
    return preopens;
  }

  private createCapabilityFunction(capability: string, fn: Function) {
    return async (...args: any[]) => {
      // Enforce capability check
      if (!manifest.capabilities[capability]) {
        throw new Error(`Capability ${capability} not declared in manifest`);
      }
      return fn(...args);
    };
  }

  // Memory helpers (string/JSON serialization between JS ↔ WASM)
  private readString(instance: WebAssembly.Instance, ptr: number, len: number): string {
    const memory = new Uint8Array(instance.exports.memory.buffer, ptr, len);
    return new TextDecoder().decode(memory);
  }

  private writeJSON(instance: WebAssembly.Instance, obj: any): number {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);

    // Allocate memory in WASM
    const ptr = instance.exports.alloc(bytes.length);
    const memory = new Uint8Array(instance.exports.memory.buffer);
    memory.set(bytes, ptr);

    return ptr;
  }
}
```

### Plugin Development (v2.0)

**Option 1: Rust Plugin**
```rust
// ===== examples/plugin-analytics-wasm/src/lib.rs =====
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct TrackEventParams {
    event: String,
    page: String,
}

#[derive(Serialize)]
struct TrackEventResult {
    success: bool,
    timestamp: i64,
}

// Export function to WASM
#[no_mangle]
pub extern "C" fn track_event(params_ptr: *const u8, params_len: usize) -> *const u8 {
    // 1. Deserialize params from memory
    let params: TrackEventParams = unsafe {
        let slice = std::slice::from_raw_parts(params_ptr, params_len);
        serde_json::from_slice(slice).unwrap()
    };

    // 2. Call host function (capability)
    unsafe {
        wordrhyme_log(1, "Tracking event".as_ptr(), 14);
    }

    // 3. Business logic
    let result = TrackEventResult {
        success: true,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
    };

    // 4. Serialize result
    let json = serde_json::to_vec(&result).unwrap();
    let ptr = alloc(json.len());
    unsafe {
        std::ptr::copy_nonoverlapping(json.as_ptr(), ptr, json.len());
    }
    ptr
}

// Import host capabilities
extern "C" {
    fn wordrhyme_log(level: i32, msg_ptr: *const u8, msg_len: usize);
    fn wordrhyme_db_query(sql_ptr: *const u8, sql_len: usize) -> *const u8;
}

// Memory allocator
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let layout = std::alloc::Layout::from_size_align(size, 1).unwrap();
    unsafe { std::alloc::alloc(layout) }
}
```

**Option 2: AssemblyScript Plugin (TypeScript-like)**
```typescript
// ===== examples/plugin-analytics-wasm/assembly/index.ts =====
import { JSON } from "json-as";

@json
class TrackEventParams {
  event: string;
  page: string;
}

@json
class TrackEventResult {
  success: boolean;
  timestamp: i64;
}

// Import host capabilities
declare function wordrhyme_log(level: i32, msg: string): void;
declare function wordrhyme_db_query(sql: string): string;

// Export handler
export function track_event(params_json: string): string {
  const params = JSON.parse<TrackEventParams>(params_json);

  wordrhyme_log(1, `Tracking: ${params.event} on ${params.page}`);

  const result = new TrackEventResult();
  result.success = true;
  result.timestamp = Date.now();

  return JSON.stringify(result);
}
```

### Migration Path: MVP → v1.0 → v2.0

**Phase 1: MVP (Current)**
- Logical isolation (direct `import()`)
- JavaScript plugins only
- Same process, no security boundaries

**Phase 2: v1.0 (Production Hardening)**
- Worker Thread or Child Process isolation
- JavaScript plugins (unchanged API)
- Resource limits enforced
- Capability proxying via IPC

**Phase 3: v2.0 (WASM Sandbox)**
- WASM isolation + WASI
- Support JS plugins via QuickJS/WASM or continue Process isolation for JS
- New plugins can be written in Rust/Go/C++/AssemblyScript
- True Capability-based Security

**Key Principle**: Plugin API (`@wordrhyme/plugin-api`) remains stable across all phases.

```typescript
// Plugin code (unchanged from MVP to v2.0)
export const handlers = {
  async trackEvent(params: TrackEventParams, ctx: PluginContext) {
    ctx.logger.info('Tracking event', params);
    return { success: true };
  },
};
```

**What Changes**:
- MVP: `ctx.logger` = direct `console` reference
- v1.0: `ctx.logger` = proxied logger via IPC
- v2.0: `ctx.logger` = WASM host function call

### v2.0 Performance Targets

| Metric | v1.0 (Worker/Process) | v2.0 (WASM) |
|--------|----------------------|-------------|
| **Memory per plugin** | 20-50 MB | 5-10 MB |
| **Startup time** | 50-500 ms | 10-50 ms |
| **Call overhead** | ~1ms (IPC) | ~0.1ms (direct) |
| **Max concurrent plugins** | 50 (limited by memory) | 500+ |

### v2.0 Ecosystem Considerations

**Supported Languages** (WASM target):
- ✅ Rust (best support, `wasm32-wasi`)
- ✅ Go (TinyGo for small binaries)
- ✅ AssemblyScript (TypeScript-like, easy for JS devs)
- ✅ C/C++ (existing libraries)
- ⚠️ JavaScript (via QuickJS WASM or fallback to Process isolation)

**WASI Capabilities** (what plugins can do):
- ✅ File I/O (via preopens)
- ✅ Environment variables (controlled)
- ✅ Clocks / Random
- ❌ Network (must use host capability)
- ❌ Threads (single-threaded WASM)
- ❌ Dynamic linking (static linking only)

**Trade-offs**:
- ❌ Lose Node.js ecosystem (no `npm` packages directly)
- ✅ Gain multi-language support
- ✅ Gain true security isolation
- ✅ Gain performance (smaller, faster)

### Implementation Timeline

- **2025 Q1**: MVP (logical isolation)
- **2025 Q2**: v1.0 (Worker/Process isolation)
- **2025 Q3**: v2.0 prototype (WASM runtime + Rust SDK)
- **2025 Q4**: v2.0 stable (production WASM support)

---

## Supplementary Decisions (补充设计)

以下决策补充了 MVP 实现所需的技术细节。详细实现代码请参见各 spec 文件。

---

### Decision 25: NestJS + tRPC 集成策略

**Choice**: NestJS 薄壳 + tRPC 核心 (A2 方案)

**Why**:
- 保留 NestJS 生态 (DI、模块化、生命周期钩子)
- tRPC 处理所有 API 逻辑 (类型安全、优秀 DX)
- NestJS 仅负责基础设施 (数据库连接、中间件、静态文件)
- 不使用 NestJS Controller，避免概念混淆

**模块初始化顺序**: DatabaseModule → ContextModule → AuthModule → PluginModule → TrpcModule

> 📁 **详细实现**: [specs/nestjs-integration/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/nestjs-integration/spec.md)

---

### Decision 26: 完整数据库 Schema 定义

**Choice**: 复用 better-auth 表 + 自定义扩展 (B1 方案)

**Why**:
- better-auth 自动管理 `user`, `session`, `organization`, `member` 表
- 我们只需定义 `plugins`, `permissions`, `plugin_configs` 表
- `organization.id` 直接作为 `tenantId` (租户隔离键)

**核心表**:
| 表名 | 说明 | 管理方 |
|------|------|--------|
| `organization` | 组织/租户 | better-auth |
| `member` | 组织成员 + 角色 | better-auth |
| `plugins` | 插件元数据 | 我们 |
| `permissions` | 能力定义 | 我们 |
| `plugin_configs` | 插件配置 | 我们 |

> 📁 **详细实现**: [specs/database-schema/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/database-schema/spec.md)

---

### Decision 27: PluginManifest Schema 统一

**Choice**: 单一权威定义位于 `packages/plugin/src/manifest.schema.ts`

**Why**:
- 避免多处定义导致字段不一致
- Zod schema 提供运行时验证 + TypeScript 类型
- 前后端共享同一份 schema

**必需字段**: `pluginId`, `version`, `name`, `vendor`, `engines.wordrhyme`, `capabilities`

**可选字段**: `server`, `admin`, `web`, `permissions`, `dependencies`, `peerDependencies`

> 📁 **详细实现**: [specs/plugin-api/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/plugin-api/spec.md)

---

### Decision 28: PluginContext 完整接口

**Choice**: 完整 Context (D2 方案)

**Why**:
- 统一的插件开发体验
- 所有能力通过 `ctx` 访问
- 便于未来扩展

**能力接口**:
| 能力 | 可用性 | 说明 |
|------|--------|------|
| `ctx.logger` | 始终可用 | 结构化日志 |
| `ctx.permissions` | 始终可用 | 权限查询 |
| `ctx.config` | 始终可用 | 插件配置存储 |
| `ctx.db` | 需声明 `capabilities.data` | 数据库操作 |

> 📁 **详细实现**: [specs/plugin-api/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/plugin-api/spec.md)

---

### Decision 29: AsyncLocalStorage 实现

**Choice**: 完整的请求上下文管理

**Why**:
- 避免手动传递 context 参数
- 自动在异步调用链中传播
- 与 NestJS/Fastify 中间件无缝集成

**RequestContext 字段**: `requestId`, `tenantId`, `userId`, `userRole`, `session`, `startTime`

**获取方式**: `getContext()` / `getContextOrNull()` / `getTenantId()` / `getUserId()`

> 📁 **详细实现**: [specs/multi-tenant-context/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/multi-tenant-context/spec.md)

---

### Decision 30: Bootstrap 阶段实现

**Choice**: 7 阶段顺序执行

**Why**:
- 符合 `CORE_BOOTSTRAP_FLOW.md` 规范
- 清晰的依赖关系
- 便于调试和日志追踪

**阶段**:
1. `system-config` - 加载环境变量 (关键)
2. `context-providers` - 注册 ALS
3. `plugin-manifest-scanning` - 扫描 /plugins
4. `plugin-dependency-graph` - 解析依赖
5. `capability-initialization` - 初始化能力
6. `plugin-module-registration` - 加载插件
7. `http-server-start` - 启动 HTTP (关键)

**Kernel 状态**: `booting` → `running` → `reloading` → `shutdown`

> 📁 **详细实现**: [specs/core-bootstrap/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/core-bootstrap/spec.md)

---

### Decision 31: Permission Kernel 实现

**Choice**: 白名单授权 + 请求级缓存

**Why**:
- 默认拒绝，仅允许显式授权
- 缓存避免重复数据库查询
- 支持通配符匹配 (`content:*:*`)

**能力格式**: `resource:action:scope` (如 `content:create:space`)

**主要方法**:
- `permissionKernel.can(capability)` - 返回 boolean
- `permissionKernel.require(capability)` - 无权限抛错

**插件权限命名空间**: `plugin:{pluginId}:{capability}`

> 📁 **详细实现**: [specs/permission-kernel/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/permission-kernel/spec.md)

---

### Decision 32: 菜单数据库存储和基于权限的可见性

**Choice**: 菜单数据存储在统一的 `menus` 表，通过 `source` 字段区分来源（Core 或插件），Sidebar 根据用户权限动态过滤显示

**Why**:
- 统一管理 Core 菜单和插件菜单，避免数据分散
- 菜单配置持久化，支持运行时动态调整
- 权限控制与菜单可见性解耦（插件/Core 声明菜单，Permission Kernel 控制可见性）
- 符合 "默认管理员可见" 原则（未配置权限时的 fallback）
- 与 `permissions` 表设计一致（都有 `source` 字段）

**数据库 Schema**:
```typescript
export const menus = pgTable('menus', {
  id: text('id').primaryKey(),
  source: text('source').notNull(), // 'core' | pluginId
  organizationId: text('organization_id').notNull(),
  label: text('label').notNull(),
  icon: text('icon'),
  path: text('path').notNull(),
  parentId: text('parent_id').references(() => menus.id),
  order: integer('order').notNull().default(0),
  requiredPermission: text('required_permission'), // 可选，未设置则默认管理员可见
  target: text('target').notNull().$type<'admin' | 'web'>(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**菜单注册流程**:
1. **Core 菜单**: 通过 seed 脚本初始化（如"用户管理"、"系统设置"）
2. **插件菜单**: 插件在 `manifest.json` 中声明 `admin.menus` 和 `web.menus`
3. 插件安装时，`MenuRegistry` 解析并写入 `menus` 表（`source = pluginId`）
4. 前端请求菜单列表时，tRPC API 根据当前用户权限过滤
5. 插件卸载时，删除所有 `source = pluginId` 的菜单记录

**可见性规则**:
- 如果菜单未设置 `requiredPermission`，默认对管理员角色可见
- 如果设置了 `requiredPermission`，调用 `permissionKernel.can(requiredPermission)` 检查
- 父菜单隐藏时，子菜单自动隐藏

**Manifest 示例**:
```json
{
  "pluginId": "com.vendor.seo",
  "admin": {
    "menus": [
      {
        "id": "seo-dashboard",
        "label": "SEO Dashboard",
        "icon": "ChartBar",
        "path": "/plugins/seo/dashboard",
        "order": 10,
        "requiredPermission": "plugin:com.vendor.seo:dashboard.read"
      },
      {
        "id": "seo-settings",
        "label": "SEO Settings",
        "path": "/plugins/seo/settings",
        "parentId": "seo-dashboard",
        "requiredPermission": "plugin:com.vendor.seo:settings.read"
      }
    ]
  }
}
```

> 📁 **详细实现**: [specs/database-schema/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/database-schema/spec.md), [specs/admin-ui-host/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/admin-ui-host/spec.md)

---

### Decision 33: 插件数据库迁移执行流程

**Choice**: Drizzle 驱动 + Checksum 验证 + 事务保护 + 幂等性

**Why**:
- 插件可能需要私有数据表（如 `plugin_seo_meta_tags`）
- 必须追踪已应用的迁移，避免重复执行
- 迁移失败时必须回滚，不能留下半完成状态
- 支持插件更新时的增量迁移

**迁移文件位置**:
```
/plugins/{pluginId}/
├── manifest.json
├── server/
└── migrations/
    ├── 001_initial_schema.sql
    ├── 002_add_index.sql
    └── 003_alter_table.sql
```

**执行流程** (在 `onInstall` 或 `onEnable` 时):
```typescript
class PluginMigrationRunner {
  async runMigrations(pluginId: string, pluginDir: string): Promise<void> {
    const migrationFiles = await fs.readdir(`${pluginDir}/migrations`);
    const sortedFiles = migrationFiles.sort(); // 按字母序执行

    for (const file of sortedFiles) {
      const checksum = await this.calculateChecksum(file);
      const existing = await db.query.pluginMigrations.findFirst({
        where: eq(pluginMigrations.pluginId, pluginId) &&
               eq(pluginMigrations.migrationFile, file)
      });

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`Migration file ${file} has been modified after application`);
        }
        continue; // 已应用，跳过
      }

      // 在事务中执行迁移
      await db.transaction(async (tx) => {
        const sql = await fs.readFile(`${pluginDir}/migrations/${file}`, 'utf-8');
        await tx.execute(sql);

        await tx.insert(pluginMigrations).values({
          id: generateId(),
          pluginId,
          organizationId: ctx.organizationId,
          migrationFile: file,
          checksum,
          appliedAt: new Date(),
        });
      });

      console.log(`✅ Applied migration: ${pluginId}/${file}`);
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
```

**卸载时数据删除策略** (见 Decision 36):
- `onDisable`: 不删除数据（插件可能重新启用）
- `onUninstall`: 根据 manifest 中的 `retention` 配置决定
  - `"delete"`: 立即删除所有私有表
  - `"archive"`: 标记为待删除，30天后清理
  - `"retain"`: 永久保留（需用户手动清理）

**错误处理**:
- 迁移失败 → 事务回滚 → 插件标记为 `crashed`
- 不允许修改已应用的迁移文件（checksum 不匹配会抛错）
- 迁移超时（5分钟） → 自动取消

> 📁 **详细实现**: [specs/plugin-runtime/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/plugin-runtime/spec.md)

---

### Decision 34: MF2.0 动态远程加载/卸载机制

**Choice**: Module Federation 2.0 Runtime API (`registerRemotes` + `loadRemote` + `unregisterRemotes`)

**Why**:
- 插件 UI 在安装/卸载时动态注册/注销，无需重新构建 Host
- 支持懒加载（菜单项点击时才加载 RemoteEntry）
- 支持热替换（插件更新时重新加载 Remote）
- 符合 MF2.0 最佳实践

**Remote Entry URL 映射**:
- Manifest 声明: `"admin": { "remoteEntry": "./dist/admin/remoteEntry.js" }`
- 服务端解析为: `/plugins/{pluginId}/static/admin/remoteEntry.js`
- 前端通过 tRPC 获取完整 URL 列表

**动态加载流程** (Admin UI):
```typescript
// 1. 获取已安装插件列表
const { data: plugins } = trpc.plugin.list.useQuery();

// 2. 动态注册 Remotes
import { init, loadRemote } from '@module-federation/enhanced/runtime';

init({
  name: 'admin-host',
  remotes: plugins
    .filter(p => p.status === 'enabled' && p.manifest.admin?.remoteEntry)
    .map(p => ({
      name: p.pluginId.replace(/\./g, '_'), // com.vendor.seo → com_vendor_seo
      entry: `/plugins/${p.pluginId}/static/admin/${p.manifest.admin.remoteEntry}`,
    })),
});

// 3. 懒加载插件组件
const PluginDashboard = React.lazy(() =>
  loadRemote<{ default: React.ComponentType }>('com_vendor_seo/Dashboard')
);

// 4. 使用错误边界
<ErrorBoundary fallback={<PluginLoadError />}>
  <Suspense fallback={<PluginLoading />}>
    <PluginDashboard />
  </Suspense>
</ErrorBoundary>
```

**卸载/更新流程**:
```typescript
import { loadRemote } from '@module-federation/enhanced/runtime';

// 插件更新时，强制重新加载
await loadRemote('com_vendor_seo/Dashboard', {
  from: 'runtime',
  bustRemoteEntryCache: true // 清除缓存
});
```

**错误处理**:
- RemoteEntry 404 → 插件标记为 `degraded`，显示降级 UI
- RemoteEntry 加载超时（30秒） → 显示加载失败提示
- 组件导出不存在 → 捕获异常，不影响其他插件

**限制**:
- 不支持运行时卸载（浏览器不支持真正的模块卸载）
- 插件更新需要用户刷新页面（或使用 `bustRemoteEntryCache`）

> 📁 **详细实现**: [specs/admin-ui-host/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/admin-ui-host/spec.md)

---

### Decision 35: tRPC 路由合并策略和边缘情况处理

**Choice**: 动态 Router 合并 + 命名空间隔离 + 冲突检测

**Why**:
- 插件可以暴露自己的 tRPC Router（如 `plugin.seo.*`）
- Core Router 和 Plugin Router 必须合并为统一的 `AppRouter`
- 必须防止命名冲突（两个插件都导出 `settings` 路由）
- 支持插件热重载（Rolling Reload 后重新合并）

**命名空间规则**:
```typescript
// Core Router
const coreRouter = router({
  plugin: pluginProcedures,      // Core 管理插件的 API
  permission: permissionProcedures,
  user: userProcedures,
});

// Plugin Router (自动添加命名空间)
const seoPluginRouter = router({
  analyze: procedure.query(...),   // 插件导出: analyze
  settings: procedure.mutation(...),
});

// 合并后
const appRouter = router({
  ...coreRouter,
  'plugin.seo': seoPluginRouter,  // 自动前缀: plugin.{pluginId}
});

// 前端调用
trpc.plugin.seo.analyze.useQuery(); // ✅
trpc.seo.analyze.useQuery();        // ❌ 不允许
```

**合并流程** (在 Bootstrap 阶段):
```typescript
class TRPCRouterMerger {
  async mergePluginRouters(): Promise<AppRouter> {
    const enabledPlugins = await db.query.plugins.findMany({
      where: eq(plugins.status, 'enabled'),
    });

    const pluginRouters: Record<string, AnyRouter> = {};

    for (const plugin of enabledPlugins) {
      try {
        const pluginModule = await import(`/plugins/${plugin.pluginId}/server/index.js`);

        if (pluginModule.trpcRouter) {
          const namespace = `plugin.${plugin.pluginId}`;

          // 检测冲突
          if (pluginRouters[namespace]) {
            throw new Error(`Router namespace conflict: ${namespace}`);
          }

          pluginRouters[namespace] = pluginModule.trpcRouter;
        }
      } catch (error) {
        console.error(`Failed to load tRPC router for plugin ${plugin.pluginId}:`, error);
        // 标记插件为 degraded，但不阻塞其他插件
      }
    }

    return router({
      ...coreRouter,
      ...pluginRouters,
    });
  }
}
```

**边缘情况处理**:

1. **插件 Router 导出无效**:
   - 插件未导出 `trpcRouter` → 跳过，不报错
   - 导出类型不是 Router → 记录错误，标记插件为 `invalid`

2. **命名冲突**:
   - 两个插件都叫 `com.vendor.seo` → 第二个安装时拒绝
   - Core Router 和 Plugin Router 冲突 → 插件安装时验证失败

3. **循环依赖**:
   - Plugin A 的 Router 调用 Plugin B 的 Procedure → 禁止（插件隔离）
   - Plugin Router 调用 Core Procedure → 允许（通过 `ctx.trpc.caller`）

4. **重载后类型不一致**:
   - Rolling Reload 后，Plugin Router 签名变化 → 前端需刷新获取新类型
   - 使用 tRPC v11 的 `inferRouterInputs` / `inferRouterOutputs` 自动生成类型

**类型导出**:
```typescript
// apps/server/src/trpc/router.ts
export const appRouter = createAppRouter(); // 动态合并
export type AppRouter = typeof appRouter;

// 前端自动获取类型
import type { AppRouter } from '@wordrhyme/server/trpc';
const trpc = createTRPCReact<AppRouter>();
```

> 📁 **详细实现**: Core Bootstrap 阶段集成

---

### Decision 36: 插件卸载数据删除策略

**Choice**: 分级保留策略（`delete` / `archive` / `retain`），由插件 Manifest 声明

**Why**:
- 用户卸载插件可能是临时行为，立即删除数据会导致不可恢复
- 某些场景需要保留历史数据用于审计（如订单、日志）
- 符合 GDPR 等数据保护法规（用户有权删除数据）

**Manifest 声明**:
```json
{
  "pluginId": "com.vendor.seo",
  "dataRetention": {
    "onDisable": "retain",    // 禁用时保留数据
    "onUninstall": "archive", // 卸载时归档，30天后删除
    "tables": [
      "plugin_seo_meta_tags",
      "plugin_seo_redirects"
    ]
  }
}
```

**保留策略**:

| 策略 | onDisable 行为 | onUninstall 行为 | 适用场景 |
|------|---------------|-----------------|---------|
| `delete` | 保留数据 | 立即删除所有表和配置 | 测试插件、临时工具 |
| `archive` | 保留数据 | 标记为待删除，30天后清理 | 业务插件（默认） |
| `retain` | 保留数据 | 永久保留，需用户手动清理 | 审计日志、历史订单 |

**实现逻辑**:
```typescript
class PluginDataCleaner {
  async handleUninstall(pluginId: string, manifest: PluginManifest): Promise<void> {
    const strategy = manifest.dataRetention?.onUninstall || 'archive';

    switch (strategy) {
      case 'delete':
        await this.deleteImmediately(pluginId, manifest.dataRetention.tables);
        break;

      case 'archive':
        await db.update(plugins)
          .set({
            status: 'archived',
            scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天后
          })
          .where(eq(plugins.pluginId, pluginId));

        // 后台任务定期清理过期归档
        break;

      case 'retain':
        // 仅标记为卸载，不设置删除时间
        await db.update(plugins)
          .set({ status: 'uninstalled' })
          .where(eq(plugins.pluginId, pluginId));
        break;
    }

    // 清理菜单和权限（无论策略如何都删除）
    await db.delete(menus).where(eq(menus.source, pluginId));
    await db.delete(permissions).where(eq(permissions.source, pluginId));
  }

  private async deleteImmediately(pluginId: string, tables: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const table of tables) {
        await tx.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(table)} CASCADE`);
      }
      await tx.delete(plugins).where(eq(plugins.pluginId, pluginId));
    });
  }
}
```

**定期清理任务** (Cron Job):
```typescript
// 每天凌晨2点执行
cron.schedule('0 2 * * *', async () => {
  const expiredPlugins = await db.query.plugins.findMany({
    where: and(
      eq(plugins.status, 'archived'),
      lt(plugins.scheduledDeletionAt, new Date())
    ),
  });

  for (const plugin of expiredPlugins) {
    await pluginDataCleaner.deleteImmediately(plugin.pluginId, plugin.manifest.dataRetention.tables);
    console.log(`🗑️  Deleted archived plugin data: ${plugin.pluginId}`);
  }
});
```

**用户界面提示**:
- 卸载时显示数据保留策略
- 归档插件显示剩余天数
- 提供 "立即删除数据" 按钮（管理员权限）

> 📁 **详细实现**: [specs/plugin-runtime/spec.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/openspec/changes/add-mvp-core-implementation/specs/plugin-runtime/spec.md)

---

## 完整文件结构

```
apps/
├── server/                    # NestJS + Fastify + tRPC
│   └── src/
│       ├── main.ts            # 入口 (see: nestjs-integration/spec.md)
│       ├── app.module.ts      # 根模块
│       ├── db/schema/         # Drizzle (see: database-schema/spec.md)
│       ├── context/           # ALS (see: multi-tenant-context/spec.md)
│       ├── permission/        # 权限 (see: permission-kernel/spec.md)
│       ├── bootstrap/         # 启动 (see: core-bootstrap/spec.md)
│       ├── plugins/           # 插件 (see: plugin-runtime/spec.md)
│       └── trpc/              # API
│
├── admin/                     # React + Rspack + MF2.0
│   └── src/                   # (see: admin-ui-host/spec.md)
│
└── web/                       # Next.js 15 + MF2.0

packages/
├── plugin/                    # @wordrhyme/plugin SDK
│   └── src/                   # (see: plugin-api/spec.md)
│       ├── manifest.schema.ts # 权威 Manifest
│       └── context.ts         # PluginContext
│
└── core/                      # @wordrhyme/core
```

---

## 补充决策 (2024-12-30 会话)

以下是在后续实现过程中新增的决策，补充到设计文档中：

### Decision 41: 插件开发模式 (Simple vs Advanced)

**Choice**: 支持两种插件开发模式

| 模式 | 特性 | 适用场景 |
|------|------|----------|
| **Simple Mode** | tRPC Router + `ctx.db` | 简单 CRUD 插件 |
| **Advanced Mode** | NestJS Module + DI + `@Inject(PLUGIN_DATABASE)` | 复杂业务逻辑 |

**Simple Mode 示例**:
```typescript
// src/server/index.ts
export const router = pluginRouter({
    createItem: pluginProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.insert({ table: 'items', data: { name: input.name } });
        }),
});
```

**Advanced Mode 示例**:
```typescript
// src/server/my.service.ts
@Injectable()
export class MyService {
    constructor(
        @Optional() @Inject(PLUGIN_DATABASE)
        private readonly db?: PluginDatabaseCapability
    ) {}

    async createItem(name: string) {
        await this.db?.insert({ table: 'items', data: { name } });
    }
}

// src/server/my.module.ts
@Module({})
export class MyModule {
    static forTenant(tenantId: string): DynamicModule {
        return {
            module: MyModule,
            providers: [
                {
                    provide: PLUGIN_DATABASE,
                    useFactory: () => createPluginDataCapability(PLUGIN_ID, tenantId),
                },
                MyService,
            ],
            exports: [MyService],
        };
    }
}
```

**Manifest 配置**:
```json
{
    "server": {
        "entry": "./dist/server/index.js",
        "nestModule": "./dist/server/my.module.js"  // Advanced Mode only
    }
}
```

---

### Decision 42: NestJS Module 动态加载

**Choice**: 使用 `LazyModuleLoader` 动态加载插件 NestJS 模块

**Why**:
- NestJS 原生支持，无需额外依赖
- 按需加载，减少启动时间
- 支持模块卸载（关闭插件时）

**Implementation**:
```typescript
// apps/server/src/plugins/plugin-manager.ts
class PluginManager {
    private lazyModuleLoader: LazyModuleLoader;

    setLazyModuleLoader(loader: LazyModuleLoader) {
        this.lazyModuleLoader = loader;
    }

    async loadPlugin(manifest: PluginManifest, pluginDir: string) {
        // Load NestJS module if declared
        if (manifest.server?.nestModule && this.lazyModuleLoader) {
            const modulePath = path.join(pluginDir, manifest.server.nestModule);
            const { default: PluginModule } = await import(modulePath);
            const moduleRef = await this.lazyModuleLoader.load(() => PluginModule);
            loadedPlugin.moduleRef = moduleRef;
        }
    }
}
```

---

### Decision 43: 插件数据库迁移策略

**Choice**: 每次启动检查迁移（幂等执行）

**Why**:
- 开发模式友好：添加新迁移文件后重启即可应用
- 生产模式安全：只执行未应用的迁移
- `plugin_migrations` 表记录 checksum 防止重复执行

**Implementation**:
```typescript
// PluginManager.loadPlugin()
// 5. Run database migrations (idempotent - only runs pending migrations)
// This runs on every startup to support development mode additions
if (this.migrationService) {
    await this.migrationService.runMigrations(
        manifest.pluginId,
        pluginDir,
        'default'  // tenantId
    );
}
```

**迁移文件结构**:
```
plugins/hello-world/
└── migrations/
    ├── 0001_create_greetings.sql  ✅ 已应用
    └── 0002_add_index.sql         🆕 待应用
```

---

### Decision 44: 开发模式热更新

**Choice**: 使用 NestJS `watchAssets` 监听插件 dist 目录

**Why**:
- 利用现有 NestJS 机制，无需额外依赖
- 插件构建后自动触发服务器重启
- 配置简单

**Implementation**:
```json
// apps/server/nest-cli.json
{
    "compilerOptions": {
        "watchAssets": true,
        "assets": [
            {
                "include": "../../plugins/*/dist/**/*",
                "watchAssets": true
            }
        ]
    }
}
```

**开发工作流**:
```bash
# 终端 1: 服务器 (监听插件变化)
pnpm dev

# 终端 2: 插件开发 (构建触发服务器重启)
cd plugins/hello-world
pnpm dev:server  # tsup --watch
```

---

### Decision 45: 表名前缀规范

**Choice**: `plugin_{sanitizedPluginId}_{tableName}`

**Sanitization Rule**:
```typescript
// 将 . 和 - 替换为 _
const tablePrefix = `plugin_${pluginId.replace(/[.\-]/g, '_')}_`;
```

**Example**:
- Plugin ID: `com.wordrhyme.hello-world`
- Table: `greetings`
- Full Name: `plugin_com_wordrhyme_hello_world_greetings`

**Why**:
- SQL 安全（避免 `-` 等特殊字符）
- 自动隔离（前缀包含 pluginId）
- 租户隔离（通过 `tenant_id` 列 + 自动查询过滤）

---

### Decision 46: ctx.db 自动租户隔离

**Choice**: 所有查询自动注入 `tenant_id` 过滤条件

**Implementation**:
```typescript
// data.capability.ts
function createPluginDataCapability(pluginId: string, tenantId?: string) {
    return {
        async query(options) {
            const where = { ...options.where };
            if (tenantId) {
                where['tenant_id'] = tenantId;  // 自动过滤
            }
            // ...
        },
        async insert(options) {
            const data = { ...options.data };
            if (tenantId) {
                data['tenant_id'] = tenantId;  // 自动注入
            }
            // ...
        },
    };
}
```

**Plugin Schema 要求**:
```typescript
// 必须包含 tenant_id 和 plugin_id 列
export const greetingsTable = pgTable('plugin_com_wordrhyme_hello_world_greetings', {
    id: uuid('id').primaryKey(),
    tenant_id: varchar('tenant_id', { length: 255 }).notNull(),
    plugin_id: varchar('plugin_id', { length: 255 }).notNull(),
    // ... other columns
});
```

---

## 会话实现总结

本次会话完成的主要功能：

1. ✅ NestJS Module 动态加载 (`LazyModuleLoader`)
2. ✅ `@Inject(PLUGIN_DATABASE)` 服务注入模式
3. ✅ Simple/Advanced 双模式架构
4. ✅ 开发模式热更新 (`watchAssets`)
5. ✅ 插件数据库迁移每次启动检查
6. ✅ Admin UI 双模式测试组件
7. ✅ 表名前缀规范化 (`.` 和 `-` → `_`)
