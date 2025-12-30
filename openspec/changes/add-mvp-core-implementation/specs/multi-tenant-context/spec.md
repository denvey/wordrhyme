# Multi-Tenant Context Specification

## ADDED Requirements

### Requirement: Context Provider Registration

The system SHALL register Context Providers for: tenant, user, locale, currency, timezone. Context Providers MUST be initialized in Phase 2 of bootstrap (before plugins load).

#### Scenario: All context providers registered
- **WHEN** Phase 2 (Context Providers) completes
- **THEN** TenantContextProvider is registered
- **AND** UserContextProvider is registered
- **AND** LocaleContextProvider is registered
- **AND** CurrencyContextProvider is registered
- **AND** TimezoneContextProvider is registered

---

### Requirement: Request-scoped Context

Context MUST be resolved per-request and scoped to that request. Context SHALL be accessible via Async Local Storage (ALS). Plugins MUST access context through the Capability API (not global variables).

#### Scenario: Context resolved from request
- **WHEN** a request is received with header `X-Tenant-Id: tenant-123`
- **THEN** the TenantContextProvider resolves `tenantId = "tenant-123"`
- **AND** the context is stored in ALS for the request duration
- **WHEN** plugin code accesses `ctx.tenant`
- **THEN** it receives `{ tenantId: "tenant-123" }`

#### Scenario: Context isolated across requests
- **WHEN** Request 1 has `tenantId = "tenant-A"`
- **AND** Request 2 has `tenantId = "tenant-B"`
- **THEN** code in Request 1 always sees `tenantId = "tenant-A"`
- **AND** code in Request 2 always sees `tenantId = "tenant-B"`
- **AND** contexts do NOT leak between requests

---

### Requirement: Default Context Values

If context cannot be resolved from the request, sensible defaults SHALL be used: `locale = "en-US"`, `currency = "USD"`, `timezone = "UTC"`. Tenant MUST be resolved (missing tenant is an error). User MUST be resolved either via authentication OR via an explicit MVP stub mode.

#### Scenario: Locale defaults to en-US
- **WHEN** a request does not specify a locale
- **THEN** the LocaleContextProvider returns `"en-US"`

#### Scenario: Missing tenant is an error
- **WHEN** a request does not specify a tenant ID
- **AND** the tenant cannot be inferred
- **THEN** the request is rejected with a 400 error
- **AND** an error message indicates "Tenant ID required"

#### Scenario: Stub auth defaults user
- **WHEN** the system runs with stub auth enabled (e.g., `WORDRHYME_AUTH_MODE=stub`)
- **AND** a request does not include user identity
- **THEN** the UserContextProvider resolves `userId = "admin"`
- **AND** permission checks evaluate as the admin user for MVP

---

### Requirement: Context Immutability

Context values MUST be immutable within a request. Plugins SHALL NOT modify context (read-only access).

#### Scenario: Context read-only
- **WHEN** plugin code attempts to mutate `ctx.tenantId`
- **THEN** the mutation fails (TypeError: cannot assign to read-only property)
- **OR** the mutation is ignored (object is frozen)

---

## Implementation Details

### File Structure

```
apps/server/src/context/
├── async-local-storage.ts  # ALS 实例和类型
├── context.middleware.ts   # Fastify 中间件
└── context.module.ts       # NestJS 模块
```

### RequestContext Interface

```typescript
// apps/server/src/context/async-local-storage.ts
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId: string;
  userId: string | null;
  userRole: string | null;
  session: Session | null;
  startTime: number;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext {
  const ctx = asyncLocalStorage.getStore();
  if (!ctx) {
    throw new Error('RequestContext not available');
  }
  return ctx;
}

export function getContextOrNull(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getTenantId(): string {
  return getContext().tenantId;
}

export function getUserId(): string | null {
  return getContext().userId;
}
```

### Context Middleware

```typescript
// apps/server/src/context/context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { asyncLocalStorage, RequestContext } from './async-local-storage';
import { auth } from '../auth/auth';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  async use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    const session = await auth.api.getSession({ headers: req.headers as any });
    const tenantId = this.resolveTenantId(req, session);

    const context: RequestContext = {
      requestId: crypto.randomUUID(),
      tenantId,
      userId: session?.user?.id || null,
      userRole: session?.user?.role || 'member',
      session,
      startTime: Date.now(),
    };

    asyncLocalStorage.run(context, next);
  }

  private resolveTenantId(req: FastifyRequest, session: any): string {
    // 1. 请求头
    const header = req.headers['x-organization-id'] as string;
    if (header) return header;

    // 2. 用户活动组织
    if (session?.user?.activeOrganizationId) {
      return session.user.activeOrganizationId;
    }

    // 3. 开发模式默认
    if (process.env.NODE_ENV === 'development') {
      return 'default-dev-tenant';
    }

    throw new Error('Tenant ID required');
  }
}
```

### NestJS Module

```typescript
// apps/server/src/context/context.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ContextMiddleware } from './context.middleware';

@Module({})
export class ContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
```

### tRPC Context Integration

```typescript
// apps/server/src/trpc/context.ts
import { getContext } from '../context/async-local-storage';
import { db } from '../db';

export interface TrpcContext {
  req: RequestContext;
  db: typeof db;
}

export async function createContext(): Promise<TrpcContext> {
  return { req: getContext(), db };
}
```

