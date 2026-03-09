# Change: 实现套餐订阅全生命周期与用量可配

## Why

计费系统的架构治理文档（ENTITLEMENT_SYSTEM、CAPABILITY_BILLING_MODEL）已冻结，后端服务骨架（SubscriptionService、UnifiedUsageService、RenewalService 等）已就位，但套餐用量配置、订阅生命周期管理、配额发放/重置的完整流程和管理 UI 尚未打通。

当前痛点：
- Plan 和 PlanItem 虽有 schema 定义但无完整 CRUD 流程
- 订阅全生命周期（创建→激活→续费→取消→升降级）未串联
- 配额发放和重置策略（hard/soft/capped）未实现
- 缺少管理员配置套餐用量的 Admin UI
- 支付网关 Webhook 回调未对接

## What Changes

### 后端
- 完善 Plan + PlanItem CRUD（含 capability 用量限制配置）
- 实现订阅全生命周期 API（subscribe/activate/renew/cancel/changePlan）
- 实现配额发放（订阅激活时按 PlanItem 创建 tenant_quotas）
- 实现配额重置策略（hard/soft/capped）
- 实现 EntitlementService 门面（编排 Permission Check → Load Entitlements → Usage Validation → Consume 流程）
- 实现插件计费零代码透明化（manifest 声明 + 全局 tRPC middleware 自动拦截）
- 扩展 PluginContext 添加 `usage` 能力（仅动态消耗场景使用）
- 添加 Webhook 处理器（支付成功→激活订阅→发放配额）
- 添加定时任务（到期续费/过期处理）

### 前端
- Plan 管理页面（CRUD + PlanItem 用量配置）
- 订阅管理页面（当前订阅状态、历史记录）
- 租户配额仪表盘（用量统计、配额余量）
- 管理员手动赠送配额入口

### 数据模型
- 扩展 `plan_items` 表：添加 `overagePolicy` 字段（text, default 'deny'，枚举 deny/charge/throttle/downgrade）
- 确认 `plan_items` 表已有字段无需迁移：`resetStrategy`（已有, default 'hard'）、`resetCap`（已有）、`quotaScope`（已有, default 'tenant'）
- 确认 `plan_subscriptions`、`tenant_quotas` 表迁移已由现有 schema 覆盖

## Impact
- Affected specs: billing（新建）
- Affected code:
  - `apps/server/src/billing/services/` — subscription、renewal、quota、entitlement 服务完善
  - `apps/server/src/billing/repos/` — subscription、tenant-quota repo 完善
  - `apps/server/src/trpc/routers/billing.ts` — 补全订阅和配额 API
  - `apps/server/src/trpc/trpc.ts` — 添加全局 plugin billing middleware
  - `apps/server/src/plugins/capabilities/` — 添加 usage capability
  - `packages/plugin/src/types.ts` — PluginContext 添加 usage 能力类型
  - `packages/plugin/src/manifest.ts` — manifest schema 添加 billing.procedures
  - `apps/admin/src/pages/billing/` — 新建管理 UI
  - `packages/db/src/schema/` — 表结构迁移
- Governance docs: 无需修改（已冻结的治理文档完全覆盖此实现）
- 设计参考: `docs/plans/2026-01-14-membership-subscription-design.md`
