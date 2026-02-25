## 1. Backend — Currency Policy

- [x] 1.1 新增 `currency.policy` 子路由（get / set / getVisibility），存储 `core.currency.policy` 到 Settings 的 `global` scope
- [x] 1.2 从 `infra-policy.ts` 复用 `infraPolicyModeSchema` 类型定义
- [x] 1.3 `set` 端点限制仅 platform 组织管理员可调用

## 2. Backend — Currency Service Fallback

- [x] 2.1 `CurrencyService` 新增 `getCurrencyPolicyMode()` 方法，从 Settings 读取当前 mode
- [x] 2.2 `CurrencyService.getEnabledForOrganization()` 按 mode 分支：unified → 查 platform；allow_override → 租户优先，fallback platform；require_tenant → 仅查租户
- [x] 2.3 `getCurrencies` 端点调用新的 `getEnabledForOrganization()` 替代直接调用 `getEnabledWithRates()`
- [x] 2.4 汇率查询（`ExchangeRateService`）同步增加 mode-aware fallback
- [x] 2.5 管理端 `currencies.list/get` 替换 auto-CRUD 默认查询为 mode-aware resolved 查询，返回结果附带 `source: 'platform' | 'tenant'` 标记
- [x] 2.6 管理端 `rates.list/get/history` 同步使用 mode-aware resolved 查询

## 3. Backend — Mutation Guard

- [x] 3.1 货币 CRUD mutation（create/update/delete/toggle/setBase）增加 mode 检查：unified 模式下禁止租户操作
- [x] 3.2 汇率 mutation（set/bulkImport）增加 mode 检查：unified 模式下禁止租户操作
- [x] 3.3 allow_override 模式下增加所有权检查：租户只能修改 `organizationId = 当前租户` 的记录，禁止修改 `organizationId = 'platform'` 的继承记录
- [x] 3.4 新增 `switchToCustom` mutation：复制 platform 货币和汇率到当前租户
- [x] 3.5 新增 `resetToPlatform` mutation：删除当前租户的货币和汇率数据

## 4. Seed 迁移

- [x] 4.1 修改 `seed-accounts.ts`：货币 seed 到 `platform` 组织（非 `default-org`）
- [x] 4.2 保留 `default-org` 已有的货币数据（unified 模式下忽略，不删除）
- [x] 4.3 初始化 `core.currency.policy` = `{ mode: 'unified' }`

## 5. Frontend — Currency Policy Hook

- [x] 5.1 新增 `hooks/use-currency-policy.ts`（`useCurrencyVisibility` / `useCurrencyPolicy`），参照 `use-infra-policy.ts`
- [x] 5.2 类型定义复用 `InfraPolicyMode`

## 6. Frontend — PolicyAwareBanner 通用组件

- [x] 6.1 从 `OverridableSettingsContainer` 提取 banner 视觉部分为独立 `PolicyAwareBanner` 组件
- [x] 6.2 Props：`mode` / `hasCustomConfig` / `onSwitchToCustom` / `onResetToPlatform` / `riskLevel`（不依赖 pluginId）
- [x] 6.3 `OverridableSettingsContainer` 内部改为使用 `PolicyAwareBanner`（保持 DRY）

## 7. Frontend — 货币页面策略接入

- [x] 7.1 `Currencies.tsx` 顶部接入 `PolicyAwareBanner`，根据 `useCurrencyVisibility` 显示策略状态
- [x] 7.2 根据 mode + source 控制 CRUD 按钮显隐：unified → 隐藏所有操作按钮；allow_override 继承中 → 隐藏操作按钮；已自定义/require_tenant → 显示
- [x] 7.3 平台管理员视图：页面底部显示 `TenantPolicySection`（策略配置 radio buttons）
- [x] 7.4 `switchToCustom` / `resetToPlatform` 按钮调用对应 mutation
