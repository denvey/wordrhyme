# 货币系统改造：平台配置 + 三级租户策略

## 目标

对齐 S3/Email 的 infra policy 三级模式，使货币系统支持：

| 模式 | 货币行为 | 汇率行为 | 租户 UI |
|------|---------|---------|--------|
| **unified** | 所有租户使用平台货币 | 使用平台汇率 | 货币管理隐藏 |
| **allow_override** | 继承平台，可自定义启用/禁用 | 继承平台，可自定义汇率 | 显示"继承平台"banner + 切换按钮 |
| **require_tenant** | 租户必须自己配置 | 租户必须自己设置 | 显示"需配置"警告 |

## 与 infra policy 的差异

S3/Email 是插件，配置是**单个 JSON 对象**（存 Settings）。
货币是核心功能，数据是**表记录集合**（currencies + exchange_rates 表）。

**相同点**：3 种模式语义一致、policy 存储方式一致、前端 Banner/切换交互复用。
**不同点**：货币用 DB 表 fallback 而非 Settings cascade。

## 实现方案

### Step 1：Policy 存储

使用 Settings 系统存储策略（和 infra policy 一致）：

```
Key:   core.currency.policy
Scope: global
Value: { mode: 'unified' | 'allow_override' | 'require_tenant' }
Default: { mode: 'unified' }
```

平台管理员在"平台设置 > 货币管理"页面配置模式。

### Step 2：Seed 数据迁移

货币 seed 到 `platform` 组织：

```diff
// seed-accounts.ts
  createPlatformOrganization() {
+   await seedOrganizationCurrencies(db, PLATFORM_ORG_ID, 'system');
  }

  createDefaultOrganization() {
-   await seedOrganizationCurrencies(db, DEFAULT_ORG_ID, 'system');
    // 租户不再独立 seed，通过 fallback 继承 platform
  }
```

### Step 3：后端查询 Fallback（currency.service.ts）

根据 mode 决定查询逻辑：

```typescript
async getEnabledForOrganization(organizationId: string): Promise<Currency[]> {
  const mode = await this.getCurrencyPolicyMode();

  switch (mode) {
    case 'unified':
      // 直接返回平台货币
      return this.getEnabledByOrganization('platform');

    case 'allow_override': {
      // 租户有自定义 → 用租户的，否则 → 回退平台
      const tenantCurrencies = await this.getEnabledByOrganization(organizationId);
      if (tenantCurrencies.length > 0) return tenantCurrencies;
      return this.getEnabledByOrganization('platform');
    }

    case 'require_tenant':
      // 必须用租户自己的
      return this.getEnabledByOrganization(organizationId);
  }
}
```

汇率同理：`exchange-rate.service.ts` 也根据 mode 做 fallback。

### Step 4：Currency Policy Router

在 `currency.ts` router 中新增策略管理端点：

```typescript
// 复用 infraPolicyModeSchema
policy: router({
  // 平台管理员：获取/设置策略
  get: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .query(async ({ ctx }) => {
      requirePlatformOrg(ctx.organizationId);
      return readCurrencyPolicy(settingsService);
    }),

  set: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .input(z.object({ mode: infraPolicyModeSchema }))
    .mutation(async ({ ctx, input }) => {
      requirePlatformOrg(ctx.organizationId);
      await settingsService.set('global', 'core.currency.policy', { mode: input.mode });
    }),

  // 租户：获取可见性
  getVisibility: protectedProcedure
    .query(async ({ ctx }) => {
      const policy = await readCurrencyPolicy(settingsService);
      const hasTenantCurrencies = await currencyService
        .getEnabledByOrganization(ctx.organizationId!);
      return {
        mode: policy.mode,
        hasCustomConfig: hasTenantCurrencies.length > 0,
      };
    }),
}),
```

### Step 5：权限守卫

租户的 currency mutation（create/update/delete/toggle/setBase）需要检查 mode：

```typescript
function assertTenantCanMutate(mode: InfraPolicyMode, orgId: string) {
  if (orgId === 'platform') return; // 平台总是可以操作
  if (mode === 'unified') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Currency is managed by platform' });
  }
  // allow_override 和 require_tenant 允许租户操作
}
```

汇率 mutation 同理，但在 `unified` 和 `allow_override`（未切换自定义时）都禁止租户操作。

### Step 6：前端适配

#### 6a. 租户货币设置页 — 复用 OverridableSettingsContainer 模式

```tsx
// pages/settings/CurrencySettings.tsx
function CurrencySettings() {
  const { data: visibility } = trpc.currency.policy.getVisibility.useQuery();

  if (!visibility || visibility.mode === 'unified') return null;

  return (
    <CurrencyOverridableContainer mode={visibility.mode} hasCustom={visibility.hasCustomConfig}>
      {({ isEditable }) => (
        <CurrencyManagementForm disabled={!isEditable} />
      )}
    </CurrencyOverridableContainer>
  );
}
```

#### 6b. 平台货币管理页

平台管理员的页面多一个"策略选择"区域：

```tsx
// pages/platform/CurrencySettings.tsx
<PolicyModeSelector
  value={policy.mode}
  onChange={(mode) => setPolicy.mutate({ mode })}
  options={[
    { value: 'unified', label: '统一管理', desc: '所有租户使用平台配置' },
    { value: 'allow_override', label: '允许覆盖', desc: '租户可自定义，默认继承平台' },
    { value: 'require_tenant', label: '租户自配', desc: '每个租户必须自己配置' },
  ]}
/>
```

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `apps/server/src/db/seed/seed-accounts.ts` | 货币 seed 到 platform |
| `apps/server/src/db/seed/seed-currencies.ts` | 导入路径已修复 ✅ |
| `apps/server/src/billing/services/currency.service.ts` | 添加 mode-aware fallback 查询 |
| `apps/server/src/billing/services/exchange-rate.service.ts` | 添加 mode-aware fallback |
| `apps/server/src/trpc/routers/currency.ts` | 新增 policy 子路由 + mutation 守卫 |
| `apps/admin/src/pages/platform/CurrencySettings.tsx` | 平台货币管理 + 策略选择 |
| `apps/admin/src/pages/settings/CurrencySettings.tsx` | 租户货币设置（带 override 容器） |

## 不变的部分

- `currencies` / `exchange_rates` 表 schema 不变
- `CurrencySwitcher` 和 `CurrencyProvider` 不变
- `getCurrencies` API 返回格式不变
- `infraPolicyModeSchema` 类型定义复用

## 数据迁移

1. 为 `platform` 组织 seed 货币（本次已完成）
2. 删除 `default-org` 的货币数据（或保留作为 allow_override 场景的租户覆盖）
3. 初始化 `core.currency.policy` = `{ mode: 'unified' }`
