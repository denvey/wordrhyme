# Infra Policy 演进计划

## v1 — Context Swap（已完成）

> **状态**: 已实施完成
> **实施日期**: 2026-02-26
> **改动要点**:
> - Infra policy middleware 提升到 `procedureBase` 层（public + protected 共享）
> - 自动检测 `meta.permission.subject` → module 映射
> - READ-only Context Swap（WRITE 保持原始 organizationId）
> - `AuditMeta.infraPolicy` 字段已移除
> - `validationOrgId` 已移除

### v1 已知限制

1. publicProcedure 的公开 API 未声明 `permission.subject`，仍手动调 `resolveEffectiveOrgId`
2. 开发者需手动在 procedure 上声明 `subject`，忘写不会报错（静默不生效）
3. 需手动调 `registerInfraPolicyResolver()` + `registerInfraSubjects()` 注册模块
4. Core 和插件用不同的注册方式（Core 手动、插件需 manifest 声明）

---

## v2 — Path-Driven, Settings-Only（规划中）

> **状态**: 设计完成，已通过多模型评审（Codex + Gemini），待实施
> **核心变更**: 废弃 subject→module 映射和 resolver 注册，改用请求路径识别模块 + 纯 Settings 驱动

### 设计动机

经多模型评估（Codex + Gemini 交叉验证），v1 的 subject 依赖有以下问题：

| 问题 | 影响 |
|------|------|
| publicProcedure 无 subject | 公开路由无法自动处理 |
| 插件开发者忘写 subject | 静默不生效，无法发现 |
| 插件需要在 manifest 声明 `tenantOverride` | 额外配置负担 |
| Core 和插件注册方式不同 | 两套机制，维护成本高 |
| Billing 系统也需要扫描路由 | 两个系统重复扫描 |

**关键洞察**：请求路径 `pluginApis.{pluginId}.{procedure}` 和 `{routerName}.{procedure}` 天然包含模块标识，不需要任何声明或注册。

### 核心设计

```
请求进入
  │
  ├─ getModuleFromPath(path)           ← 注意：path 是 middleware 独立参数
  │   ├─ pluginApis.lbac-teams.list → module = 'lbac-teams'
  │   └─ currency.list              → module = 'currency'
  │
  ├─ getMode(module) ← Settings 查询（TTL ~300s 缓存，set() 主动失效）
  │   └─ 未配置 → 'require_tenant' → 直接放行（等价于无 infra policy）
  │
  ├─ 元操作豁免？（switchToCustom / resetToPlatform）
  │   └─ 直接放行（解决鸡蛋悖论）
  │
  ├─ WRITE action?  ← 从 meta?.permission?.action 读取
  │   └─ enforceGuard(mode, module, orgId)
  │
  └─ READ action?
      └─ resolveEffectiveOrg(mode, module, orgId)
          └─ effectiveOrg ≠ orgId → Context Swap
```

### 与 v1 的关键区别

| 维度 | v1 (Subject-Based) | v2 (Path-Driven) |
|------|-----|------|
| 模块识别 | `meta.permission.subject` → subjectToModule Map | 请求路径直接提取 |
| 策略查询 | `resolver.getMode()` | Settings 通用查询 |
| 自定义检测 | `resolver.hasCustomData(orgId)` | Settings 标记 |
| 注册 | 手动 `registerInfraPolicyResolver` + `registerInfraSubjects` | **零注册** |
| Core vs 插件 | 不同注册方式 | **统一机制** |
| 公开路由 | 不支持（无 subject） | **自动支持**（路径识别） |
| 开发者感知 | 需写 subject + 注册 resolver | **零感知** |

### 废弃清单

| 废弃项 | 替代 |
|--------|------|
| `registerInfraPolicyResolver()` | Settings 通用查询 |
| `registerInfraSubjects()` | 路径提取 |
| `subjectToModule` Map | `getModuleFromPath()` |
| `InfraPolicyResolver` 接口 | 无需，Settings 直接查 |
| `getModuleForSubject()` | `getModuleFromPath()` |
| `resolvers` Map | 无需 |
| `resolveEffectiveOrgId()` 导出 | middleware 内部处理 |

---

## 实施步骤

### Step 1: 重写 infra-policy-guard.ts — 路径驱动 + Settings 查询

**文件**: `apps/server/src/trpc/infra-policy-guard.ts`

#### 1a. 新增路径提取函数（替代 subject→module 映射）

```typescript
/**
 * Extract module name from tRPC procedure path.
 *
 * - pluginApis.lbac-teams.members.invite → 'lbac-teams'
 * - currency.list                        → 'currency'
 * - billing.plans.create                 → 'billing'
 */
export function getModuleFromPath(path: string): string | null {
  // Plugin route: pluginApis.{pluginId}.xxx
  const pluginMatch = path.match(/^pluginApis\.([^.]+)/);
  if (pluginMatch) return pluginMatch[1];

  // Core route: {routerName}.xxx
  const dotIndex = path.indexOf('.');
  if (dotIndex > 0) return path.substring(0, dotIndex);

  return null;
}

/**
 * Extract procedure name (last segment) from tRPC path.
 * Used for meta-operation bypass (switchToCustom, resetToPlatform).
 */
export function getProcedureNameFromPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot > 0 ? path.substring(lastDot + 1) : path;
}

/**
 * Procedure names that are exempt from infra policy guard.
 * These are meta-operations that modify policy state itself.
 */
const BYPASS_PROCEDURES = new Set(['switchToCustom', 'resetToPlatform']);
```

#### 1b. 新增策略查询（启动加载 + 事件刷新）

```typescript
import type { SettingsService } from '../settings/settings.service';

let _settings: SettingsService | null = null;

/**
 * In-memory policy mode cache.
 * 策略模式是配置级数据，极少变化，无需每次请求查 Settings。
 * 加载时机：启动时 + 插件安装/卸载时 + Admin 修改策略时。
 */
const policyModeCache = new Map<string, InfraPolicyMode>();

export async function initInfraPolicySettings(settings: SettingsService): Promise<void> {
  _settings = settings;
  // 启动时一次性加载所有已配置的模块策略
  await loadAllPolicyModes();
}

/**
 * Assert Settings is initialized. Fail-fast if not.
 * 防止未初始化时静默返回 require_tenant 导致 guard 失效。
 */
function assertSettingsReady(): SettingsService {
  if (!_settings) {
    throw new Error(
      '[InfraPolicy] SettingsService not initialized. Call initInfraPolicySettings() in module bootstrap.'
    );
  }
  return _settings;
}

/**
 * Load all infra policy modes from Settings into memory.
 * Called at startup and on plugin install/uninstall.
 */
async function loadAllPolicyModes(): Promise<void> {
  const settings = assertSettingsReady();
  const allSettings = await settings.listByPrefix('global', 'infra.policy.');
  policyModeCache.clear();
  for (const s of allSettings) {
    const module = s.key.replace('infra.policy.', '');
    const parsed = infraPolicyModeSchema.safeParse(s.value?.mode ?? s.value);
    if (parsed.success) {
      policyModeCache.set(module, parsed.data);
    }
  }
}

/**
 * Refresh policy mode for a single module.
 * Called when Admin changes a module's infra policy setting.
 */
export async function refreshPolicyMode(module: string): Promise<void> {
  const settings = assertSettingsReady();
  const raw = await settings.get('global', `infra.policy.${module}`, {
    defaultValue: null,
  });
  if (!raw) {
    policyModeCache.delete(module);
  } else {
    const parsed = infraPolicyModeSchema.safeParse(raw?.mode ?? raw);
    if (parsed.success) {
      policyModeCache.set(module, parsed.data);
    }
  }
}

/**
 * Get infra policy mode for a module. Synchronous — reads from in-memory cache.
 * Returns 'require_tenant' if not configured (= no infra policy effect).
 *
 * 策略模式只在以下时机变化：
 * 1. 应用启动时加载
 * 2. 插件安装/卸载时刷新
 * 3. Admin 修改 Settings 时刷新（Settings set 触发 refreshPolicyMode）
 */
export function getMode(module: string): InfraPolicyMode {
  return policyModeCache.get(module) ?? 'require_tenant';
}

/**
 * Check if a tenant has customized data for a module.
 * Uses a Settings flag set by switchToCustom / cleared by resetToPlatform.
 *
 * 注意：这个仍然需要每次查询（带 ~300s 缓存），因为：
 * - 它是租户级数据，不同租户状态不同
 * - 运行时会变化（switchToCustom / resetToPlatform 操作）
 *
 * Settings key: tenant scope, key = `infra.customized.{module}`, organizationId
 */
export async function hasCustomData(module: string, organizationId: string): Promise<boolean> {
  const settings = assertSettingsReady();
  return await settings.get('tenant', `infra.customized.${module}`, {
    organizationId,
    defaultValue: false,
  });
}
```

#### 1c. 更新 enforceInfraPolicy（移除 resolver 依赖）

```typescript
export async function enforceInfraPolicy(
  module: string,
  organizationId: string,
  action: string | undefined,
): Promise<void> {
  if (!organizationId || organizationId === 'platform') return;
  if (!action || !WRITE_ACTIONS.has(action)) return;

  const mode = await getMode(module);

  if (mode === 'unified') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Configuration is managed by the platform',
    });
  }

  if (mode === 'allow_override') {
    const hasCustom = await hasCustomData(module, organizationId);
    if (!hasCustom) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Switch to custom configuration first',
      });
    }
  }

  // require_tenant: always allow writes
}
```

#### 1d. 更新 resolveEffectiveOrg（移除 resolver 依赖）

```typescript
export async function resolveEffectiveOrg(
  module: string,
  organizationId: string,
): Promise<string> {
  if (organizationId === 'platform') return 'platform';

  const mode = await getMode(module);
  switch (mode) {
    case 'unified': return 'platform';
    case 'require_tenant': return organizationId;
    case 'allow_override': {
      const hasCustom = await hasCustomData(module, organizationId);
      return hasCustom ? organizationId : 'platform';
    }
  }
}
```

#### 1e. 删除旧的注册机制

```diff
- const resolvers = new Map<string, InfraPolicyResolver>();
- const subjectToModule = new Map<string, string>();
-
- export function registerInfraPolicyResolver(module: string, resolver: InfraPolicyResolver): void {
-   resolvers.set(module, resolver);
- }
-
- export function registerInfraSubjects(module: string, subjects: string[]): void {
-   for (const subject of subjects) {
-     subjectToModule.set(subject, module);
-   }
- }
-
- export function getModuleForSubject(subject: string): string | undefined {
-   return subjectToModule.get(subject);
- }
-
- export interface InfraPolicyResolver {
-   getMode: () => Promise<InfraPolicyMode>;
-   hasCustomData: (organizationId: string) => Promise<boolean>;
- }
```

---

### Step 2: 更新全局 middleware — 路径驱动 Context Swap

**文件**: `apps/server/src/trpc/trpc.ts`

```typescript
/**
 * Global Infra Policy Middleware (v2: Path-Driven Context Swap)
 *
 * 1. Extracts module from request path (Core: first segment, Plugin: pluginId)
 * 2. Bypasses meta-operations (switchToCustom, resetToPlatform) — 解决鸡蛋悖论
 * 3. Queries Settings for policy mode (cached ~300s, no registration needed)
 * 4. WRITE guard: blocks mutations when policy disallows
 * 5. READ Context Swap: replaces organizationId with effective org
 *
 * Skips if:
 * - Path has no module (e.g., health check)
 * - No policy configured for this module (default = require_tenant = no effect)
 * - User is platform admin
 * - Procedure is a meta-operation (switchToCustom / resetToPlatform)
 */
const globalInfraPolicyMiddleware = middleware(async ({ meta, ctx, next, path }) => {
    const orgId = ctx.organizationId;
    if (!orgId || orgId === 'platform') return next({ ctx });

    const module = getModuleFromPath(path);
    if (!module) return next({ ctx });

    // 元操作豁免：switchToCustom / resetToPlatform 是修改策略状态的操作，
    // 不能被自己的策略 guard 拦截（鸡蛋悖论）
    const procedureName = getProcedureNameFromPath(path);
    if (BYPASS_PROCEDURES.has(procedureName)) return next({ ctx });

    const mode = getMode(module);  // 同步读取内存缓存，无 I/O
    if (mode === 'require_tenant') return next({ ctx }); // 未配置或默认，直接放行

    // 1. WRITE guard — 从 meta 独立参数读取 action
    const action = meta?.permission?.action;
    await enforceInfraPolicy(module, orgId, action);

    // 2. READ Context Swap
    const isWrite = action && WRITE_ACTIONS.has(action);
    if (!isWrite) {
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
    }

    return next({ ctx });
});
```

**关键修复（来自多模型评审 P0）**：

1. **`path` 是 middleware 独立参数**：tRPC middleware 签名是 `({ meta, ctx, next, path, type })`，`path` 不在 `ctx` 上。v2 计划初版错误使用了 `ctx.path`。
2. **`meta` 是 middleware 独立参数**：不是 `(ctx as any)._meta`。如果 action 读取失败，WRITE guard 变成 no-op，mutations 被当作 reads 处理 → Context Swap 到 platform → 数据污染。
3. **元操作豁免**：`switchToCustom` 的路径 `currency.policy.switchToCustom` → module = `currency` → guard 检测到 `allow_override` + 无自定义数据 → 阻断。解决方案：通过 procedure name 识别元操作并豁免。

### 导入变更

```diff
- import { enforceInfraPolicy, getModuleForSubject, resolveEffectiveOrg, WRITE_ACTIONS } from './infra-policy-guard';
+ import { enforceInfraPolicy, getModuleFromPath, getMode, getProcedureNameFromPath, BYPASS_PROCEDURES, resolveEffectiveOrg, WRITE_ACTIONS } from './infra-policy-guard';
```

---

### Step 3: 更新 switchToCustom / resetToPlatform — 设置 Settings 标记

**文件**: `apps/server/src/trpc/routers/currency.ts`（以及 `infra-policy.ts` 通用版）

switchToCustom 和 resetToPlatform 操作时，设置/清除 Settings 标记：

```typescript
// switchToCustom
switchToCustom: protectedProcedure
  .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
  .mutation(async ({ ctx }) => {
    const orgId = ctx.organizationId!;
    const service = getCurrencyService();

    // 1. 复制平台数据到租户
    const platformCurrencies = await service.getAllByOrganization('platform');
    for (const pc of platformCurrencies) {
      await service.create({ organizationId: orgId, ...pc });
    }

    // 2. 设置 Settings 标记（v2 新增）
    await settingsService.set('tenant', 'infra.customized.currency', true, {
      organizationId: orgId,
    });

    return { success: true };
  }),

// resetToPlatform
resetToPlatform: protectedProcedure
  .meta({ permission: { action: 'manage', subject: 'CurrencyPolicy' } })
  .mutation(async ({ ctx }) => {
    const orgId = ctx.organizationId!;
    const service = getCurrencyService();

    // 1. 删除租户数据
    await service.deleteAllByOrganization(orgId);

    // 2. 清除 Settings 标记（v2 新增）
    await settingsService.set('tenant', 'infra.customized.currency', false, {
      organizationId: orgId,
    });

    return { success: true };
  }),
```

**通用化**：`infra-policy.ts` 的通用 `switchToCustom` / `resetToPlatform` endpoint 也需同步设置标记：

```typescript
// 通用版 — infra-policy.ts
switchToCustom: protectedProcedure
  .input(z.object({ module: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // ... 复制数据逻辑 ...

    // 设置 Settings 标记
    await settingsService.set('tenant', `infra.customized.${input.module}`, true, {
      organizationId: ctx.organizationId!,
    });
  }),
```

---

### Step 4: 清理 currency.ts — 移除所有注册代码

**文件**: `apps/server/src/trpc/routers/currency.ts`

```diff
- import { registerInfraPolicyResolver, registerInfraSubjects } from '../infra-policy-guard.js';
- import { resolveEffectiveOrgId } from '../infra-policy-guard.js';

- // 模块注册
- registerInfraPolicyResolver('currency', {
-     getMode: getCurrencyPolicyMode,
-     hasCustomData: (orgId) => getCurrencyService().hasAnyCurrencies(orgId),
- });
- registerInfraSubjects('currency', ['Currency', 'ExchangeRate']);
```

**重要**：router key 是 `currency`（确认自 `router.ts:51`），Settings key 也对应 `infra.policy.currency`。

---

### Step 5: 初始化 Settings 依赖（含启动加载 + 生命周期刷新）

**文件**: `apps/server/src/trpc/trpc.module.ts` 或 bootstrap

```typescript
import { initInfraPolicySettings, refreshPolicyMode } from './infra-policy-guard';

// 在 NestJS module 初始化时注入 SettingsService
@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(
    private readonly settings: SettingsService,
    private readonly pluginManager: PluginManager,
  ) {}

  async onModuleInit() {
    // 1. 启动时加载所有策略模式到内存
    await initInfraPolicySettings(this.settings);

    // 2. 监听插件安装/卸载事件，刷新对应模块的策略
    this.pluginManager.on('plugin:installed', (pluginId) => {
      refreshPolicyMode(pluginId);
    });
    this.pluginManager.on('plugin:uninstalled', (pluginId) => {
      refreshPolicyMode(pluginId);
    });

    // 3. 监听 Settings 变更事件，刷新策略（Admin 修改时触发）
    this.settings.on('change', (key) => {
      if (key.startsWith('infra.policy.')) {
        const module = key.replace('infra.policy.', '');
        refreshPolicyMode(module);
      }
    });
  }
}
```

**Fail-Fast 保障**：如果 `onModuleInit` 未执行（如 SettingsService 注入失败），首个 infra policy 请求会抛出明确错误：

```
[InfraPolicy] SettingsService not initialized. Call initInfraPolicySettings() in module bootstrap.
```

而不是静默返回 `require_tenant` 导致 guard 失效。

**策略模式更新时机**：
| 时机 | 触发方式 | 影响范围 |
|------|---------|---------|
| 应用启动 | `initInfraPolicySettings()` | 加载全部 |
| 插件安装/卸载 | `plugin:installed/uninstalled` 事件 | 单个模块 |
| Admin 修改策略 | Settings `change` 事件 | 单个模块 |

---

### Step 6: 清理 publicProcedure 的手动处理

v2 的路径驱动 middleware 在 `procedureBase` 层执行，**publicProcedure 也会被自动处理**。
不再需要 v1 中公开路由手动调 `resolveEffectiveOrgId` 的逻辑。

**文件**: `apps/server/src/trpc/routers/currency.ts`

```diff
  // getCurrencies（公开 API）
  getCurrencies: publicProcedure.query(async ({ ctx }) => {
-     const mode = await getCurrencyPolicyMode();
-     const result = await currencyService.getEnabledForOrganization(organizationId, mode);
+     // v2: Context Swap 已自动处理，ctx.organizationId 就是 effectiveOrg
+     const result = await currencyService.getEnabledForOrganization(ctx.organizationId);
      // ...
  }),

  // rates.list（公开 API）
  rates.list: publicProcedure.query(async ({ ctx }) => {
-     const mode = await getCurrencyPolicyMode();
-     const { orgId: resolvedOrgId } = await resolveEffectiveOrgId(orgId, mode);
+     // v2: Context Swap 已自动处理
      // ...
  }),
```

v1 的 `resolveEffectiveOrgId` 导出可以标记 `@deprecated` 并在后续版本移除。

---

### Step 7: 迁移现有 Settings key

现有 infra policy Settings 数据需要迁移：

| 旧 key | 新 key | 说明 |
|--------|--------|------|
| `plugin_global:{pluginId}:infra.policy` | `global:infra.policy.{pluginId}` | 插件策略模式 |
| `plugin_tenant:{pluginId}:infra.config` | `tenant:infra.customized.{pluginId}` | 租户自定义标记 |
| Currency 的 `getCurrencyPolicyMode()` | `global:infra.policy.currency` | Core 策略模式 |
| Currency 的 `hasAnyCurrencies()` DB 查询 | `tenant:infra.customized.currency` | Core 自定义标记 |

迁移脚本：
1. 读取旧 key → 写入新 key
2. Currency 模块：查 DB `hasAnyCurrencies(orgId)` → 设置 `infra.customized.currency` 标记
3. 旧 key 保留一个版本周期后删除

**迁移安全性**（来自评审 P0）：
- 迁移脚本必须先验证旧数据完整性
- 新旧 key 并存期间，`getMode()` 应先查新 key，未命中再回退旧 key
- 迁移完成后运行一致性校验：对比 `hasAnyCurrencies()` DB 查询结果与 Settings 标记是否一致

---

### Step 8: Admin UI 模块发现机制

> **来源**：多模型评审 P1（Gemini 发现）

移除 manifest `tenantOverride` 声明后，Admin UI 失去了"哪些模块支持 infra policy 配置"的发现机制。

**解决方案**：新增 `infraPolicy.listConfigurableModules` endpoint

```typescript
// apps/server/src/trpc/routers/infra-policy.ts
listConfigurableModules: protectedProcedure
  .meta({ permission: { action: 'read', subject: 'InfraPolicy' } })
  .query(async () => {
    // 方案 A：从 Settings 扫描已配置的模块
    const allSettings = await settingsService.listByPrefix('global', 'infra.policy.');
    const modules = allSettings.map(s => s.key.replace('infra.policy.', ''));

    // 方案 B：维护一个静态注册表（Core 模块 seed + 插件启动时注册）
    // const modules = infraPolicyRegistry.getModuleNames();

    return modules;
  }),
```

Admin UI 调用此 endpoint 获取可配置模块列表，渲染 Settings 配置界面。

---

## 改动文件清单

| 文件 | 改动 | 风险 |
|------|------|------|
| `trpc/infra-policy-guard.ts` | 重写：删除 resolver/subject 机制，新增路径提取 + Settings 查询 + fail-fast | 中 |
| `trpc/trpc.ts` | middleware 从读 subject 改为读 path + meta，新增元操作豁免 | 中 |
| `trpc/routers/currency.ts` | 删除注册代码 + 简化公开路由 + switchToCustom 设置标记 | 中 |
| `trpc/routers/infra-policy.ts` | switchToCustom/resetToPlatform 设置 Settings 标记 + listConfigurableModules | 低 |
| `trpc/trpc.module.ts` | 初始化 Settings 依赖 | 低 |
| Settings 迁移脚本 | key 格式迁移 + 一致性校验 | 中 |

**不需要改动的**：
- ScopedDb：零改动 ✅
- Service 层：零改动 ✅
- `async-local-storage.ts`：v1 已添加 `originalOrganizationId`，无需变更 ✅
- `audit-context.ts`：v1 已清理，无需变更 ✅
- `exchange-rate.service.ts`：v1 已清理 `validationOrgId`，无需变更 ✅

---

## 安全性证明（与 v1 相同）

Context Swap 的安全性证明不变。v2 只改变了"如何识别模块"和"如何查询策略"，不改变 swap 逻辑本身。

**WRITE 操作**：guard 在 swap 之前执行，确保 effectiveOrg === originalOrg。

| mode | guard 结果 | effectiveOrg | originalOrg | 相等？ |
|------|-----------|--------------|-------------|--------|
| unified + 租户 | 阻断 | — | — | 不执行 |
| require_tenant | 放行 | tenantId | tenantId | ✅ |
| allow_override + 有自定义 | 放行 | tenantId | tenantId | ✅ |
| allow_override + 无自定义 | 阻断 | — | — | 不执行 |

**READ 操作**：`organizationId` 被替换为 effectiveOrg，ScopedDb 自动查正确的 org 数据。

**元操作安全性**：`switchToCustom` / `resetToPlatform` 豁免 guard，但仍受 RBAC 保护（需要 `manage` 权限 on `CurrencyPolicy` / `InfraPolicy`）。恶意用户无法通过构造 procedure name 绕过 — RBAC 是独立检查。

---

## 开发者体验（最终效果）

### Core 模块开发者

```typescript
// 完全零配置：不需要 infra policy 代码，不需要 permission 声明
export const currencyRouter = createCrudRouter({
  table: currencies,
  // ✅ action: 操作名即 action（list→list, get→get, deleteMany→deleteMany...）
  // ✅ subject: 自动从 table name 推导（currencies → Currency）
  // ✅ infra policy: 自动从 path 推导（currency.* → module = currency）
  // ✅ title: 用标准 t() 翻译（t('Currency') → "货币"）
});

// 开发者只需补一条 i18n 翻译（与项目其他翻译方式一致，存入 i18n_messages 表）：
// namespace: 'common', key: 'Currency', translations: { 'zh-CN': '货币' }
// Admin 在 Settings UI 配置 infra.policy.currency = 'allow_override' 即生效
```

### 插件开发者

```typescript
// 插件开发者完全不知道 infra policy 的存在
export const router = pluginRouter({
  list: pluginProcedure.query(async ({ ctx }) => {
    return await ctx.db.query.teams.findMany();
  }),
  create: pluginProcedure.mutation(async ({ ctx, input }) => {
    return await ctx.db.insert(teams).values(input);
  }),
});

// 零 infra policy 代码
// Admin 在 Settings UI 配置 infra.policy.lbac-teams = 'unified' 即生效
```

### 平台管理员

```
Settings UI:
  infra.policy.currency    = allow_override  ← 租户可自定义货币
  infra.policy.lbac-teams  = unified         ← 团队结构平台统一管理
  infra.policy.lbac-spaces = require_tenant  ← 每个租户独立管理空间（默认）
```

---

## 统一启动扫描：三系统共享 `_def.procedures`

v2 的路径驱动方式不仅用于 Infra Policy，还可以与 Billing 和 RBAC 共享同一次启动扫描。

### 共享扫描架构

```
应用启动 → 扫描 appRouter._def.procedures（Flat Map）
  │
  │  每个 entry: path + Procedure（含 _def.type, _def.meta）
  │
  ├─ Infra Policy:  启动时加载 infra.policy.* 到内存 Map
  │                  运行时：getModuleFromPath(path) → getMode()（同步内存读取）→ Context Swap
  │                  刷新：插件安装/卸载 + Admin 修改策略时 refreshPolicyMode()
  │
  ├─ Billing:       path → module → billing.module.{m}.subject / 过程级覆盖
  │                  运行时：middleware 按 planItem.type 决策（boolean/metered）
  │
  └─ RBAC:          path → 推导 action + subject → 构建 permission 注册表
                     运行时：middleware 从注册表查 permission → PermissionKernel.require()
```

### 三系统统一治理模型

三个系统在结构上**同构**，共享"模块级默认 + 过程级覆盖 + 管理员最高优先级"的治理模型。

**存储策略（方案 C：混合模式）**：各子系统保持独立的扁平 key，各自在独立的 Admin 页面中配置和展示。这样保留了各子系统的独立性和现有资产兼容性，避免将职责不同的配置混入同一界面。

#### 统一优先级

```
过程级管理员配置 > 过程级开发者声明 > 模块级默认 > Default Policy
```

| 层级 | RBAC | Billing | Infra Policy |
|------|------|---------|-------------|
| 过程级管理员 | `rbac.override.{path}` | `billing.override.{path}` | —（无过程级） |
| 过程级开发者 | `meta.permission.subject` / auto-crud | `meta.billing.subject` / manifest | — |
| **模块级默认** | `rbac.module.{m}.subject` | `billing.module.{m}.subject` | `infra.policy.{m}` |
| Default Policy | audit/deny/allow | audit/deny/allow | require_tenant |

**与 Billing L1/L2/L3 的关系**：
- L1（capabilities 表）是**合法性约束层**，不参与映射优先级（subject 必须在 capabilities 表中存在且 approved）
- L3（`rbac.override.{path}` / `billing.override.{path}`）= 过程级管理员配置
- L2（manifest billing.procedures）= 过程级开发者声明
- Module Default = 新增层，位于 L2 和 Default Policy 之间
- 完整优先级：L3 Admin Override > L2 Developer Declaration > Module Default > Default Policy

#### 模块级默认配置（扁平 key 存储）

管理员配置一次模块，该模块下所有 procedure 自动继承，大幅减少配置量。
各子系统使用独立的扁平 key，不聚合存储：

```typescript
// === 各子系统独立存储（扁平 key）===

// Infra Policy（已有，保持不变）
await settingsService.set('global', 'infra.policy.currency', 'allow_override');

// RBAC 模块默认
await settingsService.set('global', 'rbac.module.currency.subject', 'Currency');

// Billing 模块默认
await settingsService.set('global', 'billing.module.currency.subject', 'core.currency');
```

**继承规则**：
- RBAC：模块默认提供 `subject`，`action` 由 procedure name 自动推导
- Billing：模块默认提供 `subject`（= 配额桶），特殊 procedure 可覆盖（如 `free`）
- Infra Policy：模块级配置，不需要过程级（已是最小粒度）
- 共享 `meta.subject` 同时设置 RBAC 和 Billing，分叉时用 `meta.permission.subject` / `meta.billing.subject` 独立覆盖

**方案 C 的优势**：
- 各子系统 key 独立演进，不互相耦合
- 兼容现有 `infra.policy.*` 资产，无需迁移
- Billing L1/L2/L3 模型无需调整
- 各系统在各自 Admin 页面独立读写，职责清晰

#### 统一 subject 概念

RBAC 和 Billing **共用 `subject` 术语**，含义是"这个 procedure 操作的是什么资源"：

| 维度 | RBAC | Billing |
|------|------|---------|
| subject 含义 | 多个 procedure → 共享权限检查 | 多个 procedure → 共享配额桶 |
| 解析优先级 | `meta.permission.subject` > `meta.subject` > 模块名 | `meta.billing.subject` > `meta.subject` > 模块名 |
| 管理员修改 | Settings `rbac.override.{path}` | Settings `billing.override.{path}` |

**开发者 API**：

```typescript
// ① 零配置（90%+）：自动从模块名推导 subject
// currency.list → { action: 'list', subject: 'Currency' }（RBAC + Billing 共用）

// ② 指定共享 subject（RBAC + Billing 一起变）
protectedProcedure.meta({
  subject: 'Finance',
})

// ③ 分叉：RBAC 和 Billing 用不同 subject
protectedProcedure.meta({
  permission: { subject: 'FinanceAdmin' },  // 只改 RBAC
  billing: { subject: 'order' },            // 只改 Billing
})
```

**角色管理 UI 中的 subject（作为分组容器）**：

```
▼ Currency (subject)
  ☑ read          ← list, get 自动推导
  ☑ create        ← 自动推导
  ☑ update        ← 自动推导
  ☐ delete        ← 自动推导
  ☐ switchToCustom ← 非标准，action = procedure name
  ☐ archive       ← 非标准，action = procedure name
```

管理员可创建自定义 subject 重新分组，也可拆分 subject（如把敏感操作移到独立 subject）。
Billing 的自定义 subject 必须对应 capabilities 表中已注册的合法能力。
subject 不支持子层级——如果太大，拆成多个 subject。

#### 配置模板（可选的批量初始化工具）

模板是可选的快捷工具，用于首次部署或标准化环境的批量初始化。**不是日常配置入口**——日常配置在各系统独立页面中进行。

应用模板 = 按子系统分别批量写入扁平 key：

```typescript
interface UnifiedModuleTemplate {
  id: string;           // e.g., 'standard-saas'
  name: string;         // e.g., '标准 SaaS 模板'
  description: string;
  modules: Record<string, {
    infraPolicy?: InfraPolicyMode;
    rbac?: { subject: string };
    billing?: { subject: string };
  }>;
  procedures?: ProcedureTemplateRule[];  // 过程级覆盖（RBAC + Billing）
}

interface ProcedureTemplateRule {
  match: {
    path?: string;       // e.g., 'currency.policy.*'
    name?: string;       // e.g., 'switchToCustom'
    type?: 'query' | 'mutation';
  };
  // RBAC 覆盖
  permission?: {
    action: string;
    subject: string;
  };
  // Billing 覆盖（如标记 free）
  billing?: {
    subject: string;  // 'free' 或具体 subject
  };
}

// 应用模板 = 批量写入各子系统扁平 key（支持 dry-run）
async function applyUnifiedTemplate(
  templateId: string,
  registry: Map<string, PermissionRegistryEntry>,
  settings: SettingsService,
  mode: 'dry-run' | 'apply' = 'dry-run',
): Promise<TemplateApplyReport> {
  const template = await getTemplate(templateId);
  const report: TemplateApplyReport = {
    modules: { applied: [], skipped: [], conflicts: [] },
    procedures: { applied: [], skipped: [], conflicts: [] },
  };

  // 1. 模块级：写入各子系统扁平 key
  for (const [moduleName, config] of Object.entries(template.modules)) {
    const actions: SettingsWrite[] = [];

    if (config.infraPolicy) {
      const existing = await settings.get('global', `infra.policy.${moduleName}`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'infraPolicy', reason: 'existing' });
      } else {
        actions.push({ key: `infra.policy.${moduleName}`, value: config.infraPolicy });
      }
    }
    if (config.rbac) {
      const existing = await settings.get('global', `rbac.module.${moduleName}.subject`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'rbac', reason: 'existing' });
      } else {
        actions.push({ key: `rbac.module.${moduleName}.subject`, value: config.rbac.subject });
      }
    }
    if (config.billing) {
      const existing = await settings.get('global', `billing.module.${moduleName}.subject`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'billing', reason: 'existing' });
      } else {
        actions.push({ key: `billing.module.${moduleName}.subject`, value: config.billing.subject });
      }
    }

    if (mode === 'apply') {
      for (const a of actions) await settings.set('global', a.key, a.value);
    }
    if (actions.length > 0) report.modules.applied.push(moduleName);
  }

  // 2. 过程级：写入 RBAC + Billing 覆盖
  if (template.procedures) {
    for (const [path, entry] of registry) {
      const matchedRule = template.procedures.find(r => matchRule(r.match, entry));
      if (!matchedRule) continue;

      // 跳过已有管理员覆盖的 procedure（查 Settings，不在注册表中）
      const existingOverride = await settings.get('global', `rbac.override.${path}`);
      if (existingOverride) {
        report.procedures.skipped.push({ path, reason: 'admin-override' });
        continue;
      }

      if (mode === 'apply') {
        if (matchedRule.permission) {
          await settings.set('global', `rbac.override.${path}`, matchedRule.permission);
        }
        if (matchedRule.billing) {
          await settings.set('global', `billing.override.${path}`, matchedRule.billing.subject);
        }
      }
      report.procedures.applied.push(path);
    }
  }

  return report;
}

interface TemplateApplyReport {
  modules: {
    applied: string[];
    skipped: { module: string; field: string; reason: string }[];
    conflicts: string[];
  };
  procedures: {
    applied: string[];
    skipped: { path: string; reason: string }[];
    conflicts: string[];
  };
}
```

**模板 apply 原子性**：

当前 `settings.set()` 是逐条写入，无跨 key 事务保障。失败时可能部分写入。缓解策略：

1. **dry-run 优先**：默认 `mode='dry-run'`，管理员先预览 report，确认后再 apply
2. **幂等设计**：每条 `settings.set()` 是 upsert，重复执行不会产生副作用
3. **报告记录**：`TemplateApplyReport` 记录已写入的 key，失败时管理员可根据 report 手动清理或重试
4. **未来优化**：若 `SettingsService` 支持批量写入（`setBatch()`），可改为原子批量操作
```

#### 各系统独立配置页

三个系统职责不同、操作者不同、心智模型不同，**不在同一页面配置**：

| 系统 | 配置页面位置 | 操作者 | 关注点 |
|------|------------|--------|--------|
| **Infra Policy** | 平台设置 → 基础设施策略 | 平台管理员 | 数据隔离模式（unified / allow_override / require_tenant） |
| **RBAC** | 权限管理 → 角色管理（已有） | 安全管理员 / 租户管理员 | 角色内选择 Capability / Permission 分配 |
| **Billing** | 计费管理 → 能力映射 | 产品经理 / 商务 | API → subject 映射，套餐配置 |

```
各系统独立配置页（RBAC 在角色管理中已有）

🔐 权限管理 → 角色管理（已有）                💰 计费管理 → 能力映射
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ 角色: [编辑员 ▾]                  │    │ 模块: [全部 ▾]  搜索: [______]    │
│                                 │    ├────────────┬──────────┬─────────┤
│ ▼ Media                         │    │ Procedure  │ subject  │ 来源    │
│   基础  ☑list ☑get ☑create      │    ├────────────┼──────────┼─────────┤
│         ☑update ☐delete         │    │ media.list │ free ✏   │ 管理员  │
│   批量  ☐createMany ☐updateMany │    │ media.up.. │ core.sto │ 模块默认│
│         ☐deleteMany ☐upsert     │    └────────────┴──────────┴─────────┘
│   数据  ☐export ☐import         │
│                                 │
│ ▶ Currency (3/11)               │
│ ▶ CurrencyPolicy ⚠ (待配置)     │
└─────────────────────────────────┘

⚙ = auto-derived    ✏ = admin configured    ⚠ = 待配置
继承值显示为 text-muted，管理员覆盖显示为 text-primary
悬浮提示显示配置溯源（如："继承自模块默认 rbac.module.media.subject"）
```

**Actions 分组策略（11 个 auto-crud actions）**：

管理员在角色管理页配置权限时，11 个 action 按语义分为 3 组，避免认知过载：

| 分组 | Actions | 默认展开 | 风险标识 |
|------|---------|---------|---------|
| **基础** | list, get, create, update, delete | ✅ 始终展开 | delete 用橙色 |
| **批量** | createMany, updateMany, deleteMany, upsert | ❌ 默认折叠 | deleteMany 用橙色 |
| **数据** | export, import | ❌ 默认折叠 | import 用橙色 |

- **Subject 卡片折叠**：默认只显示 Subject 名称 + 已授权数量摘要（如 `3/11`），点击展开
- **高危操作标识**：`delete`、`deleteMany`、`import` 等高危 action 的勾选框用橙色区分
- **批量操作快捷键**：Subject 头部提供"全选基础"、"全选全部"快捷按钮

**配置量（每个系统内部仍受益于模块默认）**：

```
无模块默认：管理员需在每个系统页面配 N 个 procedure = N 次/系统
有模块默认：管理员只配 M 个模块 = M 次/系统（procedure 自动继承）
用模板：    首次部署选模板 → 批量初始化各系统配置 = 1 次
```

**各页面通用 UX 建议**：
- 折叠式模块列表，默认收起，头部显示状态摘要
- 搜索/过滤功能（按 Name、Path、Status）
- 配置溯源的视觉提示（颜色 + Tooltip）

### RBAC 权限自动推导

#### 推导规则

| 维度 | 推导方式 | 示例 | 覆盖率 |
|------|---------|------|--------|
| **action** | auto-crud 操作名即 action（11 个独立授权）；非标准 mutation 不自动推导 | `list`→list, `deleteMany`→deleteMany, `approve`→null | ~95% CRUD |
| **subject** | `createCrudRouter` 的 table name → singularize → PascalCase | `currencies` → `Currency` | ~80% |
| **title** | 标准 `t()` 翻译，与项目 i18n 保持一致 | `t('Currency')` → "货币" | 100%（需配翻译） |

#### action 推导映射

```typescript
// auto-crud 的 11 个操作：操作名 = action 名，不做映射
// 每个操作独立授权，管理员可逐个控制
const AUTO_CRUD_OPERATIONS = new Set([
  'list',         // 集合查看
  'get',          // 单条详情
  'create',       // 单条创建
  'update',       // 单条更新
  'delete',       // 单条删除
  'deleteMany',   // 批量删除（独立于 delete）
  'updateMany',   // 批量更新（独立于 update）
  'createMany',   // 批量创建（独立于 create）
  'upsert',       // 存在则更新/不存在则创建
  'export',       // 数据导出
  'import',       // 数据导入
]);

function inferAction(procedureName: string, type: 'query' | 'mutation'): string | null {
  // 1. auto-crud 标准操作 → 操作名即 action（11 个全覆盖，逐个可授权）
  if (AUTO_CRUD_OPERATIONS.has(procedureName)) return procedureName;

  // 2. 非标准 query → read（只读操作，安全）
  if (type === 'query') return 'read';

  // 3. 非标准 mutation → null（不自动推导 action）
  //    procedure 仍导出到注册表，管理员在 Admin UI 可看到 name
  //    后续走：管理员手动配 action → 开发者声明 → Default Policy
  return null;
}
```

**action 推导策略**：
- auto-crud 全部 11 个操作 → **操作名即 action，不做映射**，产出 **11 个 distinct actions**
- `list` 与 `get` 独立：管理员可分别控制"能看列表"和"能看详情"
- 批量操作（`deleteMany`/`updateMany`/`createMany`）与单条操作**独立授权**：批量删除风险远大于单条删除
- `export`/`import` 独立（数据安全：导出防泄露，导入防污染）
- `upsert` 独立（可创建也可更新，混合操作单独授权）
- 非标准 query → `read`（只读，安全）
- **非标准 mutation → `null`**（不自动推导 action），但 procedure 仍导出到注册表：
  - 管理员在 Admin UI 可看到 procedure 的 `name`（如 `approve`、`publish`）
  - 管理员可手动配置 action + subject
  - 未配置 → 走 Default Policy（audit/deny/allow）兜底
- **不使用 `manage` fallback 的原因**：CASL 中 `manage` 是通配符 action，自动推导会将"待配置"变为"已授权"，绕过 Default Policy 治理机制

**全量注册 + 统一模板 模型**：

```
启动扫描全部 procedure → 导出到注册表
  │
  ├─ 管理员已配置？（Settings）→ 使用管理员配置（最高优先级）
  │
  ├─ 有开发者代码配置？
  │   ├─ meta.permission（含 action + subject）→ 作为代码级默认
  │   ├─ meta.permission.subject → 查分组权限
  │   ├─ auto-crud 推导 → 自动
  │   └─ manifest billing.procedures → subject 映射
  │
  ├─ 有模块级默认？（扁平 Settings key）
  │   ├─ rbac.module.{m}.subject → 模块默认 RBAC subject
  │   ├─ billing.module.{m}.subject → 模块默认 subject
  │   └─ infra.policy.{m} → 模块 Infra Policy 模式
  │
  └─ 都没有 → Default Policy（audit/deny/allow）→ 兜底
```

Admin UI 展示全部 procedure（数据来源：PermissionRegistry + Settings `rbac.override.*` 合并），管理员可以：
- **查看 source**：区分 `explicit`（开发者声明）/ `auto-crud`（自动推导）/ `pending`（⚠️ 待配置）/ `admin`（★ 已覆盖）
- **选择模板**：一键应用预设权限模板（如 "标准 SaaS"、"严格企业"）
- **在模板基础上自定义**：修改个别 procedure 的权限或分组（写入 `rbac.override.{path}`）
- **手动配置**：逐个 procedure 配权限
- **重置**：删除 `rbac.override.{path}` 恢复开发者默认

**模板的价值**：
- 不是开发者配置充当模板，而是独立的**预设权限配置集**
- 为管理员和开发者都提供默认配置参考
- 新系统部署时快速初始化，不需要从零配置

#### subject 推导

`createCrudRouter` 在生成 procedure 时，将 table 元信息打标到 `_def` 上：

```typescript
// auto-crud-server 内部改动
function createCrudRouter({ table, ... }) {
  // 从 table 提取 subject: currencies → Currency
  const subject = tableNameToSubject(getTableName(table));

  // 生成的每个 procedure 自动携带 __crudSubject 标记
  // action 由 inferAction() 在启动扫描时推导，此处仅打标 subject
  const listProc = protectedProcedure
    .meta({ permission: { action: 'list', subject }, __crudSubject: subject })
    .query(...)
}

function tableNameToSubject(tableName: string): string {
  // currencies → currency → Currency
  // exchange_rates → exchangeRate → ExchangeRate
  return singularize(tableName)
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function moduleToSubject(module: string): string {
  // module name（从 path 提取）→ PascalCase subject
  // currency → Currency
  // exchange-rate → ExchangeRate
  // pluginApis.lbac-teams → LbacTeams
  const name = module.startsWith('pluginApis.')
    ? module.split('.')[1]  // 插件取 pluginId
    : module;
  return name
    .split(/[-_.]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
```

#### title 解析（标准 i18n）

使用项目现有的 Database-First i18n 机制，不引入特殊约定：

```typescript
/**
 * Resolve display title for a permission subject.
 * 使用标准 t() 翻译函数，与项目其他翻译保持一致。
 * Fallback chain: t(subject) → humanize
 */
function getSubjectTitle(subject: string, t: TFunction): string {
  // 1. 标准 i18n 翻译（common namespace，与项目其他翻译一致）
  //    key 就是 subject 名称本身，例如 t('Currency') → "货币"
  const translated = t(subject);
  if (translated !== subject) return translated;

  // 2. humanize: 'ExchangeRate' → 'Exchange Rate'
  return subject.replace(/([A-Z])/g, ' $1').trim();
}
```

开发者只需在 Admin UI 翻译管理页面补一条翻译即可：

| namespace | key | zh-CN | en-US |
|-----------|-----|-------|-------|
| common | Currency | 货币 | Currency |
| common | ExchangeRate | 汇率 | Exchange Rate |
| common | Employee | 员工 | Employee |

与项目中所有其他翻译的添加方式完全一致，无需学习新约定。

**插件 subject title**：插件开发者在 `plugin.json` 的 `i18n` 配置中声明翻译即可：

```json
{
  "i18n": {
    "namespace": "plugin.lbac-teams",
    "messages": {
      "zh-CN": { "Team": "团队", "TeamMember": "团队成员" },
      "en-US": { "Team": "Team", "TeamMember": "Team Member" }
    }
  }
}
```

利用现有插件 i18n 生命周期：
- 安装时 `installPluginTranslations()` 自动写入 `i18n_messages` 表
- 卸载时 `uninstallPluginTranslations()` 自动清理
- 零额外开发，与现有插件翻译机制完全复用

#### 权限分组机制（Permission Group）

非标准 mutation（如 `approve`、`publish`、`switchToCustom`）可能导致权限粒度过细，管理员配置负担大。通过**subject**将相关 procedure 聚合到同一权限下：

##### 开发者定义默认 subject

```typescript
// 通过 meta.permission.subject 或 meta.subject 设置归属
// 同一 subject 的 procedure 在角色管理中分为一组
protectedProcedure
  .meta({ subject: 'CurrencyPolicy' })
  .mutation(async ({ ctx }) => { /* switchToCustom */ })

protectedProcedure
  .meta({ subject: 'CurrencyPolicy' })
  .mutation(async ({ ctx }) => { /* resetToPlatform */ })

// 需要同时指定 action 时
protectedProcedure
  .meta({ permission: { action: 'publish', subject: 'ContentWorkflow' } })
  .mutation(async ({ ctx }) => { /* publish */ })
```

**`meta` 字段**：

```typescript
interface ProcedureMeta {
  subject?: string;     // 共享 subject（RBAC + Billing 共用）
  permission?: {
    action?: string;    // RBAC action（可选，管理员可覆盖）
    subject?: string;   // RBAC subject 覆盖（优先于 meta.subject）
  };
  billing?: {
    subject?: string;   // Billing subject 覆盖（优先于 meta.subject）
  };
}
```

##### 两层数据模型

权限配置分为两层，职责清晰分离：

| 层 | 存储位置 | 生命周期 | 用途 |
|---|---------|---------|------|
| **PermissionRegistry** | 内存 | 每次启动重建 | 扫描所有路由，构建 procedure 全量清单（Admin UI 的数据来源） |
| **rbac.override.{path}** | Settings（持久化） | 管理员写入 | 管理员对特定 procedure 的覆盖配置 |

##### Admin UI 数据流

```
启动扫描 → PermissionRegistry（内存，只读）
                ↓ API 暴露给前端
         Admin UI 展示所有 procedure（按 subject 分组）
                ↓ 管理员点 [编辑] 修改 action / subject
         写入 Settings rbac.override.{path}（持久化）
                ↓ 运行时解析
         override 优先级最高，覆盖 Registry 中的开发者默认值
```

管理员在角色管理页看到每条 procedure 的信息：

- **path** — procedure 完整路径（如 `currency.policy.switchToCustom`）
- **permission** — 当前生效的 `{ action, subject }`
- **source** — 来源标识：`explicit`（开发者声明）/ `auto-crud`（自动推导）/ `pending`（⚠️ 待配置）/ `admin`（★ 管理员已覆盖）
- **module** — 所属模块

管理员可以：

1. **查看**：按 subject 分组展示 procedure 列表，⚠️ 标记待配置的 procedure
2. **修改**：更改 procedure 的 action / subject → 写入 `rbac.override.{path}`，source 变为 `admin`
3. **重置**：删除 `rbac.override.{path}` → 恢复为开发者默认值（Registry 中的原始值）
4. **配置权限**：为 subject 下的 action 分配给角色

##### 配置存储

```typescript
// 管理员覆盖：写入 Settings（持久化）
// key: 'rbac.override.{path}'（global 或 tenant scope）
// value: { action, subject }
await settingsService.set('global', 'rbac.override.currency.policy.switchToCustom', {
  action: 'manage',
  subject: 'CurrencyPolicy',
});

// 管理员重置：删除 Settings key → 恢复开发者默认
await settingsService.delete('global', 'rbac.override.currency.policy.switchToCustom');
```

##### 运行时权限解析

```
请求进入 → procedure path
  │
  ├─ 1. Settings rbac.override.{path}（管理员覆盖）→ 最高优先级
  │
  ├─ 2. PermissionRegistry.get(path)（启动扫描的开发者默认）
  │     ├─ source: explicit → meta.permission 声明
  │     ├─ source: auto-crud → createCrudRouter 自动推导
  │     └─ source: pending → 从 module 自动推导（待管理员配置）
  │
  ├─ 3. Settings rbac.module.{m}.subject（模块级默认）
  │
  └─ 4. Default Policy（audit/deny/allow）→ 兜底
```

**模板不参与运行时**：模板只是 Admin UI 的快捷操作工具，"应用模板" = 批量写入 `rbac.override.*` / `billing.override.*` Settings 条目。写入后就是管理员配置（优先级 1），运行时完全不感知模板的存在。

##### 权限模板（→ 已升级为配置模板）

权限模板已升级为跨系统**配置模板**（`UnifiedModuleTemplate`），见上方"三系统统一治理模型 → 配置模板"章节。

模板涵盖模块级三项配置（Infra Policy + RBAC + Billing）+ 过程级权限覆盖，用于首次部署或标准化环境的批量初始化。

**Admin UI 交互**：各系统在独立页面配置，见上方"各系统独立配置页"章节。

#### 启动时构建 Permission 注册表

```typescript
/**
 * Permission registry entry.
 * 启动时扫描所有路由构建，仅包含开发者代码级信息（不含 admin override）。
 * Admin UI 通过 API 读取此注册表作为展示数据源。
 * 管理员的覆盖配置存储在 Settings rbac.override.{path}，运行时优先于注册表。
 */
interface PermissionRegistryEntry {
  path: string;                // tRPC path (e.g., 'currency.policy.switchToCustom')
  name: string;                // procedure name (last segment, e.g., 'switchToCustom')
  type: 'query' | 'mutation';
  permission: {
    action: string;            // auto-crud 操作名 / procedure name / 开发者声明
    subject: string;           // auto-crud subject / module 推导 / 开发者声明
  };                           // 开发者默认值（所有 procedure 都有，pending 也自动推导）
  source: 'explicit' | 'auto-crud' | 'pending';  // 仅开发者级来源，admin 覆盖在 Settings 层
  module: string;              // 所属模块（从 path 提取）
}

/**
 * Startup scan: build permission registry from _def.procedures
 *
 * 纯扫描，只提取开发者代码级信息，不混入 admin override。
 * Admin override 在运行时解析时查 Settings rbac.override.{path}。
 *
 * Admin UI 通过 API 暴露此注册表 + 查 Settings override → 合并展示。
 */
function buildPermissionRegistry(appRouter: AppRouter) {
  const registry = new Map<string, PermissionRegistryEntry>();
  const pendingMutations: string[] = [];

  for (const [path, procedure] of appRouter._def.procedures) {
    const name = path.split('.').pop()!;
    const type = procedure._def.type;

    // === 优先级 1：显式 meta.permission 声明 ===
    const declared = procedure._def.meta?.permission;
    if (declared?.action && declared?.subject) {
      registry.set(path, {
        path, name, type,
        permission: declared,
        source: 'explicit',
        module: getModuleFromPath(path),
      });
      continue;
    }

    // === 优先级 2：createCrudRouter 标记 → 自动推导 ===
    const crudSubject = procedure._def.meta?.__crudSubject;
    if (crudSubject) {
      const action = inferAction(name, type)!; // CRUD 动词一定匹配
      registry.set(path, {
        path, name, type,
        permission: { action, subject: crudSubject },
        source: 'auto-crud',
        module: getModuleFromPath(path),
      });
      continue;
    }

    // === 优先级 3：开发者定义了 subject（meta.subject 或 meta.permission.subject）===
    const devSubject = procedure._def.meta?.permission?.subject
      ?? procedure._def.meta?.subject;
    if (devSubject) {
      registry.set(path, {
        path, name, type,
        permission: { action: inferAction(name, type) ?? name, subject: devSubject },
        source: 'explicit',
        module: getModuleFromPath(path),
      });
      continue;
    }

    // === 优先级 4：开发者未声明 → 仍推导 action + subject，导出到注册表（标记 pending） ===
    // action = procedure name 本身（approve、publish、archive...）
    // subject = 从 module 推导（currency → Currency）
    // source = 'pending' 标记，Admin UI 用 ⚠️ 提示管理员"待配置"
    const module = getModuleFromPath(path);
    registry.set(path, {
      path, name, type,
      permission: {
        action: inferAction(name, type) ?? name,  // 标准操作用推导值，非标准用 name 本身
        subject: moduleToSubject(module),          // currency → Currency
      },
      source: 'pending',
      module,
    });
    if (type === 'mutation' && inferAction(name, type) === null) {
      pendingMutations.push(path);
    }
  }

  // 启动报告：列出待配置的 mutation（提醒，不阻断）
  if (pendingMutations.length > 0) {
    logger.warn(
      `[RBAC] ${pendingMutations.length} mutations pending permission config:\n` +
      pendingMutations.map(p => `  - ${p}`).join('\n') +
      '\nConfigure via Admin UI or add meta.subject / meta.permission.subject.'
    );
  }

  return registry;
}
```

**关键设计**：
- **注册表 = 纯扫描**：`buildPermissionRegistry` 只提取开发者代码级信息，不混入 admin override
- **两层分离**：注册表（内存，只读展示）vs Settings `rbac.override.{path}`（持久化，管理员覆盖）
- **全导出**：所有 procedure（含待配置的）都导出到注册表，Admin UI 显示 procedure Name
- **运行时优先级**：Settings override > Registry 开发者默认 > 模块级默认 > Default Policy
- **模块级默认**：一次配置模块的三项（Infra Policy + RBAC + Billing），所有 procedure 继承
- **配置模板**：可选的批量初始化工具，应用模板 = 批量写入 `rbac.override.*` Settings，不参与运行时
- **启动报告**：列出待配置的 mutation，提醒开发者/管理员配置
- **管理员不需要配权限也能工作**：Default Policy（推荐 `audit`）兜底，未配置的放行但记日志

#### 与 Billing Default Policy 对齐

RBAC 和 Billing 共享相同的"待配置 procedure"处理模式：

| 策略 | Billing（Decision 15） | RBAC |
|------|----------------------|------|
| `audit` | 放行但记审计日志 | 放行但记日志，推荐默认 |
| `deny` | 阻断待配置的 procedure | 阻断无权限配置的 procedure |
| `allow` | 放行（不推荐生产） | 放行（不推荐生产） |

### `createCrudRouter` 零配置改进

```typescript
// ✅ v2 理想写法：完全零配置
export const currencyRouter = createCrudRouter({
  table: currencies,
  // action: 操作名即 action（list→list, get→get, deleteMany→deleteMany...）
  // subject: 从 table name 自动推导（currencies → Currency）
  // permission: 自动注入到 meta
  // title: 从 i18n resources.Currency.title 查询
});

// 等价于现在手写的：
export const currencyRouter = createCrudRouter({
  table: currencies,
  mode: 'factory',
  procedureFactory: (op) => {
    const action = op; // 操作名即 action：list→list, deleteMany→deleteMany...
    return protectedProcedure.meta({
      permission: { action, subject: 'Currency' },
    });
  },
});
```

### 非 CRUD procedure 权限管理

非标准 mutation 不再需要强制显式声明，而是通过**subject + 管理员配置 + Default Policy** 多级机制管理：

```typescript
// ✅ 推荐：使用 meta.subject 归类相关 mutation（RBAC + Billing 共享）
protectedProcedure
  .meta({ subject: 'CurrencyPolicy' })
  .mutation(async ({ ctx }) => { /* switchToCustom */ })

protectedProcedure
  .meta({ subject: 'CurrencyPolicy' })
  .mutation(async ({ ctx }) => { /* resetToPlatform */ })

// ✅ 可选：显式声明完整 permission（仅改 RBAC）
protectedProcedure
  .meta({ permission: { action: 'publish', subject: 'ContentWorkflow' } })
  .mutation(async ({ ctx }) => { /* publish */ })

// ✅ 允许：不声明任何权限（Admin UI 会显示 procedure Name，管理员可配置）
protectedProcedure
  .mutation(async ({ ctx }) => { /* approve */ })
  // → Admin UI 显示 "approve"，管理员可配权限，未配走 Default Policy
```

**开发者体验总结**：
| 场景 | 开发者工作量 | 权限来源 |
|------|-------------|----------|
| createCrudRouter | **零** | 自动推导 |
| 非标准 mutation + subject | 一行 `meta.subject` | subject 分组（管理员可覆盖） |
| 非标准 mutation + 显式声明 | 一行 `meta.permission` | 开发者声明（管理员可覆盖） |
| 非标准 mutation 不声明 | **零** | 管理员配置 or Default Policy |

### `RESOURCE_DEFINITIONS` 职责拆分

| 职责 | 旧来源 | 新来源 |
|------|--------|--------|
| permission subject 注册 | `RESOURCE_DEFINITIONS` 手动 | 启动扫描自动推导 |
| subject title | `RESOURCE_DEFINITIONS.title` | 标准 `t(subject)` 翻译 |
| 菜单结构 | `RESOURCE_DEFINITIONS` | 保持不变（菜单无法从路由推导） |

### CASL Action 注册（11 个 auto-crud actions）

当前 `APP_ACTIONS` 仅定义传统 CRUD 四动词（create/read/update/delete）。引入 11 个 auto-crud actions 后，Admin UI 需要知道所有合法 action 的元数据（名称、分组、描述）才能展示和配置。

```typescript
/**
 * Auto-crud action 元数据。
 * Admin UI 用于展示 action 列表和分组。
 */
const AUTO_CRUD_ACTION_META: Record<string, {
  group: 'basic' | 'batch' | 'data';
  label: string;        // i18n key
  description: string;  // i18n key
  risk: 'low' | 'medium' | 'high';
}> = {
  // 基础组
  list:        { group: 'basic', label: 'actions.list',        description: 'actions.list.desc',        risk: 'low' },
  get:         { group: 'basic', label: 'actions.get',         description: 'actions.get.desc',         risk: 'low' },
  create:      { group: 'basic', label: 'actions.create',      description: 'actions.create.desc',      risk: 'medium' },
  update:      { group: 'basic', label: 'actions.update',      description: 'actions.update.desc',      risk: 'medium' },
  delete:      { group: 'basic', label: 'actions.delete',      description: 'actions.delete.desc',      risk: 'high' },
  // 批量组
  createMany:  { group: 'batch', label: 'actions.createMany',  description: 'actions.createMany.desc',  risk: 'medium' },
  updateMany:  { group: 'batch', label: 'actions.updateMany',  description: 'actions.updateMany.desc',  risk: 'medium' },
  deleteMany:  { group: 'batch', label: 'actions.deleteMany',  description: 'actions.deleteMany.desc',  risk: 'high' },
  upsert:      { group: 'batch', label: 'actions.upsert',      description: 'actions.upsert.desc',      risk: 'medium' },
  // 数据组
  export:      { group: 'data',  label: 'actions.export',      description: 'actions.export.desc',      risk: 'medium' },
  import:      { group: 'data',  label: 'actions.import',      description: 'actions.import.desc',      risk: 'high' },
};

/**
 * 非标准 mutation 的 action 不在上述列表中，
 * Admin UI 直接显示 procedure name 作为 action 名称（如 approve、publish）。
 */
```

**注册时机**：启动时与 `buildPermissionRegistry` 一同初始化。Admin UI 通过 API 获取 action 元数据用于展示。

### 三系统自动化总览

| 系统 | 扫描用途 | 数据源 | 开发者感知 |
|------|---------|--------|-----------|
| **Infra Policy** | path → module | `infra.policy.{m}`（模块级默认） | 零（Admin 配置） |
| **Billing** | path → module → subject | `billing.module.{m}.subject` + 过程级覆盖 | 插件声明 or 零（继承模块默认） |
| **RBAC (CRUD)** | path + table → action + subject | 启动扫描自动推导 | **零** |
| **RBAC (非标准)** | path → Name 导出 | `rbac.module.{m}.subject` + 管理员 / Default Policy | 可选 `meta.permission.subject` |
| **RBAC title** | subject → 标准 t() | Core: Admin 翻译页面；插件: plugin.json i18n | 一条翻译 |
| **subject 配置** | meta.permission.subject → 覆盖 | 开发者默认 + 管理员修改 | 一行 meta（可选） |
| **配置模板** | 预设规则 → 批量写入模块级+过程级 | 系统/平台预设 + 管理员选择 | 零（可选初始化工具） |
| **模块级默认** | path → module → 扁平 key | `infra.policy.{m}` / `rbac.module.{m}.*` / `billing.module.{m}.*` | 零（Admin/模板配置） |

### 租户级能力映射覆盖（Tenant-Level RBAC Override）

#### 反向指针模型（Reverse Pointers）

Capability 是抽象标签（Lock），路由主动指向它（Door → Lock）。Override 不修改 Capability 集合本身，而是改变路由的指针：

```
出厂默认：
  🚪 order.edit   ──→ 🏷️ OrderManage
  🚪 order.refund ──→ 🏷️ OrderManage

管理员 Override 后：
  🚪 order.edit   ──→ 🏷️ OrderManage
  🚪 order.refund ──→ 🏷️ OrderRefund_Special  ← 指针改变
```

指针改变后，RBAC 和 Billing **同时生效**：
- RBAC：持有 `OrderManage` 的用户无法调用 `order.refund`（锁不匹配 → 403）
- Billing：购买含 `OrderManage` 的套餐无法使用退款（锁不匹配 → 402）

#### 三级瀑布解析

```typescript
/**
 * 解析路由所需的 Capability。
 *
 * 优先级：tenant scope > global scope > 代码默认
 *
 * RBAC 和 Billing 都查 tenant scope：
 * - RBAC：租户内部分权
 * - Billing：租户自装插件的计费映射
 * 安全保障在写入层：租户只能写自己插件路径的 billing override。
 */
async function resolveCapability(
  path: string,
  tenantId: string,
  dimension: 'rbac' | 'billing',
): Promise<string> {
  // SettingsService.get('tenant', ...) 内部已实现 cascade：
  //   tenant scope → global scope → schema default
  // 因此无需手动分两步查 tenant + global，单次调用即完成优先级链。
  const override = await settings.get(
    'tenant', `${dimension}.override.${path}`, { organizationId: tenantId },
  );
  if (override) return override;

  // 代码默认（启动扫描推导）
  return registry.get(path)?.defaultCapability ?? null;
}
```

#### 安全边界

| 维度 | 租户可配 | 说明 |
|------|---------|------|
| **RBAC 映射** | ✅ 主动开放 | `rbac.override.{path}` tenant scope，租户内部分权 |
| **Billing 映射（平台能力）** | — 不涉及 | 平台管理员配 global scope，租户无写入权限 |
| **Billing 映射（租户自装插件）** | ✅ 主动开放 | `billing.override.{path}` tenant scope，租户配自己插件的计费映射 |
| **Sub-Billing** | ✅ 主动开放 | 租户从已有 capability 中选择 + 设配额组成 Sub-Plan，不涉及映射覆盖 |
| **Infra Policy** | — 不涉及 | `infra.policy.{m}` 仅 global scope，数据隔离策略由平台决定 |

**存储 key**：

| Key | Scope | 含义 |
|-----|-------|------|
| `rbac.override.{path}` | global | 平台级 RBAC Capability 覆盖 |
| `rbac.override.{path}` | tenant | 租户级 RBAC Capability 覆盖 |
| `billing.override.{path}` | global | 平台级 Billing subject 覆盖（core + 平台插件） |
| `billing.override.{path}` | tenant | 租户级 Billing subject 覆盖（仅租户自装插件，写入层校验路径归属） |

#### 与 Admin UI 的关系

| 配置界面 | 用户 | 功能 | 对应概念 |
|---------|------|------|---------|
| **权限管理 → 角色管理**（已有） | 安全管理员 / 租户管理员 | 角色内选择 Permission，启动扫描自动生成可选列表 | 地方二（RBAC）：配钥匙串 |
| **计费管理 → 能力映射**（Billing 映射） | 产品经理 / 商务 | API→subject 映射 | 地方一（Billing）：改锁 |
| **平台设置 → 基础设施策略**（Infra Policy） | 平台管理员 | 模块级数据隔离策略 | 基础设施配置 |
| **套餐管理**（业务打包） | 产品经理 / 租户老板 | Capability→Plan 组合 | 地方二（Billing）：配钥匙串 |
| **租户设置 → 权限定制**（租户自治） | 租户管理员 | 租户级 RBAC 映射微调 | 地方一的租户版 |

### Sub-Billing（B2B2X 二次售卖）

#### 设计动机

WordRhyme 的目标场景包括 B2B2X 多级商业架构（如电商代发平台、SaaS 分销体系）。租户不仅是"使用者"，也是"小平台"——需要向自己的客户/分销商售卖功能套餐。

#### 插件安装模型

插件统一从**插件市场**获取，"平台插件"和"租户插件"的区别是**安装者 scope**，不是来源：

| | 平台管理员安装 | 租户管理员安装 |
|--|-------------|-------------|
| scope | `platform`（全局，所有租户可用） | `tenant`（仅该租户） |
| 计费 | 可纳入 Platform Plan | 租户自管 |
| 来源 | 插件市场 or 本地上传（不区分） | 插件市场 or 本地上传（不区分） |
| 路由加载 | 启动时加载 | 动态注册 |

#### 插件 Manifest 扫描（Cache-Miss 模式）

不管插件来自市场还是本地上传，最终都产出同一个 `PluginProcedureManifest`。
扫描策略：**先查市场（预扫描缓存），没有则实时扫描**。调用者不关心来源。

```typescript
/**
 * 插件 Manifest 解析（Cache-Miss 模式）。
 *
 * 市场发布时已预扫描 → 直接拉取（缓存命中）。
 * 本地上传或市场未收录 → 安装时实时扫描（缓存未命中）。
 * 统一输出 PluginProcedureManifest，运行时不关心来源。
 */
async function resolveManifest(
  pluginId: string,
  version: string,
  packagePath: string,
): Promise<PluginProcedureManifest> {
  // 1. 先查市场（预扫描缓存）
  const cached = await marketplace.getManifest(pluginId, version);
  if (cached) return cached;

  // 2. 市场没有 → 实时扫描（本地上传等场景）
  return await scanPluginPackage(packagePath);
}

/**
 * 市场预扫描结果 / 本地扫描结果（统一结构）。
 */
interface PluginProcedureManifest {
  pluginId: string;
  version: string;

  procedures: Array<{
    path: string;              // 'pluginApis.crm.list'
    name: string;              // 'list'
    type: 'query' | 'mutation';
    defaultPermission?: {      // 插件开发者声明的默认权限
      action: string;
      subject: string;
      group?: string;
    };
    defaultSubject?: string; // 插件开发者声明的默认计费 Capability
  }>;

  capabilities: Array<{        // 插件声明的 Capability 列表（用于 Plan 打包）
    subject: string;           // 'plugin.crm.export'
    name: string;              // '高级导出'
    description: string;
    meteringType?: 'boolean' | 'quota' | 'usage';
  }>;
}
```

#### 插件安装统一流程

```typescript
/**
 * 插件安装。不区分来源，统一流程。
 */
async function installPlugin(
  pluginId: string,
  version: string,
  packagePath: string,
  installer: { scope: 'platform' | 'tenant'; organizationId: string },
): Promise<void> {
  // 1. 获取 Manifest（Cache-Miss 模式）
  const manifest = await resolveManifest(pluginId, version, packagePath);

  // 2. 存储 Manifest 到 DB（启动时复用，不需要重新扫描）
  await savePluginManifest(manifest, installer);

  // 3. 动态注册路由
  await registerPluginRoutes(manifest);

  // 4. 激活插件
  await activatePlugin(manifest, installer);
}
```

#### 路由扫描两阶段模型

```
服务启动 (PM2)
  → 阶段 1：扫描 Core routes → CoreProcedureRegistry（内存常驻）
  → 阶段 2：从 DB 加载所有已安装插件的 Manifest（不重新扫描代码）
      ├─ scope=platform → 追加到全局 Registry
      └─ scope=tenant   → 加载到 tenantPluginCache（按 tenantId 索引）

运行时请求
  → resolveProcedureEntry(path, tenantId)
      ├─ 先查 CoreProcedureRegistry（Core + 平台插件）
      └─ 再查 tenantPluginCache[tenantId]（租户插件）
      └─ 都没有 → 404
```

```typescript
/**
 * 运行时 Procedure 查找：Core Registry + 租户 Plugin Manifest 合并。
 */
function resolveProcedureEntry(
  path: string,
  tenantId: string,
): ProcedureEntry | null {
  // 1. Core + 平台插件（启动扫描，内存常驻）
  const coreEntry = coreProcedureRegistry.get(path);
  if (coreEntry) return coreEntry;

  // 2. 租户插件（Manifest 从 DB 加载，按 tenantId 缓存）
  const tenantPlugins = tenantPluginCache.get(tenantId);
  if (tenantPlugins) {
    const pluginEntry = tenantPlugins.get(path);
    if (pluginEntry) return pluginEntry;
  }

  // 3. 都没有 → 404
  return null;
}
```

#### 三类 Capability 与计费分流

| 来源 | 示例 | 谁安装 | 平台计费 | 租户计费 |
|------|------|--------|---------|---------|
| **平台基础设施** | AI、存储、CDN | Core 内置 | 用量/配额 | 可转卖给用户 |
| **平台安装的插件** | 高级分析、自动化 | 平台管理员 | 含在 Platform Plan 中 | 可打包给用户 |
| **租户自装的插件** | CRM、SEO | 租户管理员 | 不直接计费（市场分成另算） | 租户自主定价 |

#### 核心模型

```
┌──────────────────────────────────────────────────────────────┐
│ 平台 (WordRhyme)                                              │
│  提供：基础设施（AI、存储）+ 插件市场 + 平台安装的插件          │
│                                                                │
│  Platform Plan: "企业版"                                       │
│    基础设施配额: AI 10万次, 存储 100GB                          │
│    平台插件功能: 高级分析仪表盘, 自动化工作流                   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 租户 A (电商批发商)          平台套餐: 企业版            │  │
│  │  自装插件: CRM, 订单管理                                  │  │
│  │                                                            │  │
│  │  Sub-Plan: "分销商普通版"                                 │  │
│  │    → CRM基础（租户插件）                                   │  │
│  │  Sub-Plan: "分销商至尊版"                                 │  │
│  │    → CRM高级（租户插件）+ AI 1000次（平台转卖）           │  │
│  │    → 高级分析（平台插件转卖）                              │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐              │  │
│  │  │ 分销商 X         │  │ 分销商 Y         │              │  │
│  │  │ Plan: 普通版     │  │ Plan: 至尊版     │              │  │
│  │  └─────────────────┘  └─────────────────┘              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### 运行时 Billing 网关（按来源分流）

```typescript
/**
 * Billing 网关。按 Capability 来源分流检查。
 *
 * 平台提供的能力（基础设施 + 平台插件）→ 双层网关
 * 租户自装插件的能力 → 单层网关（租户自管）
 */
async function billingGateway(ctx: Context): Promise<void> {
  const { tenantId, userId, path } = ctx;
  const entry = resolveProcedureEntry(path, tenantId);
  const billingSubject = await resolveCapability(path, tenantId, 'billing');

  if (entry.origin === 'core' || entry.origin === 'platform-plugin') {
    // ========================================
    // 平台提供的能力：双层网关
    // ========================================

    // 第一层：平台检查租户配额
    const platformOk = await billingService.checkEntitlement(
      tenantId, billingSubject, 'platform',
    );
    if (!platformOk.granted) {
      throw new TRPCError({
        code: 'PAYMENT_REQUIRED',
        message: `租户套餐不含此功能: ${billingSubject}`,
      });
    }

    // 第二层：租户检查子用户配额（仅 Sub-Billing 启用时）
    if (await isSubBillingEnabled(tenantId)) {
      const tenantOk = await billingService.checkEntitlement(
        userId, billingSubject, 'tenant', { tenantId },
      );
      if (!tenantOk.granted) {
        throw new TRPCError({
          code: 'PAYMENT_REQUIRED',
          message: `请联系您的服务商升级套餐`,
        });
      }
    }

  } else if (entry.origin === 'tenant-plugin') {
    // ========================================
    // 租户自装插件：单层网关（租户自管）
    // 平台不管功能级计费，只管订阅级（你的套餐允许装几个插件）
    // ========================================
    await checkTenantEntitlement(tenantId, userId, billingSubject);
  }
}
```

#### 约束规则

1. **不可超卖**：租户 Sub-Plan 中的 Capabilities 必须满足：
   - 平台提供的 Capability → 必须在平台分配给该租户的集合内
   - 租户插件的 Capability → 必须是该租户已安装的插件提供的
2. **平台收费优先**：平台 → 租户的计费不受 Sub-Billing 影响
3. **递归深度限制**：v2 仅支持两级（平台 → 租户 → 子用户），不支持无限递归
4. **计量独立**：平台级 Usage 和租户级 Usage 分别记录，互不干扰

#### 防超卖四层防护

| 层级 | 机制 | 触发时机 | 作用 |
|------|------|---------|------|
| **L1 UI 过滤** | 创建 Sub-Plan 时只展示租户已有 Capabilities | 创建时 | 天然约束，用户看不到没有的能力 |
| **L2 API 校验** | `validateSubPlan` 检查合法性 | 创建/更新 Sub-Plan 时 | 防绕过 UI 直调 API（防御纵深） |
| **L3 Drift Detection** | 平台变更时扫描受影响 Sub-Plans | 平台变更租户 Capabilities 时 | 主动发现漂移，通知租户 |
| **L4 运行时网关** | `billingGateway` 双层检查 | 每次请求 | 兜底（即使漂移了也不会真正超卖） |

**设计重心**：L1（UI 过滤）是主要防线，L2（API 校验）是防御纵深，L3（Drift Detection）处理状态变更后的不一致，L4（运行时网关）是最终兜底。

#### Sub-Plan 创建（UI 过滤 + API 校验）

```typescript
/**
 * 获取租户创建 Sub-Plan 时可选的 Capabilities。
 * UI 只展示这个列表，用户看不到没有的能力。
 */
async function getAvailableCapabilities(tenantId: string): Promise<CapabilityOption[]> {
  const result: CapabilityOption[] = [];

  // 1. 平台分配给该租户的 Capabilities
  const allocated = await billingService.getAllocatedCapabilities(tenantId);
  for (const cap of allocated) {
    result.push({ ...cap, origin: cap.origin }); // 'core' | 'platform-plugin'
  }

  // 2. 该租户已安装插件提供的 Capabilities
  const plugins = await getInstalledPlugins(tenantId);
  for (const plugin of plugins) {
    for (const cap of plugin.manifest.capabilities) {
      result.push({ ...cap, origin: 'tenant-plugin', pluginId: plugin.id });
    }
  }

  return result;
}

/**
 * Sub-Plan 创建/更新时的 API 校验（防御纵深）。
 * 正常 UI 流程不会触发 violations，仅防绕过 UI 直调 API。
 */
async function validateSubPlan(
  tenantId: string,
  subPlanCapabilities: string[],
): Promise<{ valid: boolean; violations: string[] }> {
  const available = await getAvailableCapabilities(tenantId);
  const availableSet = new Set(available.map(c => c.subject));
  const violations = subPlanCapabilities.filter(cap => !availableSet.has(cap));
  return { valid: violations.length === 0, violations };
}
```

#### 计量模型（单表 + scope 列）

复用现有 `usage_records` 表（append-only，不可修改/删除），新增 `billingScope` + `billingOwnerId` 列：

```typescript
// usage_records 表扩展
{
  id: string;
  subject: string;                          // 消耗的 Capability
  quantity: number;                            // 消耗量

  // === 新增字段 ===
  billingScope: 'platform' | 'tenant';         // 哪一层的计费记录
  billingOwnerId: string;                      // 谁在收钱（platform orgId 或 tenant orgId）
  consumerId: string;                           // 谁在消费（tenant orgId 或 sub-user Id）

  createdAt: timestamp;
  // ... 其他审计字段
}
```

**一次 API 调用的记录产出（按 Capability 来源不同）**：

| Capability 来源 | platform scope 记录 | tenant scope 记录 |
|----------------|--------------------|--------------------|
| 平台基础设施（如 AI 用量） | ✅ 扣租户配额 | ✅ 扣子用户配额（Sub-Billing 启用时） |
| 平台插件功能 | ✅ 扣租户配额 | ✅ 扣子用户配额（Sub-Billing 启用时） |
| 租户自装插件功能 | ❌ 无记录 | ✅ 扣子用户配额 |

**双层扣减时序（平台能力 + Sub-Billing 启用）**：
```
子用户调用 API
  → 平台 Billing Check（租户额度够？）
  → 租户 Sub-Billing Check（子用户额度够？）
  → 执行业务逻辑
  → 写入记录 1: { billingScope: 'platform', billingOwnerId: 'platform', consumerId: 'tenant-A' }
  → 写入记录 2: { billingScope: 'tenant', billingOwnerId: 'tenant-A', consumerId: 'sub-user-X' }
```

**单层扣减时序（租户插件能力）**：
```
子用户调用 API
  → 租户 Entitlement Check（子用户有权限？）
  → 执行业务逻辑
  → 写入记录: { billingScope: 'tenant', billingOwnerId: 'tenant-A', consumerId: 'sub-user-X' }
```

#### Settings 扩展

| Key | Scope | 含义 |
|-----|-------|------|
| `billing.sub-billing.enabled` | tenant | 租户是否启用 Sub-Billing |
| `billing.sub-plan.{planId}` | tenant | 租户定义的 Sub-Plan 内容 |
| `billing.sub-plan.{planId}.capabilities` | tenant | Sub-Plan 包含的 Capabilities 列表 |
| `billing.sub-user.{userId}.planId` | tenant | 子用户订阅的 Sub-Plan |

#### 与现有系统的集成

| 系统 | 影响 | 改动 |
|------|------|------|
| **Billing middleware** | 按 Capability 来源分流为双层/单层网关 | 新增 `billingGateway` 分流逻辑 |
| **Entitlement Service** | 支持 tenant scope 查询 | `checkEntitlement` 增加 scope 参数 |
| **Usage Service** | 单表 + scope 列 | `usage_records` 新增 `billingScope`、`billingOwnerId`、`consumerId` 字段 |
| **Plugin Install** | 统一 Manifest 流程 | 新增 `resolveManifest`（Cache-Miss）、`savePluginManifest` |
| **启动加载** | 从 DB 读 Manifest，不重新扫描 | `loadPluginManifests()` → tenantPluginCache |
| **Admin UI（平台）** | 无影响 | — |
| **Admin UI（租户）** | 新增 Sub-Plan 管理页面 | 套餐创建 + 子用户分配 |
| **RBAC** | 无影响 | 租户级 RBAC Override 已独立 |

### Drift Detection（漂移检测）

当平台变更租户 Capabilities（降级、下架能力、卸载插件）时，已创建的 Sub-Plans 和 Settings Overrides 可能引用已失效的 Capability。Drift Detection 主动发现这些不一致并通知相关方。

#### 三类漂移场景

| 漂移源 | 触发事件 | 受影响对象 | 后果 |
|--------|---------|-----------|------|
| 平台降级租户 Plan | 租户套餐变更 | 该租户的 Sub-Plans | Sub-Plan 包含租户不再拥有的 Capability |
| 平台卸载插件 | 插件卸载/下架 | 所有引用该插件的 Override + Sub-Plans | 路由消失，Override/Sub-Plan 悬空 |
| 租户卸载插件 | 租户卸载插件 | 该租户的 Sub-Plans | Sub-Plan 包含已卸载插件的 Capability |

#### 检测时机

| 时机 | 检测方式 | 响应 |
|------|---------|------|
| **事件驱动**（主动） | 平台变更/插件卸载时立即扫描 | 通知受影响租户 + 审计日志 |
| **启动扫描**（兜底） | 服务启动时全量扫描一次 | Governance Drift Report |

#### 事件驱动检测

```typescript
/**
 * 平台变更租户 Capabilities 后的漂移检测。
 * 触发时机：租户 Plan 降级、平台下架能力。
 */
async function onTenantCapabilitiesChanged(
  tenantId: string,
  removed: string[],  // 被移除的 Capabilities
): Promise<DriftReport> {
  if (removed.length === 0) return { affected: [] };

  // 1. 查找该租户包含被移除能力的 Sub-Plans
  const affectedPlans = await findSubPlansContaining(tenantId, removed);

  // 2. 查找该租户引用被移除能力的 Settings Overrides
  const affectedOverrides = await findOverridesReferencing(tenantId, removed);

  if (affectedPlans.length > 0 || affectedOverrides.length > 0) {
    // 通知租户管理员
    await notify(tenantId, {
      type: 'capability-drift',
      message: `您的套餐变更导致 ${affectedPlans.length} 个子套餐、`
             + `${affectedOverrides.length} 条权限覆盖包含已失效的功能`,
      affectedPlans,
      affectedOverrides,
      removedCapabilities: removed,
    });

    logger.warn(
      `[Drift] Tenant ${tenantId}: `
      + `${affectedPlans.length} Sub-Plans, ${affectedOverrides.length} Overrides affected`,
    );
  }

  return { affected: [...affectedPlans, ...affectedOverrides] };
}

/**
 * 插件卸载后的漂移检测。
 * 触发时机：平台卸载插件（影响所有租户）或租户卸载插件（影响该租户）。
 */
async function onPluginUninstalled(
  pluginId: string,
  scope: 'platform' | 'tenant',
  organizationId?: string,
): Promise<DriftReport> {
  // 获取该插件提供的所有 Capabilities
  const manifest = await getPluginManifest(pluginId);
  const removedCapabilities = manifest.capabilities.map(c => c.subject);
  const removedPaths = manifest.procedures.map(p => p.path);

  if (scope === 'platform') {
    // 平台卸载 → 扫描所有租户
    const allTenants = await getAllTenantIds();
    for (const tenantId of allTenants) {
      await onTenantCapabilitiesChanged(tenantId, removedCapabilities);
    }
  } else {
    // 租户卸载 → 只扫描该租户
    await onTenantCapabilitiesChanged(organizationId!, removedCapabilities);
  }

  // 清理孤儿 Settings Overrides（引用已不存在的路由）
  await cleanupOrphanOverrides(removedPaths, scope, organizationId);

  return { removedCapabilities, removedPaths };
}
```

#### 启动时全量扫描（Governance Drift Report）

```typescript
/**
 * 启动时全量扫描，生成 Governance Drift Report。
 * 检测所有 Settings Overrides 和 Sub-Plans 是否引用了有效的路由/能力。
 */
async function startupDriftScan(
  coreRegistry: Map<string, ProcedureEntry>,
): Promise<GovernanceDriftReport> {
  const report: GovernanceDriftReport = {
    orphanOverrides: [],   // 引用不存在路由的 Override
    driftedSubPlans: [],   // 包含无效 Capability 的 Sub-Plan
    timestamp: new Date(),
  };

  // 1. 扫描所有 rbac.override.* 和 billing.override.* Settings
  const allOverrides = await settings.scan('global', 'rbac.override.*');
  for (const override of allOverrides) {
    const path = override.key.replace('rbac.override.', '');
    if (!coreRegistry.has(path)) {
      report.orphanOverrides.push({
        key: override.key,
        path,
        reason: 'route-not-found',
      });
    }
  }

  // 2. 扫描所有租户的 Sub-Plans（抽样或全量，根据租户数决定）
  const tenants = await getTenantsWithSubBilling();
  for (const tenantId of tenants) {
    const available = await getAvailableCapabilities(tenantId);
    const availableSet = new Set(available.map(c => c.subject));
    const subPlans = await getSubPlans(tenantId);

    for (const plan of subPlans) {
      const invalid = plan.capabilities.filter(c => !availableSet.has(c));
      if (invalid.length > 0) {
        report.driftedSubPlans.push({
          tenantId,
          planId: plan.id,
          invalidCapabilities: invalid,
        });
      }
    }
  }

  // 输出报告
  if (report.orphanOverrides.length > 0 || report.driftedSubPlans.length > 0) {
    logger.warn(
      `[Governance Drift Report]\n`
      + `  Orphan Overrides: ${report.orphanOverrides.length}\n`
      + `  Drifted Sub-Plans: ${report.driftedSubPlans.length}`,
    );
  }

  return report;
}
```

### 性能优化

#### 运行时热路径分析

```
请求进入
  → resolveProcedureEntry(path, tenantId)       ← 内存查找
  → resolveCapability(path, tenantId, 'rbac')    ← 最多 2 次 Settings 查询
  → resolveCapability(path, tenantId, 'billing') ← 最多 1 次 Settings 查询
  → isSubBillingEnabled(tenantId)                ← 1 次 Settings 查询
  → billingGateway()                              ← 1-2 次 Entitlement 查询
  → RBAC check
  → 执行业务逻辑
  → Usage 写入（1-2 条 append-only 记录）         ← 同步 DB 写入
```

**优化前每请求最坏情况**：~4 次 Settings I/O + 2 次 Entitlement 查询 + 2 次 DB 写入。

#### P0：预计算 Capability 映射

`resolveCapability()` 的 3 级瀑布查询是最大 I/O 热点。改为**写入时预计算，运行时纯内存读**：

```typescript
/**
 * 预计算 Capability 映射缓存。
 * Key: `${tenantId}:${dimension}:${path}`
 * Value: 最终解析出的 Capability（已完成优先级链计算）
 *
 * 写入时触发重算（低频），运行时纯内存读（高频）。
 */
const resolvedCapabilityCache = new Map<string, string>();

/**
 * Override 变更时触发重算。
 * 触发时机：管理员修改 Override、租户 Plan 变更、插件安装/卸载。
 */
async function recomputeCapabilities(
  tenantId: string,
  dimension: 'rbac' | 'billing',
): Promise<void> {
  const paths = getAllProcedurePaths(tenantId);
  for (const path of paths) {
    const resolved = await cascadeResolve(path, tenantId, dimension);
    resolvedCapabilityCache.set(`${tenantId}:${dimension}:${path}`, resolved);
  }
}

/**
 * 运行时解析：纯内存查找，零 I/O。
 */
function resolveCapability(
  path: string,
  tenantId: string,
  dimension: 'rbac' | 'billing',
): string | null {
  return resolvedCapabilityCache.get(`${tenantId}:${dimension}:${path}`)
    ?? registry.get(path)?.defaultCapability
    ?? null;
}
```

**重算触发时机**：Override 变更、租户 Plan 变更、插件安装/卸载。这些都是低频操作（每天级），不影响性能。

**PM2 多节点一致性**：重算结果写入 Redis，各节点订阅 `CAPABILITY_RECOMPUTED` 事件刷新本地缓存。复用现有 Settings 的 Redis Pub/Sub 机制。

#### P0：Usage 写入异步化

Usage 记录是 append-only 审计数据，不需要阻塞业务响应：

```typescript
/**
 * Usage 异步写入队列。
 * 业务逻辑完成后立即返回响应，Usage 后台批量刷盘。
 */
const usageQueue: UsageRecord[] = [];

// 业务代码中：推入队列，不 await
function recordUsage(record: UsageRecord): void {
  usageQueue.push(record);
}

// 后台刷盘：每 100 条或每 1s，批量写入 DB
const FLUSH_INTERVAL = 1000;  // 1s
const FLUSH_BATCH_SIZE = 100;

setInterval(async () => {
  if (usageQueue.length === 0) return;
  const batch = usageQueue.splice(0, FLUSH_BATCH_SIZE);
  await db.insert(usageRecords).values(batch);
}, FLUSH_INTERVAL);
```

**崩溃恢复**：队列中未刷盘记录会丢失。缓解方案：
- 生产环境使用 Redis List 作为持久化队列
- 或使用 PostgreSQL `COPY` 批量写入 + WAL 保障

#### P1：tenantPluginCache LRU 淘汰

全量租户插件缓存内存压力大（10K 租户 × 20 插件 = 200K 条目）。改为 LRU + 按需加载：

```typescript
const tenantPluginCache = new LRUCache<string, Map<string, ProcedureEntry>>({
  max: 1000,              // 最多缓存 1000 个活跃租户
  ttl: 10 * 60 * 1000,   // 10 分钟 TTL
});

function getTenantPlugins(tenantId: string): Map<string, ProcedureEntry> {
  let plugins = tenantPluginCache.get(tenantId);
  if (!plugins) {
    plugins = loadFromDB(tenantId);  // 首次访问从 DB 加载
    tenantPluginCache.set(tenantId, plugins);
  }
  return plugins;
}
```

#### 优化总结

| 优先级 | 优化 | 收益 | 复杂度 |
|--------|------|------|--------|
| **P0** | 预计算 Capability 映射 | 每请求从 ~4 次 I/O → 0 次 | 中（写入时重算 + Redis 同步） |
| **P0** | Usage 异步写入 | 响应延迟减少 ~2 次 DB write | 低（队列 + 批量刷盘） |
| **P1** | tenantPluginCache LRU | 内存从 O(全量租户) → O(活跃租户) | 低 |
| **P2** | 预计算结果 Redis 共享 | PM2 多节点一致性 | 中（复用现有 Pub/Sub） |

**P0 做完后，运行时热路径**：
```
请求进入
  → resolveProcedureEntry()   ← 内存
  → resolveCapability(rbac)   ← 内存（预计算）
  → resolveCapability(billing) ← 内存（预计算）
  → billingGateway()           ← Entitlement 缓存
  → RBAC check                 ← 内存
  → 执行业务逻辑
  → recordUsage()              ← 推入队列，不阻塞
  → 返回响应
```
**零 Settings I/O，零同步 DB 写入。**

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Settings 查询频率（hasCustomData 每请求查） | 低 | 仅 `hasCustomData` 仍需查 Settings（带 ~300s 缓存）；`getMode` 已改为内存同步读取 |
| `require_tenant` 短路后无额外开销 | 低 | `getMode()` 是同步内存读取，未配置的模块零 I/O |
| router name 与 module name 不一致 | 低 | 已确认：router key = `currency`（router.ts:51），Settings key = `infra.policy.currency` |
| switchToCustom 时 Settings 标记与实际数据不同步 | 中 | 事务保证：数据复制 + 标记设置在同一事务中 |
| 命名冲突（Core router name 与 plugin normalized ID 相同） | 低 | 命名规范：Core 用英文名词（currency），插件用 kebab-case（lbac-teams） |
| Settings 未初始化时 guard 静默失效 | 高 | `assertSettingsReady()` fail-fast，首请求即暴露问题 |
| 迁移期间数据丢失 | 中 | 新旧 key 并存回退 + 一致性校验脚本 |
| Admin UI 无法发现可配置模块 | 中 | `listConfigurableModules` endpoint + 静态注册表 |
| 租户 Billing 映射安全 | 低 | 写入层校验路径归属：租户只能写 `billing.override.*` 中自己安装的插件路径；平台能力路径拒绝写入 |
| Sub-Plan 超卖（租户售卖超出平台分配的 Capability） | 中 | 四层防护：UI 过滤（主防线）→ API 校验（防御纵深）→ Drift Detection（漂移通知）→ 运行时网关（兜底） |
| Sub-Billing 双层扣减性能 | 低 | P0 预计算后运行时零 Settings I/O；Usage 异步写入不阻塞响应 |
| 租户级 Usage 与平台级 Usage 不一致 | 中 | 单表 + scope 列，独立审计；定期对账脚本校验一致性 |
| 市场 Manifest 缓存与实际插件代码不一致 | 中 | 插件更新时市场重新扫描；本地上传始终实时扫描；版本号绑定 Manifest |
| 租户插件动态注册后启动加载遗漏 | 中 | 启动时从 DB 读所有已存 Manifest，不依赖运行时状态 |
| 预计算缓存与 Settings 不同步 | 中 | 写入时触发重算 + Redis Pub/Sub 多节点同步；兜底：启动时全量重算 |
| Usage 异步写入崩溃丢失 | 中 | 生产环境用 Redis List 持久化队列；定期对账脚本发现缺失 |
| 漂移检测扫描全量租户性能 | 低 | 事件驱动（只扫受影响租户）为主；启动全量扫描可选抽样 |

---

## v2 已知限制

1. ~~**switchToCustom 鸡蛋悖论**~~：已通过 procedure name 豁免解决（`BYPASS_PROCEDURES` 白名单）
2. **Overlay/Merge 模型**：v2 仅支持 Complete Fork（switchToCustom 复制全部）。Overlay 模型（部分覆写）需 v3 设计
3. **hasCustomData 仍走 Settings**：租户级自定义检测仍需每请求查 Settings（~300s 缓存）。getMode 已优化为内存同步读取
4. **可观测性**：建议在 middleware 中添加 response header `x-infra-effective-org`（非敏感信息，仅 orgId），便于前端和调试工具追踪 Context Swap 是否发生
5. **Sub-Billing 递归深度**：v2 仅支持两级（平台 → 租户 → 子用户），不支持无限层级递归。三级以上需 v3 设计
6. **租户 Sub-Plan 变更传播**：平台降级租户 Capabilities 时，租户 Sub-Plan 不自动缩减。需管理员手动调整或定期对账脚本告警

---

## 多模型评审记录

> **评审时间**: 2026-02-27
> **评审模型**: Codex (后端权威) + Gemini (前端权威)
> **评审结论**: 通过（所有 P0 已修复，P1 已纳入计划）

### P0 修复清单（已合入本文档）

| 编号 | 问题 | 修复 |
|------|------|------|
| P0-1 | `ctx.path` 不存在于 tRPC middleware | 改用 `path` 独立参数（Step 2） |
| P0-2 | `(ctx as any)._meta` 读取错误导致 WRITE guard 失效 | 改用 `meta` 独立参数（Step 2） |
| P0-3 | switchToCustom 鸡蛋悖论未解决 | `BYPASS_PROCEDURES` 白名单（Step 1a, Step 2） |
| P0-4 | 迁移数据丢失风险 | 新旧 key 并存回退 + 一致性校验（Step 7） |

### P1 修复清单（已合入本文档）

| 编号 | 问题 | 修复 |
|------|------|------|
| P1-1 | router key 是 `currency` 不是 `currencies` | 全文统一为 `currency`（Step 3, 4） |
| P1-2 | Settings 缓存是 ~300s 不是 ~60s | 修正风险表描述 |
| P1-3 | Admin UI 失去模块发现机制 | `listConfigurableModules` endpoint（Step 8） |
| P1-4 | 缺少可观测性 response header | 记入 v2 已知限制 #4，实施时添加 |
| P1-5 | Settings 未初始化时 guard 静默失效 | `assertSettingsReady()` fail-fast（Step 1b, 5） |
