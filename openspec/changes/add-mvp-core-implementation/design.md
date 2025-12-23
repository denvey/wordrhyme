# MVP Design Document

## Context

Nebula CMS exists as a frozen architecture specification (v0.1) with no implementation code. The MVP must prove:

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

**Choice**: pnpm workspaces with separate `apps/` and `packages/`

**Why**:
- Plugin API must be a separate package (plugins import it, not Core)
- Admin + Server are distinct deployables
- Enables shared TypeScript configs and tooling

**Alternatives Considered**:
- Multi-repo (rejected: increases coordination overhead for MVP)
- Rush/Nx (rejected: overkill for MVP scope)

**Structure**:
```
wordrhyme/
├── apps/
│   ├── server/          # NestJS + Fastify backend
│   └── admin/           # React + Rspack frontend
├── packages/
│   ├── plugin-api/      # @nebula/plugin-api (public contract)
│   └── core/            # @nebula/core (internal, optional)
├── examples/
│   └── plugin-hello-world/
├── infra/
│   └── docker-compose.yml
└── pnpm-workspace.yaml
```

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
- `@nebula/plugin-api` (essential for runtime context)
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
│     import { router, publicProcedure } from '@nebula/plugin-api' │
│                                                               │
│  2. Call System APIs (type-safe)                             │
│     import { createCoreClient } from '@nebula/core-client'   │
│     const core = createCoreClient(ctx);                      │
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

**Package 1: @nebula/plugin-api** (Plugin SDK)
```ts
// ===== packages/plugin-api/src/trpc.ts =====
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

**Package 2: @nebula/api** (System API Client)
```ts
// ===== packages/api/src/index.ts =====
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { CoreRouter } from '@server/trpc/router';
import type { PluginContext } from '@nebula/plugin-api';

/**
 * Create type-safe client for calling system APIs from plugins
 *
 * Usage: Plugins use this to call Core APIs (user management, content, etc.)
 *
 * @param ctx - Plugin context
 * @returns Type-safe Core API client
 *
 * @example
 * ```ts
 * import { createSystemClient } from '@nebula/api';
 *
 * const api = createSystemClient(ctx);
 *
 * // Full type inference and autocomplete
 * const currentUser = await api.user.getCurrent.query();
 * const allUsers = await api.user.list.query();
 * const newContent = await api.content.create.mutate({ ... });
 * ```
 */
export function createSystemClient(ctx: PluginContext) {
  return createTRPCProxyClient<CoreRouter>({
    links: [
      httpBatchLink({
        url: process.env.NEBULA_API_URL || 'http://localhost:3000/trpc',
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
export type SystemAPI = ReturnType<typeof createSystemClient>;
```

#### Part 4: Plugin Example (Full Experience)

```ts
// ===== examples/plugin-analytics/src/server/router.ts =====
import { pluginRouter, pluginProcedure } from '@nebula/plugin-api/trpc';
import { createSystemClient } from '@nebula/api';  // ← Call system APIs
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
      // 1. Call system APIs (type-safe!)
      const api = createSystemClient(ctx);
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
import type { PluginContext } from '@nebula/plugin-api';

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
│   ├── plugin-api/      # Plugin SDK (tRPC builders)
│   │   ├── src/
│   │   │   ├── trpc.ts              # pluginRouter, pluginProcedure
│   │   │   └── types.ts             # PluginContext
│   │   └── package.json
│   └── api/             # System API client for plugins
│       ├── src/
│       │   └── index.ts             # createSystemClient(ctx)
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
| **System API Access** | ✅ `createSystemClient(ctx)` with full type safety |
| **Frontend Integration** | ✅ `usePluginClient<T>()` with autocomplete |
| **Monorepo Friendly** | ✅ Plugin as workspace package |

**Package Responsibilities**:

| Package | Purpose | Key Export |
|---------|---------|-----------|
| `@nebula/plugin-api` | Plugin SDK | `pluginRouter`, `pluginProcedure`, `PluginContext` |
| `@nebula/api` | System API client | `createSystemClient(ctx)`, `CoreRouter` |

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

### Decision 7: Standard Plugin Package Layout

**Proposal**: A unified directory structure for all Nebula plugins.

**Layout**:
```text
/plugins/{id}/
├── manifest.json       # Plugin identity + engines.nebula + capabilities + entries (server/admin)
├── dist/
│   ├── server.js       # Backend entry (Side-effects/Hooks)
│   └── admin/
│       └── remoteEntry.js # MF 2.0 Entry
└── migrations/         # Drizzle migration files
```

---

### Decision 8: Permission Scope Hierarchy

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
    nebula: z.string(),
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

**Choice**: shadcn/ui for Admin UI components + Tailwind CSS 4.0

**Why**:
- Not a dependency (components copied into codebase, full ownership)
- Built on Radix UI (accessible, headless components)
- **Tailwind CSS 4.0** (latest version, improved performance, native CSS features)
- Customizable without fighting framework abstractions
- High-quality defaults (reduces MVP implementation time)

**Tailwind CSS 4.0 Key Features**:
- Native CSS variables (no PostCSS required for basic usage)
- Improved performance (JIT compilation by default)
- Better theme customization
- CSS-first configuration (not JS config)

**Implementation**:
- Copy shadcn/ui components into `apps/admin/src/components/ui/`
- Configure Tailwind CSS 4.0 via `@config` directive
- Customize theme via CSS variables
- Plugins can use same components (shared design system)

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

### Decision 16: Visual Editor Architecture (Future-Proofing)

> **Note (Non-normative / Out of MVP scope)**: Decisions 16–25 document *potential* extension points and interfaces to reduce future refactor risk. They MUST NOT expand the MVP contract surface area: MVP manifest validation and `@nebula/plugin-api` exports should remain minimal. Any new manifest fields/capability keys that become externally supported require a separate approved change.

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

### Decision 17: Queue System Architecture (Future-Proofing)

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

### Decision 18: Notification System Architecture (Future-Proofing)

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

### Decision 19: Content Versioning Architecture (Future-Proofing)

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

### Decision 20: Asset Management Architecture (Future-Proofing)

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

### Decision 21: Public API Layer Architecture (Future-Proofing)

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

### Decision 22: Webhook System Architecture (Future-Proofing)

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

### Decision 23: Scheduled Tasks Architecture (Future-Proofing)

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

### Decision 24: Audit Log Architecture (Future-Proofing)

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

### Decision 25: Plugin Configuration UI Architecture (Future-Proofing)

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

**Question**: Should `@nebula/plugin-api` version be separate from Core version?

**Options**:
1. Same version (Core 0.1.0 → Plugin API 0.1.0)
2. Independent versioning (Core 0.1.0 → Plugin API 1.0.0)

**Recommendation**: **Option 1 (same version)** for MVP
- Reason: Simpler for MVP, plugins declare `engines.nebula: "0.1.x"`
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
      nebula: {
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
        nebula_log(1, "Tracking event".as_ptr(), 14);
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
    fn nebula_log(level: i32, msg_ptr: *const u8, msg_len: usize);
    fn nebula_db_query(sql_ptr: *const u8, sql_len: usize) -> *const u8;
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
declare function nebula_log(level: i32, msg: string): void;
declare function nebula_db_query(sql: string): string;

// Export handler
export function track_event(params_json: string): string {
  const params = JSON.parse<TrackEventParams>(params_json);

  nebula_log(1, `Tracking: ${params.event} on ${params.page}`);

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

**Key Principle**: Plugin API (`@nebula/plugin-api`) remains stable across all phases.

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

**Design Status**: Pending approval alongside proposal
**Last Updated**: 2025-12-22
**Author**: Claude Code (AI-assisted architecture validation)
