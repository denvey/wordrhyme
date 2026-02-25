# Change: Add Currency Tenant Policy Mode

## Why

货币系统当前要求每个租户独立 seed 和管理货币数据，无法由平台统一配置。需要对齐基础设施插件（S3/Email）的三级租户策略模型（`unified | allow_override | require_tenant`），使平台管理员可统一管控货币配置，租户按需继承或覆盖。

## What Changes

- **数据隔离模型**：货币数据从"每租户独立"改为"平台配置 + 租户可选覆盖"，通过 `organizationId = 'platform'` 存储平台级默认货币
- **租户策略**：新增 `core.currency.policy` 设置项，支持 `unified / allow_override / require_tenant` 三种模式
- **前端策略感知**：货币管理页面保留独立菜单，页面内根据 policy mode 显示策略 banner 并控制 CRUD 操作可用性
- **后端查询**：`CurrencyService` 查询增加平台 fallback 逻辑，根据 policy mode 决定数据来源
- **Seed 逻辑**：货币 seed 到 `platform` 组织而非每个租户

## Impact

- Affected specs: `multi-currency`, `admin-ui-host`
- Affected code:
  - `apps/server/src/billing/services/currency.service.ts` — fallback 查询
  - `apps/server/src/billing/services/exchange-rate.service.ts` — fallback 查询
  - `apps/server/src/trpc/routers/currency.ts` — 新增 policy 子路由 + mutation 守卫
  - `apps/server/src/db/seed/seed-accounts.ts` — seed 到 platform
  - `apps/admin/src/pages/currency/Currencies.tsx` — 接入策略 banner + mode-aware CRUD 控制
  - `apps/admin/src/components/settings/PolicyAwareBanner.tsx` — 新增通用策略感知组件
  - `apps/admin/src/hooks/use-currency-policy.ts` — 新增 hook
