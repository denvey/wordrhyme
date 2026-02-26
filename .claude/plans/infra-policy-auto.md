# 全自动 Infra Policy 实施计划（v2 — Context Swap）— 已完成

> **状态**: v1 已实施完成
> **实施日期**: 2026-02-26
> **改动要点**:
> - Infra policy middleware 提升到 `procedureBase` 层（public + protected 共享）
> - 自动检测 `meta.permission.subject` → module 映射
> - READ-only Context Swap（WRITE 保持原始 organizationId）
> - `AuditMeta.infraPolicy` 字段已移除
> - `validationOrgId` 已移除
>
> **v1 已知限制**:
> - publicProcedure 的公开 API 未声明 `permission.subject`，仍手动调 `resolveEffectiveOrgId`
> - 开发者需手动在 procedure 上声明 `subject`，忘写不会报错（静默不生效）
>
> **v2 规划方向**:
> - `subject` 提升为 `AuditMeta` 顶层字段，与 `permission.action` 解耦
> - `createCrudRouter` 从 table 注册自动推导 subject
> - 启动时校验：操作 infra policy table 但未声明 subject 的 procedure 打 warning
> - Overlay/Merge 模型支持（弱关联模块如通知模板、主题色）

## 多模型评估发现的关键问题

原方案（v1）在 ScopedDb 中新增 `effectiveOrganizationId` 字段用于 SELECT。
经 Codex + Gemini 交叉评估，发现 **4 个关键缺陷**：

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | **Double WHERE 冲突** | 🔴 | Service 层手动传 `organizationId` 参数 + ScopedDb 自动注入租户过滤器，两者值不同时查询返回空 |
| 2 | **INSERT 路径不安全** | 🔴 | `processValue`（INSERT FORCE override）与 `buildLbacFilter`（SELECT WHERE）共用 `getCurrentContext()`，改一个影响另一个 |
| 3 | **publicProcedure 缺口** | 🟡 | Infra policy middleware 仅在 `protectedProcedure` 链上，`publicProcedure` 的 API 不会被自动处理 |
| 4 | **switchToCustom 鸡蛋悖论** | 🔴 | switchToCustom 用 `subject: 'Currency'` → 自动映射到 currency 模块 → guard 检查 `allow_override + 无自定义` → 阻断。但 switchToCustom **就是**创建自定义数据的操作 |

---

## 核心设计变更：Context Swap

**原方案**：在 ScopedDb 的 SELECT 路径中添加 `effectiveOrganizationId` 优先级逻辑。
**修订方案**：直接在 middleware 中**替换** `organizationId`，将原值存为 `originalOrganizationId`。

```
请求进来
  → 全局 middleware 读 permission.subject
  → 查 subject→module 映射（如 'Currency' → 'currency'）
  → 查 module 是否启用 infra policy
  → YES:
      WRITE action → enforceInfraPolicy（拦截或放行）
      ALL actions  → resolveEffectiveOrg → 结果覆写 organizationId
                     原始值存入 originalOrganizationId
  → ScopedDb 全程用 organizationId（已被替换，零改动）
  → Service 方法用 ctx.organizationId（已被替换，零改动）
```

### 安全性证明

**WRITE 操作**：guard 放行后，effectiveOrg ≡ originalOrg，覆写无实质影响。

| mode | guard 结果 | effectiveOrg | originalOrg | 相等？ |
|------|-----------|--------------|-------------|--------|
| unified + 租户 | 阻断 | — | — | 不执行 |
| require_tenant | 放行 | tenantId | tenantId | ✅ |
| allow_override + 有自定义 | 放行 | tenantId | tenantId | ✅ |
| allow_override + 无自定义 | 阻断 | — | — | 不执行 |

INSERT/UPDATE/DELETE 使用覆写后的 `organizationId` = 原始值，安全。

**READ 操作**：`organizationId` 被替换为 effectiveOrg（可能是 `'platform'`），ScopedDb 自动查正确的 org 数据。

### 与原方案的关键区别

| 维度 | v1 (effectiveOrganizationId) | v2 (Context Swap) |
|------|------|------|
| ScopedDb 改动 | 需修改 `buildLbacFilter` | **零改动** |
| Double WHERE 冲突 | 存在（service 传原值 vs ScopedDb 用 effective） | **不存在**（两者用同一个被替换的值） |
| INSERT 安全 | 需特殊处理（processValue 不能用 effective） | **天然安全**（guard 保证相等） |
| Service 层改动 | 需移除手动 orgId 参数 | **零改动**（手动参数自动同步） |

---

## Step 1: 扩展 infra-policy-guard.ts — subject 映射 + resolveEffectiveOrg

**文件**: `apps/server/src/trpc/infra-policy-guard.ts`

### 1a. 新增 subject→module 映射

```typescript
// Subject → Module 映射
const subjectToModule = new Map<string, string>();

export function registerInfraSubjects(module: string, subjects: string[]): void {
  for (const subject of subjects) {
    subjectToModule.set(subject, module);
  }
}

export function getModuleForSubject(subject: string): string | undefined {
  return subjectToModule.get(subject);
}
```

### 1b. 新增通用 org 解析函数

```typescript
/**
 * Resolve the effective organization ID based on infra policy mode.
 *
 * - unified → 'platform' (tenant reads platform data)
 * - require_tenant → organizationId (tenant reads own data)
 * - allow_override + has custom → organizationId
 * - allow_override + no custom → 'platform'
 */
export async function resolveEffectiveOrg(
  module: string,
  organizationId: string,
): Promise<string> {
  if (organizationId === 'platform') return 'platform';

  const resolver = resolvers.get(module);
  if (!resolver) return organizationId;

  const mode = await resolver.getMode();
  switch (mode) {
    case 'unified': return 'platform';
    case 'require_tenant': return organizationId;
    case 'allow_override': {
      const hasCustom = await resolver.hasCustomData(organizationId);
      return hasCustom ? organizationId : 'platform';
    }
  }
}
```

---

## Step 2: 扩展 RequestContext — 新增 originalOrganizationId

**文件**: `apps/server/src/context/async-local-storage.ts`

```diff
 export interface RequestContext {
     requestId: string;
     organizationId?: string;
+    /** Original organization ID before infra policy swap (for source tagging & audit) */
+    originalOrganizationId?: string;
     userId?: string;
     // ... rest unchanged
 }
```

**注意**：不需要 `effectiveOrganizationId`。`organizationId` 本身就是 effective 值。

---

## Step 3: 更新全局 middleware — 自动检测 + Context Swap

**文件**: `apps/server/src/trpc/trpc.ts`

替换当前的 infra policy middleware（从读 `meta.infraPolicy` 改为读 `permission.subject` + Context Swap）：

```typescript
/**
 * Global Infra Policy Middleware (Context Swap)
 *
 * 1. Reads permission.subject from tRPC meta
 * 2. Looks up subject→module mapping
 * 3. WRITE guard: blocks mutations when policy disallows
 * 4. Context Swap: replaces organizationId with effective org
 *
 * Skips if no permission.subject or no registered module.
 */
middleware(async ({ meta, ctx, next }) => {
    const subject = meta?.permission?.subject;
    if (!subject) return next({ ctx });

    const module = getModuleForSubject(subject);
    if (!module) return next({ ctx });

    const orgId = ctx.organizationId;
    if (!orgId || orgId === 'platform') return next({ ctx });

    // 1. WRITE guard (unchanged logic)
    const action = meta?.permission?.action;
    await enforceInfraPolicy(module, orgId, action);

    // 2. Context Swap: resolve effective org and overwrite
    const effectiveOrg = await resolveEffectiveOrg(module, orgId);

    if (effectiveOrg !== orgId) {
        // Swap organizationId in AsyncLocalStorage context
        const store = requestContextStorage.getStore();
        if (store) {
            store.originalOrganizationId = orgId;
            store.organizationId = effectiveOrg;
        }

        // Swap organizationId in tRPC ctx
        return next({
            ctx: {
                ...ctx,
                organizationId: effectiveOrg,
                originalOrganizationId: orgId,
            },
        });
    }

    return next({ ctx });
})
```

### 导入变更

```diff
- import { enforceInfraPolicy } from './infra-policy-guard';
+ import { enforceInfraPolicy, getModuleForSubject, resolveEffectiveOrg } from './infra-policy-guard';
```

---

## Step 4: 更新 AuditMeta — 移除 infraPolicy

**文件**: `apps/server/src/audit/audit-context.ts`

```diff
 export interface AuditMeta {
     audit?: BusinessAuditMeta;
     permission?: { action: string; subject: string };
-    /** Infra policy guard — auto-enforces mutation guard for the declared module */
-    infraPolicy?: { module: string };
 }
```

---

## Step 5: 清理 currency.ts

**文件**: `apps/server/src/trpc/routers/currency.ts`

### 5a. 注册 subject→module 映射

```diff
 registerInfraPolicyResolver('currency', {
     getMode: getCurrencyPolicyMode,
     hasCustomData: (orgId) => getCurrencyService().hasAnyCurrencies(orgId),
 });
+
+ registerInfraSubjects('currency', ['Currency', 'ExchangeRate']);
```

需要新增导入：
```diff
- import { registerInfraPolicyResolver } from '../infra-policy-guard.js';
+ import { registerInfraPolicyResolver, registerInfraSubjects } from '../infra-policy-guard.js';
```

### 5b. 移除所有 infraPolicy meta

```diff
 return protectedProcedure.meta({
     permission: { action, subject: 'Currency' },
-    infraPolicy: { module: 'currency' },
 });
```

同样移除 ExchangeRate 的 `rates.set` 和 `rates.bulkImport` 等 procedure 上的 infraPolicy。

### 5c. switchToCustom / resetToPlatform — 改用 CurrencyPolicy subject

**问题**：如果用 `subject: 'Currency'`，会触发 subject→module 映射 → guard 检查 → `allow_override + 无自定义` → 阻断。
**解决**：用 `CurrencyPolicy`（不在 subject→module 映射中），绕过自动 guard。

```diff
 switchToCustom: protectedProcedure
-   .meta({ permission: { action: 'update', subject: 'Currency' } })
+   .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
    .mutation(async ({ ctx }) => {
```

```diff
 resetToPlatform: protectedProcedure
-   .meta({ permission: { action: 'update', subject: 'Currency' } })
+   .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
    .mutation(async ({ ctx }) => {
```

> 注：RBAC 需为 `CurrencyPolicy` subject 配置 `manage` 权限，或将其映射为 Currency 的别名。

### 5d. 简化 setRateForCurrency

```diff
 async function setRateForCurrency(
     ctx: Context,
     currency: { code: string; isBase: number },
     rateValue: string,
 ) {
     if (currency.isBase === 1) return;
     const parsed = parseFloat(rateValue);
     if (isNaN(parsed) || parsed <= 0) return;

     const service = getCurrencyService();
     const baseCurrency = await service.getBaseCurrency(ctx.organizationId!);
     if (!baseCurrency) return;

-    const mode = await getCurrencyPolicyMode();
-    const { orgId: resolvedOrgId } = await resolveEffectiveOrgId(ctx.organizationId!, mode);
     const rateService = getExchangeRateService();
     await rateService.setRate({
         organizationId: ctx.organizationId!,
-        validationOrgId: resolvedOrgId,
         baseCurrency: baseCurrency.code,
         targetCurrency: currency.code,
         rate: rateValue,
         source: 'manual',
         effectiveAt: new Date(),
         updatedBy: ctx.userId!,
     });
 }
```

**原理**：Context Swap 已将 `ctx.organizationId` 替换为 effectiveOrg。
对于 WRITE（create/update），guard 保证 effectiveOrg === originalOrg，所以 `ctx.organizationId!` 就是正确的写入目标。
`setRate` 内部的 `getByCode(organizationId, ...)` 也使用被替换后的值，ScopedDb 自动一致。

### 5e. 简化 currencies.list middleware

```diff
 list: async ({ ctx, input, next }) => {
     const typedCtx = ctx as Context;
     const orgId = typedCtx.organizationId;

     // Platform admin uses default auto-CRUD
     if (!orgId || orgId === 'platform') {
         const result = await next(input);
         return {
             ...result,
             data: result.data.map((c: any) => ({ ...c, source: 'platform' })),
         };
     }

-    const mode = await getCurrencyPolicyMode();
-
-    // require_tenant: default auto-CRUD behavior + source tag
-    if (mode === 'require_tenant') {
-        const result = await next(input);
-        return {
-            ...result,
-            data: result.data.map((c: any) => ({ ...c, source: 'tenant' })),
-        };
-    }
-
-    // unified or allow_override: resolve via service
-    const service = getCurrencyService();
-    const resolved = await service.getResolvedCurrencies(orgId, mode);
-    const page = input.page || 1;
-    const perPage = input.perPage || 20;
-    const start = (page - 1) * perPage;
-    const paged = resolved.slice(start, start + perPage);
-    return { data: paged as any, total: resolved.length, page, perPage, pageCount: Math.ceil(resolved.length / perPage) };
+    // Context Swap 已将 organizationId 替换为 effectiveOrg
+    // auto-CRUD 的 next() 会用 ScopedDb 查 effectiveOrg 的数据
+    const result = await next(input);
+    // source 标记：originalOrganizationId 存在且不同于当前 → 读的是平台数据
+    const originalOrg = (typedCtx as any).originalOrganizationId;
+    const source = originalOrg && originalOrg !== orgId ? 'platform' : 'tenant';
+    return {
+        ...result,
+        data: result.data.map((c: any) => ({ ...c, source })),
+    };
 },
```

**⚠️ 前提**：currencies.list 使用 `publicProcedure`（line 269-270），不在 protectedProcedure 链上，Context Swap middleware 不会执行。

**解决方案**（二选一）：
- **方案 A（推荐）**：将 list/get 改为 `protectedProcedure`（需要登录才能管理货币，合理）
- **方案 B**：保持 publicProcedure，list/get middleware 中手动调 `resolveEffectiveOrg`

选择方案 A 最简单，因为 currencies 管理页面本身就需要登录：

```diff
 procedure: (op: CrudOperation) => {
-    if (op === 'list' || op === 'get') {
-        return publicProcedure;
-    }
     const action = op === 'list' || op === 'get' ? 'read' :
         op === 'deleteMany' ? 'delete' :
         op === 'updateMany' ? 'update' : op;
     return protectedProcedure.meta({
         permission: { action, subject: 'Currency' },
-        infraPolicy: { module: 'currency' },
     });
 },
```

### 5f. 简化 currencies.get middleware

同理，Context Swap 后 `next()` 即可：

```diff
 get: async ({ ctx, id, next }) => {
-    const typedCtx = ctx as Context;
-    const orgId = typedCtx.organizationId;
-    if (!orgId || orgId === 'platform') {
-        const result = await next();
-        return result ? { ...result, source: 'platform' } : null;
-    }
-    const mode = await getCurrencyPolicyMode();
-    const service = getCurrencyService();
-    const resolved = await service.getResolvedCurrencies(orgId, mode);
-    const found = resolved.find((c) => c.id === id);
-    return (found as any) ?? null;
+    const result = await next();
+    if (!result) return null;
+    const typedCtx = ctx as Context;
+    const originalOrg = (typedCtx as any).originalOrganizationId;
+    const source = originalOrg && originalOrg !== typedCtx.organizationId ? 'platform' : 'tenant';
+    return { ...result, source };
 },
```

### 5g. publicProcedure 的 API（getCurrencies, convert, rates.*）

这些 API 不在 protectedProcedure 链上，Context Swap 不会自动执行。
**v1 保持手动处理**，不改动。

```typescript
// 保持不变：
getCurrencies: publicProcedure.query(async ({ ctx }) => {
    const mode = await getCurrencyPolicyMode();
    const result = await currencyService.getEnabledForOrganization(organizationId, mode);
    // ...
}),

rates.list: publicProcedure.query(async ({ ctx }) => {
    const mode = await getCurrencyPolicyMode();
    const { orgId: resolvedOrgId } = await resolveEffectiveOrgId(orgId, mode);
    // ...
}),
```

---

## Step 6: 清理 exchange-rate.service.ts — 移除 validationOrgId

**文件**: `apps/server/src/billing/services/exchange-rate.service.ts`

```diff
 export interface SetRateInput {
     organizationId: string;
-    /** Organization ID for currency validation (resolved by policy mode). Defaults to organizationId. */
-    validationOrgId?: string;
     baseCurrency: string;
     targetCurrency: string;
     // ...
 }

 async setRate(input: SetRateInput) {
     const {
         organizationId,
-        validationOrgId = organizationId,
         baseCurrency,
         targetCurrency,
         // ...
     } = input;

     const [baseCurr, targetCurr] = await Promise.all([
-        this.currencyService.getByCode(validationOrgId, baseCurrency),
-        this.currencyService.getByCode(validationOrgId, targetCurrency),
+        this.currencyService.getByCode(organizationId, baseCurrency),
+        this.currencyService.getByCode(organizationId, targetCurrency),
     ]);
     // ...
 }
```

**原理**：Context Swap 后，传入的 `organizationId` 已经是 effectiveOrg（对 WRITE 场景等于 originalOrg）。
`getByCode` 的手动 WHERE 和 ScopedDb 的自动 WHERE 用同一个值，不会冲突。

---

## 已移除的步骤

| 原步骤 | 状态 | 理由 |
|--------|------|------|
| ~~Step 4: 更新 ScopedDb~~ | ❌ 移除 | Context Swap 不需要修改 ScopedDb |
| ~~Step 7: 移除 resolveEffectiveOrgId 导出~~ | ❌ 移除 | publicProcedure 的 API 仍需使用 |

---

## 改动文件清单

| 文件 | 改动 | 风险 |
|------|------|------|
| `trpc/infra-policy-guard.ts` | +subject 映射 +resolveEffectiveOrg | 低 |
| `context/async-local-storage.ts` | +originalOrganizationId 字段 | 低 |
| `trpc/trpc.ts` | 替换 infra policy middleware 为 Context Swap | 中 |
| `audit/audit-context.ts` | 移除 infraPolicy 字段 | 低 |
| `trpc/routers/currency.ts` | 注册 subjects + 移除 infraPolicy meta + 简化 middleware | 中 |
| `billing/services/exchange-rate.service.ts` | 移除 validationOrgId | 低 |

**ScopedDb**: 零改动 ✅
**Service 层**: 零签名变更 ✅

---

## 开发者体验（最终效果）

```typescript
// 开发者只写这些（和普通 CRUD 一模一样）：
export const storageRouter = createCrudRouter({
  table: storageBuckets,
  procedure: (op) => {
    const action = op === 'list' || op === 'get' ? 'read' : op;
    return protectedProcedure.meta({
      permission: { action, subject: 'StorageBucket' },
    });
  },
});

// 模块初始化注册（一次性，Core/Plugin bootstrap 做）：
registerInfraPolicyResolver('storage', { getMode, hasCustomData });
registerInfraSubjects('storage', ['StorageBucket', 'StorageObject']);

// 系统自动处理：guard + context swap + ScopedDb
// 开发者零感知
```

---

## 风险与限制

### v1 已知限制

1. **publicProcedure 不自动处理** — 没有 `permission.subject`，无法自动检测模块。
   公开 API（如 `getCurrencies`、`rates.list`）仍需手动调用 `resolveEffectiveOrgId`。
   *影响*：有限，公开 API 数量少，且只需 READ 解析。

2. **CurrencyPolicy RBAC 配置** — 需为 `CurrencyPolicy` subject 配置 `manage` 权限。
   可映射为现有 `Currency` 权限的别名。

### 性能考量

3. **hasCustomData 频繁调用** — 每个 `allow_override` 请求都查 DB。
   *缓解*：`resolveEffectiveOrg` 内部可加请求级 memo（同一请求内缓存结果）。

4. **getMode 频繁调用** — 每个映射到 infra policy 的请求都读 Settings。
   *缓解*：Settings 服务通常已有短 TTL 缓存（60s），无需额外处理。

### 安全保障

5. **Context Swap 安全** — guard 在 swap 之前执行，确保 WRITE 操作的 effectiveOrg === originalOrg。
   数学证明见上方"安全性证明"表格。

6. **审计追溯** — `originalOrganizationId` 保留在 context 中，审计日志可记录：
   "用户属于 org-123，实际读取了 platform 的数据"。
