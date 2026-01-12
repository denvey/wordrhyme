# Hook System Design Document

> **Status**: Draft
> **Created**: 2026-01-12
> **Author**: AI-Assisted Design
> **Governance**: Compliant with `EVENT_HOOK_GOVERNANCE.md` (Frozen v1)

---

## 1. Overview

### 1.1 Design Goals

Build a **WordPress-inspired but safety-constrained** Hook system for WordRhyme CMS:

- **Familiar API**: `addAction` / `addFilter` style, friendly to plugin developers
- **Core Control**: Plugins cannot hijack Core flow (reject "Hook as Control Flow")
- **Performance**: Function references in memory, not dynamic imports
- **Resilience**: Circuit breaker, timeout protection, defensive copying
- **Debuggability**: Execution trace for pipeline visibility

### 1.2 Governance Compliance

Per `EVENT_HOOK_GOVERNANCE.md`:

| Hook Type | Execution | Return Value | Plugin Access |
|-----------|-----------|--------------|---------------|
| `action` | Parallel async | None | ✅ |
| `filter` | Serial sync | Modified value | ✅ (Core-declared points only) |
| `decision` | Serial sync | boolean | ❌ (Core internal only) |

**Key Constraint**: Plugins are always **passive** (被调用方). They cannot block Core execution or become mandatory checkpoints.

---

## 2. Core Concepts

### 2.1 Priority Enum

```typescript
enum HookPriority {
  EARLIEST = 0,      // System-level, plugins should not use
  EARLY = 25,        // Plugins needing early execution
  NORMAL = 50,       // Default priority
  LATE = 75,         // Plugins needing late execution
  LATEST = 100,      // Final execution (e.g., logging)
}
```

### 2.2 Hook Naming Convention

- **Format**: `{domain}.{timing}{Action}` or `{domain}.{noun}.{verb}`
- **Timing**: `before` | `after` | `on`
- **Examples**:
  - `content.beforeCreate`
  - `order.afterPay`
  - `user.onLogin`
  - `checkout.calculate.tax`

---

## 3. Data Structures

### 3.1 Hook Definition (Core declares extension points)

```typescript
interface HookDefinition<In = unknown, Out = unknown> {
  id: string;                    // Unique ID, e.g., "content.beforeCreate"
  type: 'action' | 'filter';     // decision not exposed to plugins
  description: string;           // Documentation

  // Filter-specific (runtime validation)
  inputSchema?: JsonSchema;      // Input structure
  outputSchema?: JsonSchema;     // Expected output structure
  validator?: (data: unknown) => boolean;  // Pre-compiled AJV validator

  // Execution constraints
  defaultTimeout: number;        // Per-handler timeout (ms)
}
```

### 3.2 Manifest Declaration (Plugin manifest.json)

```typescript
interface HookHandlerManifest {
  hookId: string;                // Hook to subscribe
  handler: string;               // "src/hooks/index.ts#onUserCreate"
  priority?: HookPriority;       // Default: NORMAL (50)
  timeout?: number;              // Override default timeout
}
```

### 3.3 Runtime Handler (In-memory registry)

```typescript
interface RuntimeHookHandler {
  id: string;                    // Handler unique ID
  hookId: string;
  pluginId: string;
  priority: HookPriority;
  enabled: boolean;

  // Actual function reference (NOT string path)
  fn: (data: unknown, ctx: HookContext) => Promise<unknown> | unknown;

  // Metadata for debugging
  source: string;                // Original path from manifest
  functionName: string;          // e.g., "transformPrice"

  // Execution config
  timeout: number;

  // Runtime statistics
  stats: {
    callCount: number;
    errorCount: number;          // Consecutive errors
    avgDuration: number;         // Moving average (ms)
    lastRunAt?: Date;
  };

  // Circuit breaker state
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    threshold: number;           // Default: 5
    cooldownMs: number;          // Default: 5 minutes
    trippedAt?: Date;
  };
}
```

### 3.4 Hook Context

```typescript
interface HookContext {
  hookId: string;
  traceId: string;               // Request trace ID
  pluginId: string;              // Current handler's plugin
  tenantId: string;
  userId?: string;

  // Utilities
  logger: Logger;

  // For filters: signal to stop pipeline (throw error instead of returning null)
  // throw new HookAbortError("Reason shown to user")
}
```

### 3.5 Registry Structure

```typescript
type HookRegistry = Map<string, {
  definition: HookDefinition;
  handlers: RuntimeHookHandler[];  // Always sorted by priority
}>;
```

---

## 4. Execution Engine

### 4.1 Action Execution (Parallel Async)

```typescript
async function executeAction(
  hookId: string,
  payload: unknown,
  ctx: HookContext
): Promise<void> {
  const entry = registry.get(hookId);
  if (!entry) return;

  const activeHandlers = entry.handlers.filter(h =>
    h.enabled && !shouldSkipCircuitBreaker(h)
  );

  // Parallel execution, failures don't block
  await Promise.allSettled(
    activeHandlers.map(handler =>
      executeWithTimeout(handler, payload, ctx)
        .catch(err => handleExecutionError(handler, err))
    )
  );
}
```

### 4.2 Filter Execution (Serial Pipeline + Validation)

```typescript
async function executeFilter<T>(
  hookId: string,
  initialValue: T,
  ctx: HookContext
): Promise<T> {
  const entry = registry.get(hookId);
  if (!entry) return initialValue;

  const { definition, handlers } = entry;
  let currentValue = initialValue;

  for (const handler of handlers) {
    // 1. Check circuit breaker (including half-open recovery)
    if (shouldSkipHandler(handler)) continue;

    try {
      // 2. Defensive copy (prevent reference pollution)
      const inputClone = structuredClone(currentValue);

      // 3. Execute with timeout
      const result = await executeWithTimeout(handler, inputClone, ctx);

      // 4. Runtime validation (pre-compiled validator)
      if (definition.validator && !definition.validator(result)) {
        console.warn(`[Hook] Schema validation failed: ${handler.pluginId}`);
        recordValidationError(handler);
        continue;  // Skip bad result, keep currentValue
      }

      // 5. Update value
      currentValue = result as T;

      // 6. Reset circuit breaker on success
      resetCircuitBreaker(handler);

    } catch (err) {
      handleExecutionError(handler, err);
      // currentValue unchanged, pipeline continues
    }
  }

  return currentValue;
}
```

### 4.3 Timeout Wrapper

```typescript
async function executeWithTimeout(
  handler: RuntimeHookHandler,
  payload: unknown,
  ctx: HookContext
): Promise<unknown> {
  const start = performance.now();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new HookTimeoutError(
        `Handler ${handler.functionName} timed out after ${handler.timeout}ms`
      ));
    }, handler.timeout);
  });

  try {
    const result = await Promise.race([
      handler.fn(payload, { ...ctx, pluginId: handler.pluginId }),
      timeoutPromise
    ]);

    // Update stats
    updateHandlerStats(handler, performance.now() - start, true);

    return result;
  } catch (error) {
    updateHandlerStats(handler, performance.now() - start, false);
    throw error;
  }
}
```

### 4.4 Circuit Breaker Logic

```typescript
function shouldSkipHandler(handler: RuntimeHookHandler): boolean {
  if (!handler.enabled) return true;

  const { circuitBreaker } = handler;

  if (circuitBreaker.state === 'closed') {
    return false;  // Normal execution
  }

  if (circuitBreaker.state === 'open') {
    // Check cooldown for half-open transition
    const now = Date.now();
    if (circuitBreaker.trippedAt &&
        now - circuitBreaker.trippedAt.getTime() > circuitBreaker.cooldownMs) {
      circuitBreaker.state = 'half-open';
      return false;  // Allow one attempt
    }
    return true;  // Still in cooldown, skip
  }

  // half-open: allow execution (will transition based on result)
  return false;
}

function handleExecutionError(handler: RuntimeHookHandler, error: Error): void {
  handler.stats.errorCount++;

  if (handler.stats.errorCount >= handler.circuitBreaker.threshold) {
    handler.circuitBreaker.state = 'open';
    handler.circuitBreaker.trippedAt = new Date();

    emit('hook.handler.tripped', {
      hookId: handler.hookId,
      pluginId: handler.pluginId,
      reason: error.message
    });
  }
}

function resetCircuitBreaker(handler: RuntimeHookHandler): void {
  handler.stats.errorCount = 0;
  handler.circuitBreaker.state = 'closed';
  handler.circuitBreaker.trippedAt = undefined;
}
```

---

## 5. Debugging: Execution Trace

### 5.1 Trace Data Structures

```typescript
interface HookTraceEntry {
  step: number;                  // Execution order: 1, 2, 3...
  pluginId: string;
  handlerName: string;
  priority: HookPriority;

  // Snapshots (lean mode: truncated for large objects)
  inputSnapshot: unknown;
  outputSnapshot?: unknown;

  duration: number;              // ms
  status: 'success' | 'error' | 'skipped' | 'timeout';
  error?: string;

  // Diff computed on frontend, not backend
}

interface HookExecutionTrace {
  hookId: string;
  traceId: string;
  timestamp: Date;

  initialValue: unknown;
  finalValue: unknown;
  entries: HookTraceEntry[];
  totalDuration: number;
}
```

### 5.2 Smart Snapshot Strategy

```typescript
type SnapshotMode = 'full' | 'lean';

interface LeanSnapshotOptions {
  maxStringLength: number;       // Default: 100
  maxArrayLength: number;        // Default: 5
  maxDepth: number;              // Default: 3
}

function createSnapshot(data: unknown, mode: SnapshotMode): unknown {
  if (mode === 'full') return structuredClone(data);

  return pruneLargeObjects(data, {
    maxStringLength: 100,
    maxArrayLength: 5,
    maxDepth: 3
  });
}
```

### 5.3 Trace Trigger Conditions

| Mode | Trigger | Auth Required |
|------|---------|---------------|
| Development | Always enabled | No |
| Production | `X-Debug-Hooks: true` header | **Admin role required** |
| On-Demand | Admin panel toggle | Admin session |

### 5.4 Example Output

```
[Hook Trace] content.beforeCreate (12.3ms)
┌─────┬────────────────┬──────────────┬────────┬───────────┐
│ #   │ Plugin         │ Handler      │ Time   │ Status    │
├─────┼────────────────┼──────────────┼────────┼───────────┤
│ 1   │ seo-optimizer  │ addMetaTags  │ 2.1ms  │ ✅        │
│ 2   │ spam-filter    │ checkContent │ 8.4ms  │ ✅        │
│ 3   │ broken-plugin  │ doSomething  │ -      │ ⏱️ timeout │
│ 4   │ analytics      │ trackCreate  │ 1.8ms  │ ✅        │
└─────┴────────────────┴──────────────┴────────┴───────────┘
Input:  { title: "Hello", body: "..." }
Output: { title: "Hello", body: "...", meta: { seo: true } }
```

---

## 6. Core Predefined Hooks

### 6.1 Content Management

| Hook ID | Type | Description |
|---------|------|-------------|
| `content.beforeCreate` | filter | Before creation, fill defaults, filter sensitive words |
| `content.afterCreate` | action | After creation, notifications, index sync |
| `content.onRead` | filter | On read, inject computed fields, field-level masking |
| `content.beforeUpdate` | filter | Before update, optimistic lock, immutable field protection |
| `content.afterUpdate` | action | After update, clear cache, webhook |
| `content.beforeDelete` | filter | Before delete, reference check (throw to abort) |
| `content.afterDelete` | action | After delete, cleanup orphan resources |
| `content.beforePublish` | filter | Before publish, approval workflow |
| `content.afterPublish` | action | After publish, SSG trigger, CDN push |
| `content.beforeUnpublish` | filter | Before unpublish |
| `content.afterUnpublish` | action | After unpublish |
| `content.onView` | action | On view, analytics |
| `content.beforeBulkCreate` | filter | Bulk create before |
| `content.afterBulkCreate` | action | Bulk create after |
| `content.beforeBulkUpdate` | filter | Bulk update before |
| `content.afterBulkUpdate` | action | Bulk update after |
| `content.beforeBulkDelete` | filter | Bulk delete before |
| `content.afterBulkDelete` | action | Bulk delete after |

### 6.2 User & Authentication

| Hook ID | Type | Description |
|---------|------|-------------|
| `user.beforeRegister` | filter | Before registration, invite code, blacklist |
| `user.afterRegister` | action | After registration, welcome email, CRM |
| `user.beforeLogin` | filter | Before login, 2FA, IP ban |
| `user.afterLogin` | action | After login, audit log |
| `user.onLoginFailed` | action | Login failed, security alert |
| `user.onLogout` | action | On logout, clear session |
| `auth.session.transform` | filter | Generate token, inject custom claims |
| `auth.password.request` | action | Password reset request |
| `user.onPasswordChange` | action | Password changed, force logout |
| `user.beforeUpdate` | filter | Profile update before |
| `user.afterUpdate` | action | Profile update after, third-party sync |
| `user.onBan` | action | User banned |
| `user.onRoleChange` | action | Role changed |
| `user.onPermissionChange` | action | Permission changed |

### 6.3 Product

| Hook ID | Type | Description |
|---------|------|-------------|
| `product.beforeCreate` | filter | Before creation, SKU generation |
| `product.afterCreate` | action | After creation, index sync |
| `product.onRead` | filter | On read, inject stock/labels |
| `product.beforeUpdate` | filter | Before update |
| `product.afterUpdate` | action | After update, clear cache |
| `product.priceCalculate` | filter | Single product price calculation |
| `product.beforePublish` | filter | Before publish |
| `product.afterPublish` | action | After publish |
| `product.beforeUnpublish` | filter | Before unpublish |
| `product.afterUnpublish` | action | After unpublish |
| `product.onStatusChange` | action | Status changed |
| `product.beforeAddVariant` | filter | Add variant before |
| `product.afterAddVariant` | action | Add variant after |
| `product.beforeBulkUpdate` | filter | Bulk update before |
| `product.afterBulkUpdate` | action | Bulk update after |

### 6.4 Inventory

| Hook ID | Type | Description |
|---------|------|-------------|
| `inventory.check` | filter | Check stock availability |
| `inventory.reserve` | action | Reserve stock (on order create) |
| `inventory.commit` | action | Commit stock (on payment success) |
| `inventory.release` | action | Release stock (on cancel/timeout) |

### 6.5 Cart

| Hook ID | Type | Description |
|---------|------|-------------|
| `cart.beforeAddItem` | filter | Add before, limit check |
| `cart.afterAddItem` | action | Add after |
| `cart.beforeUpdateItem` | filter | Update quantity before |
| `cart.afterUpdateItem` | action | Update quantity after |
| `cart.beforeRemoveItem` | filter | Remove before |
| `cart.afterRemoveItem` | action | Remove after |
| `cart.onCheckoutStart` | action | Checkout started |

### 6.6 Checkout Pipeline

| Hook ID | Type | Description |
|---------|------|-------------|
| `checkout.calculate.items` | filter | Line item price (tiered pricing, buy-N-get-M) |
| `checkout.calculate.discounts` | filter | Coupons, promo codes |
| `checkout.calculate.shipping` | filter | Shipping calculation |
| `checkout.calculate.tax` | filter | Tax calculation |
| `checkout.calculate.fees` | filter | Additional fees (packaging, insurance) |
| `checkout.calculate.total` | filter | Final total |
| `checkout.validate` | filter | Final validation before order |

### 6.7 Payment

| Hook ID | Type | Description |
|---------|------|-------------|
| `payment.provider.select` | filter | Filter available payment methods |
| `payment.beforeProcess` | filter | Before payment, risk control |
| `payment.afterSuccess` | action | Payment succeeded |
| `payment.onFailed` | action | Payment failed |

### 6.8 Order

| Hook ID | Type | Description |
|---------|------|-------------|
| `order.beforeCreate` | filter | Before order creation |
| `order.afterCreate` | action | After order creation |
| `order.beforeCancel` | filter | Before cancel |
| `order.afterCancel` | action | After cancel |
| `order.beforeRefund` | filter | Before refund |
| `order.afterRefund` | action | After refund |
| `order.onPartialRefund` | action | Partial refund |
| `order.onStatusChange` | action | Status changed |
| `order.beforeShip` | filter | Before shipping |
| `order.afterShip` | action | After shipping |
| `order.onPartialShip` | action | Partial shipping |
| `order.onDelivered` | action | Delivered |
| `order.beforeBulkCancel` | filter | Bulk cancel before |
| `order.afterBulkCancel` | action | Bulk cancel after |

### 6.9 Media

| Hook ID | Type | Description |
|---------|------|-------------|
| `media.beforeUpload` | filter | Upload before, type/size validation, virus scan |
| `media.afterUpload` | action | Upload after, queue processing task |
| `media.onProcess` | action | Async processing (compress, watermark) - non-blocking |
| `media.onProcessingComplete` | action | Processing completed callback |
| `media.transform` | filter | On-demand transform (URL params trigger dynamic crop) |
| `media.onRead` | filter | On read, dynamic URL signing |
| `media.beforeDelete` | filter | Delete before, reference check |
| `media.afterDelete` | action | Delete after, CDN cleanup |
| `media.beforeBulkDelete` | filter | Bulk delete before |
| `media.afterBulkDelete` | action | Bulk delete after |

### 6.10 System

| Hook ID | Type | Description |
|---------|------|-------------|
| `system.onStartup` | action | After startup |
| `system.onShutdown` | action | Before shutdown |
| `system.onError` | action | Global uncaught error |
| `system.health.check` | filter | Health probe (K8s/LB) |
| `system.config.onChange` | action | Config changed |
| `system.cache.beforeClear` | filter | Before cache clear |
| `system.cache.afterClear` | action | After cache clear |
| `system.cron.beforeRun` | filter | Before cron job |
| `system.cron.afterRun` | action | After cron job |

### 6.11 Database Migration

| Hook ID | Type | Description |
|---------|------|-------------|
| `db.migration.beforeApply` | filter | Before migration (auto backup) |
| `db.migration.afterApply` | action | After migration |

### 6.12 Plugin Lifecycle

| Hook ID | Type | Description |
|---------|------|-------------|
| `plugin.beforeInstall` | filter | Before install (**listened by other plugins**, e.g., security audit) |
| `plugin.afterInstall` | action | After install |
| `plugin.beforeEnable` | filter | Before enable |
| `plugin.afterEnable` | action | After enable |
| `plugin.beforeDisable` | filter | Before disable |
| `plugin.afterDisable` | action | After disable |
| `plugin.beforeUninstall` | filter | Before uninstall |
| `plugin.afterUninstall` | action | After uninstall |
| `plugin.beforeUpgrade` | filter | Before upgrade, version compatibility check |
| `plugin.onUpgrade` | action | After upgrade |
| `plugin.onError` | action | Runtime error |
| `plugin.onConflictDetected` | action | Dependency conflict detected |

### 6.13 Integration

| Hook ID | Type | Description |
|---------|------|-------------|
| `webhook.beforeSend` | filter | Before send, signing |
| `webhook.afterSend` | action | After send, logging |
| `webhook.onFailed` | action | Send failed |
| `webhook.onReceive` | filter | Receive external webhook |
| `api.beforeRequest` | filter | Before request, rate limiting/auth |
| `api.afterResponse` | filter | After response, formatting/masking |

### 6.14 Security & Audit

| Hook ID | Type | Description |
|---------|------|-------------|
| `audit.onLog` | action | Audit log written |
| `security.onThreatDetected` | action | Threat detected |
| `security.onSuspiciousBehavior` | action | Suspicious behavior (trigger 2FA) |
| `security.onRateLimitHit` | action | Rate limit triggered |
| `security.beforeSensitiveAction` | filter | Before sensitive action |

---

## 7. Plugin Developer API

### 7.1 Registering Hooks

```typescript
// In plugin's server entry
import { hooks } from '@wordrhyme/plugin';

// Register an action
hooks.addAction('content.afterCreate', async (content, ctx) => {
  await sendNotification(content.authorId, 'Your content was created!');
}, { priority: HookPriority.LATE });

// Register a filter
hooks.addFilter('content.beforeCreate', async (content, ctx) => {
  return {
    ...content,
    slug: generateSlug(content.title),
    readingTime: calculateReadingTime(content.body)
  };
}, { priority: HookPriority.NORMAL });
```

### 7.2 Aborting a Filter (Blocking Operation)

```typescript
import { HookAbortError } from '@wordrhyme/plugin';

hooks.addFilter('content.beforeDelete', async (content, ctx) => {
  const refs = await findReferences(content.id);
  if (refs.length > 0) {
    throw new HookAbortError(
      `Cannot delete: Referenced by ${refs.length} items`
    );
  }
  return content;
});
```

### 7.3 Manifest Declaration

```json
{
  "pluginId": "my-seo-plugin",
  "version": "1.0.0",
  "hooks": [
    {
      "hookId": "content.beforeCreate",
      "handler": "src/hooks.ts#injectSeoMeta",
      "priority": 50
    },
    {
      "hookId": "content.afterPublish",
      "handler": "src/hooks.ts#submitToSearchEngine"
    }
  ]
}
```

---

## 8. Implementation Plan

### Phase 1: Core Infrastructure (2 days)

- [ ] Define TypeScript interfaces (`HookDefinition`, `RuntimeHookHandler`, etc.)
- [ ] Implement `HookRegistry` class
- [ ] Implement `executeAction` and `executeFilter` functions
- [ ] Add timeout wrapper with `Promise.race`
- [ ] Add `structuredClone` defensive copying for filters

### Phase 2: Circuit Breaker & Stats (1 day)

- [ ] Implement circuit breaker state machine (`closed` → `open` → `half-open`)
- [ ] Add handler statistics tracking (callCount, errorCount, avgDuration)
- [ ] Emit events on circuit breaker state changes
- [ ] Add Admin API to view handler health

### Phase 3: Plugin Integration (1 day)

- [ ] Update `@wordrhyme/plugin` package with `hooks.addAction` / `hooks.addFilter` API
- [ ] Update Plugin Loader to parse `hooks` from manifest
- [ ] Register handlers on plugin enable, unregister on disable
- [ ] Add validation for hook IDs (must be Core-declared)

### Phase 4: Debugging & Trace (1 day)

- [ ] Implement `HookExecutionTrace` collection
- [ ] Add smart snapshot with `pruneLargeObjects`
- [ ] Add `X-Debug-Hooks` header support with Admin auth check
- [ ] Add Admin UI component for trace visualization

### Phase 5: Predefined Hooks (2 days)

- [ ] Declare all 80+ hooks in Core
- [ ] Add input/output schemas for critical filters (checkout.calculate.*, etc.)
- [ ] Pre-compile AJV validators on startup
- [ ] Add hook documentation generator

---

## 9. Security Considerations

1. **Trace Auth**: `X-Debug-Hooks` requires Admin JWT, never expose to public
2. **PII Masking**: Auto-mask sensitive fields in snapshots (`email`, `password`, `phone`)
3. **Schema Validation**: Always validate filter outputs in production (use pre-compiled validators)
4. **Circuit Breaker**: Prevent DoS from misbehaving plugins
5. **Defensive Copy**: `structuredClone` prevents reference pollution

---

## 10. Performance Considerations

1. **Function References**: Store `fn` directly, not string paths
2. **Pre-compiled Validators**: Compile AJV schemas at startup, not runtime
3. **Lean Snapshots**: Truncate large objects in trace mode
4. **Lazy Diff**: Compute JSON diff on frontend, not backend
5. **Parallel Actions**: Use `Promise.allSettled` for non-blocking action execution

---

## Appendix A: Error Types

```typescript
class HookTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookTimeoutError';
  }
}

class HookAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookAbortError';
  }
}

class HookValidationError extends Error {
  constructor(public hookId: string, public pluginId: string, message: string) {
    super(message);
    this.name = 'HookValidationError';
  }
}
```

---

## Appendix B: Admin UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Hook System Dashboard                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 Overview                                                 │
│  ├── Total Hooks: 84                                         │
│  ├── Registered Handlers: 127                                │
│  ├── Tripped Handlers: 2 ⚠️                                   │
│  └── Avg Execution Time: 4.2ms                               │
│                                                              │
│  🔥 Hot Hooks (by call count)                                │
│  ┌────────────────────────┬──────────┬──────────┐            │
│  │ Hook                   │ Handlers │ Avg Time │            │
│  ├────────────────────────┼──────────┼──────────┤            │
│  │ content.onRead         │ 5        │ 2.1ms    │            │
│  │ checkout.calculate.*   │ 8        │ 12.4ms   │            │
│  │ product.priceCalculate │ 3        │ 1.8ms    │            │
│  └────────────────────────┴──────────┴──────────┘            │
│                                                              │
│  ⚠️ Tripped Handlers                                          │
│  ┌────────────────┬────────────────┬─────────────────────┐   │
│  │ Plugin         │ Hook           │ Reason              │   │
│  ├────────────────┼────────────────┼─────────────────────┤   │
│  │ broken-plugin  │ content.before │ Timeout (5 times)   │   │
│  │ old-analytics  │ user.afterLogin│ TypeError           │   │
│  └────────────────┴────────────────┴─────────────────────┘   │
│                                                              │
│  [Enable Trace Mode] [Reset All Circuit Breakers]            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

**Document Status**: Complete
**Next Step**: User approval, then implementation
