# Tasks: 套餐订阅全生命周期与用量可配

## 1. 数据模型迁移

- [x] 1.1 创建 `capabilities` 表：subject(text, PK)、type(boolean/metered)、unit(text)、description(text)、source(text, 'core'/'plugin')、pluginId(text, nullable)、status(text, 'pending'/'approved'/'rejected', default 'pending')、createdAt
- [x] 1.2 重命名 `plan_items.featureKey` → `plan_items.subject`（含 FK 约束更新至 `capabilities.subject`）
- [x] 1.3 扩展 `plan_items` 表：添加 `overage_policy`（text, default 'deny'，枚举 deny/charge/throttle/downgrade）
- [x] 1.4 确认 `plan_items` 已有字段无需迁移：`reset_strategy`（已有）、`reset_cap`（已有）、`quota_scope`（已有）
- [x] 1.5 确认 `plan_subscriptions` 表 schema 与设计文档一致（含 version 乐观锁、scheduledPlanId 等）
- [x] 1.6 确认 `tenant_quotas` 表 schema 与设计文档一致（含 waterfall 索引、source 唯一约束）
- [x] 1.7 生成 Drizzle 迁移文件并验证
- [x] 1.8 编写 membership userQuotas → tenantQuotas 数据迁移脚本
- [x] 1.9 初始化 Settings seed：`billing.defaultUndeclaredPolicy = 'audit'`（平台级 Default Policy）

## 2. Plan + PlanItem CRUD 完善

- [x] 2.1 使用 `createCrudRouter` 重构 Plan CRUD（create / update / get / list / softDelete），替换现有手写 tRPC procedure
- [x] 2.2 Plan CRUD 使用 factory mode 集成 protectedProcedure.meta({ permission })，移除手写 assertIsAdmin
- [x] 2.3 PlanItem CRUD：因需自定义 capability 选择器交互，使用 factory mode 的 createCrudRouter 或手写 procedure（须注明原因）
- [x] 2.4 PlanItem 支持配置 amount（用量上限）、overagePolicy（deny/charge/throttle/downgrade）、overagePriceCents（charge 时必填）
- [x] 2.5 PlanItem 支持配置 resetStrategy（hard/soft/capped）、resetCap、quotaScope
- [x] 2.6 Plan 软删除校验：有活跃订阅时阻止删除
- [x] 2.7 Capability 注册体系：
  - [x] 2.7.1 创建 `capabilities` DB 表（非内存 registry）：subject(PK)、type(boolean/metered)、unit、description、source(plugin/core)、pluginId、status(pending/approved/rejected)
  - [x] 2.7.2 subject 命名空间校验：注册时强制 `core.*` 仅限 Core、插件必须 `{pluginId}.*` 前缀、重复拒绝（DB 唯一约束）
  - [x] 2.7.3 插件 capability 自动注册：PluginManager 加载插件时，从 manifest `capabilities[]` 扫描并录入 DB（status='pending'）
  - [x] 2.7.4 Core capability seed：系统启动时注册内置 capability（`core.teamMembers`、`core.storage`、`core.projects` 等），status='approved'
  - [x] 2.7.5 Capability 列表查询 API：供 Admin UI 的 PlanItem 选择器使用（仅返回 approved，支持按 source 分组 + 搜索）
  - [x] 2.7.6 Capability 审批 API：platform admin 审批/拒绝 pending 状态的 capability
  - [x] 2.7.7 Capability 审批校验：已被 PlanItem 引用的 capability 不可设为 rejected
  - [x] 2.7.8 插件卸载时清理对应 capability（如无活跃 PlanItem 引用）

## 3. 订阅生命周期 API

- [x] 3.1 实现 subscribe mutation：创建订阅 + 触发支付流程
- [x] 3.2 实现 activate：支付成功后激活订阅 + 发放配额
- [x] 3.3 实现 cancel mutation：设置 cancelAtPeriodEnd 或即时取消
- [x] 3.4 实现 changePlan mutation：升级即时生效（按比例退款）、降级周期末生效
- [x] 3.5 实现 getSubscription / listSubscriptions 查询
- [x] 3.6 实现 getSubscriptionHistory 查询（含续费、变更记录）
- [x] 3.7 订阅状态机：trialing → active → past_due / canceled → expired

## 4. 配额发放与重置

- [x] 4.1 订阅激活时按 PlanItem 创建 tenant_quotas（含 priority、expiresAt）
- [x] 4.2 实现配额重置逻辑：根据 resetStrategy（hard 删旧发新 / soft 余额累加 / capped 封顶累加）
- [x] 4.3 续费时调用配额重置（更新 expiresAt + 按策略重置 balance）
- [x] 4.4 取消/过期时清理配额（删除对应 sourceType='membership'、sourceId='plan_{planId}' 的 tenant_quotas）
- [x] 4.5 升级时重新发放配额（差额补发或全量替换）
- [x] 4.6 管理员手动赠送配额 API：grantTenantQuota mutation

## 5. 续费与过期处理

- [x] 5.1 实现 RenewalService.renewSubscription：延长周期 + 重置配额 + 触发续费支付
- [x] 5.2 实现 RenewalService.processExpiringSubscriptions：批量处理到期订阅
- [x] 5.3 实现定时任务：每日扫描即将到期的订阅
- [x] 5.4 过期处理：cancelAtPeriodEnd=true 的订阅到期后标记 expired
- [x] 5.5 续费失败处理：标记 past_due，可配置宽限期

## 5.5. Entitlement 运行时集成

- [x] 5.5.1 实现 `EntitlementService` 门面：编排 Permission Check → Load Entitlements → Usage Validation → Consume 流程
- [x] 5.5.2 `EntitlementService.requireAccess(orgId, subject)`：boolean 类型，检查活跃桶存在且未过期
- [x] 5.5.3 `EntitlementService.requireAndConsume(orgId, subject, amount)`：metered 类型，检查配额 + 瀑布扣减
- [x] 5.5.4 订阅激活/取消/升降级后，触发 entitlement 缓存失效（通知 EntitlementService 重新加载当前租户的配额快照）
- [x] 5.5.5 配额发放/重置/清理后，确保运行时流程（Permission Check → Load Entitlements → Usage Validation → Consume → Execute）仍然权威
- [x] 5.5.6 集成测试：订阅激活 → entitlement 加载 → 消耗配额 → 验证流程完整执行
- [x] 5.5.7 集成测试：Plan 变更（升降级）→ entitlement 重新加载 → 新配额生效
- [x] 5.5.8 集成测试：订阅过期 → entitlement 失效 → 配额消耗被拒绝

## 5.6. 插件计费零代码透明化

- [x] 5.6.1 扩展 manifest schema：`capabilities.billing.procedures`（Record<procedureName, subject | "free">，支持 `"free"` 特殊值标记免费 procedure）
- [x] 5.6.2 扩展 `PluginContext` 类型：添加 `usage` 能力（`consume(subject, amount)` 用于动态消耗场景），以及 `meta.billing.subject` 过程级声明支持
- [x] 5.6.3 实现 host-side billing middleware（四层决策流程）：
  - [x] 5.6.3.1 在 `registerPluginRouter()` 层包裹插件 router，拦截请求
  - [x] 5.6.3.2 L4 检查：查询 Settings `billing.override.pluginApis.{pluginId}.{procedureName}`（global scope）
  - [x] 5.6.3.3 L3 检查：读取 manifest `billing.procedures[procedureName]`，处理 subject 和 `"free"` 标记
  - [x] 5.6.3.4 L2 检查：查询 Settings `billing.module.{pluginId}.subject`（module default）
  - [x] 5.6.3.5 未命中处理：读取 `billing.defaultUndeclaredPolicy`，按 allow/deny/audit 执行
  - [x] 5.6.3.6 audit 模式下记录审计日志（pluginId、procedureName、timestamp、orgId）
  - [x] 5.6.3.7 确定 subject 后：boolean 类型只检查 → metered 类型检查+消耗；L1 校验 subject 已 approved
- [x] 5.6.4 在 `createCapabilitiesForPlugin()` 中注入 `usage` 能力（用于显式调用场景）
- [x] 5.6.5 L4 Override 配置 API：读写 Settings `billing.override.{path}`（global scope）— 无需独立 DB 表
- [x] 5.6.6 L2 Module Default 配置 API：读写 Settings `billing.module.{m}.subject`（global scope）
- [x] 5.6.7 Default Policy 配置 API：获取/设置 `billing.defaultUndeclaredPolicy`
- [x] 5.6.8 单元测试：L4 Settings override 优先于 L3 manifest 声明
- [x] 5.6.9 单元测试：L3 manifest 声明的 procedure 自动触发 entitlement 检查
- [x] 5.6.10 单元测试：L2 Module Default 应用于未在 L3 声明的 procedure
- [x] 5.6.11 单元测试：`"free"` 标记的 procedure 跳过所有计费检查
- [x] 5.6.12 单元测试：未声明 procedure 按 Default Policy 处理（allow/deny/audit 三种）
- [x] 5.6.13 单元测试：boolean 类型只做存在性检查，不调用 consume()
- [x] 5.6.14 单元测试：metered 类型自动 consume(1)，余额不足时按 overagePolicy 处理
- [x] 5.6.15 集成测试：四层决策完整链路（L4 → L3 → L2 → Default Policy → EntitlementService）
- [x] 5.6.16 集成测试：插件零代码 → manifest 声明 → 自动计费 → 配额扣减 完整链路

## 5.7. Core 功能计费集成

- [x] 5.7.1 在需要计费的 Core Service 中集成 `entitlementService.requireAndConsume()`（如 ProjectService.create、MediaService.upload、OrganizationService.inviteMember）
- [x] 5.7.2 Core 消耗量按业务逻辑传入（固定 1 或动态值如文件大小 MB）
- [x] 5.7.3 单元测试：Core 功能配额不足时被正确拒绝
- [x] 5.7.4 单元测试：Core 和 Plugin 的 subject 在同一个 Plan 中共存

## 5.8. 消费引擎统一

- [x] 5.8.1 标记 `UsageService` 为 `@deprecated`，添加迁移注释指向 `UnifiedUsageService`
- [x] 5.8.2 排查 `UsageService.consume()` 的所有调用方，逐一迁移到 `UnifiedUsageService.consume()`
- [x] 5.8.3 确保 `EntitlementService` facade 仅委托给 `UnifiedUsageService`，不引用 `UsageService`
- [x] 5.8.4 迁移完成后移除 `UsageService`（或保留为空壳 re-export）

## 6. 支付网关对接（Stripe）

- [x] 6.1 实现 StripePaymentAdapter（基于 payment-adapter.interface.ts）
- [x] 6.2 创建 PaymentIntent / SetupIntent 接口
- [x] 6.3 Webhook 处理器：payment_intent.succeeded → activateSubscription
- [x] 6.4 Webhook 处理器：payment_intent.payment_failed → markPastDue
- [x] 6.5 Webhook 签名验证
- [x] 6.6 Webhook 幂等处理（防重复投递）

## 7. 前端 Admin UI

- [x] 7.1 Plan 管理页面：列表（AutoCrudTable）+ 创建/编辑表单
- [x] 7.2 PlanItem 配置面板：~~capability 选择器~~ → 重构为 `GroupedCheckboxList`，直接从 permission-registry 拉取所有 procedure，支持 billingSubject 分组快捷选中，2列布局 + MeteredConfigDialog 配置
- [x] ~~7.3 Capability 选择器~~ — 已由 7.2 的 GroupedCheckboxList 替代，不再需要独立选择器
- [-] ~~7.4 Capability 审批页面~~ — 已移除。PlanDetail 直接列出所有 procedure，不需要单独审批流程
- [-] ~~7.5 Billing Override 管理页面（L4）~~ — 已移除。用不同 Plan + 可叠加订阅替代 Override 需求
- [-] ~~7.6 Module Default 配置页面（L2）~~ — 已移除。同上
- [-] ~~7.7 Default Policy 配置~~ — 已移除。随 Advanced Settings 页一起清理
- [x] 7.8 订阅管理页面：当前活跃订阅列表、状态、操作（取消/变更）
- [-] ~~7.9 租户配额仪表盘~~ — 已移除。后端计量逻辑未实现，将来可嵌入 Subscription 详情
- [-] ~~7.10 管理员赠送配额对话框~~ — 已移除。同上
- [x] 7.11 添加菜单项：Settings > Billing（~~6项~~ → 精简为 Plans + Subscriptions 两项）

## 8. 事件与审计

- [x] 8.1 发布订阅事件：subscription.created / activated / renewed / canceled / expired / plan_changed
- [x] 8.2 发布配额事件：quota.granted / reset / depleted
- [x] 8.3 审计日志：所有计费操作记录到 audit_log

## 9. 测试

- [x] 9.1 SubscriptionService 单元测试：生命周期状态机
- [x] 9.2 配额发放与重置单元测试：3 种 resetStrategy
- [x] 9.3 UnifiedUsageService 集成测试：瀑布扣减完整流程
- [x] 9.4 并发续费测试：乐观锁防重复
- [x] 9.5 Webhook 幂等测试
- [x] 9.6 Plan 软删除测试：有活跃订阅时阻止
- [x] 9.7 E2E 测试：订阅→支付→激活→用量消耗→续费→取消 全链路

## 10. 文档

- [x] 10.1 更新 billing.ts router 的 API 文档注释
- [x] 10.2 添加套餐配置操作指南（Admin 使用说明）
- [x] 10.3 添加 Stripe Webhook 配置指南
- [x] 10.4 更新 CLAUDE.md Quick Reference（计费相关）
