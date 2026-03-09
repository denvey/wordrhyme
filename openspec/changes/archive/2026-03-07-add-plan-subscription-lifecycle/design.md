## Context

计费系统架构已冻结（ENTITLEMENT_SYSTEM.md、CAPABILITY_BILLING_MODEL.md），核心数据模型和运行时流程已定义。后端已有服务骨架但未串联完整流程。本提案基于已批准的 `docs/plans/2026-01-14-membership-subscription-design.md` 实施。

### 现有资产

| 组件 | 文件 | 状态 |
|------|------|------|
| SubscriptionService | `billing/services/subscription.service.ts` | 骨架已有 |
| UnifiedUsageService | `billing/services/unified-usage.service.ts` | 瀑布扣减已实现 |
| RenewalService | `billing/services/renewal.service.ts` | 骨架已有 |
| QuotaService | `billing/services/quota.service.ts` | 基础 CRUD 已有 |
| WalletService | `billing/services/wallet.service.ts` | 已实现 |
| PaymentService | `billing/services/payment.service.ts` | 适配器接口已定义 |
| billing.ts router | `trpc/routers/billing.ts` | Plan CRUD schema 已定义 |
| SubscriptionRepo | `billing/repos/subscription.repo.ts` | 乐观锁已实现 |
| TenantQuotaRepo | `billing/repos/tenant-quota.repo.ts` | 行级锁已实现 |

### 约束

- 遵循 ENTITLEMENT_SYSTEM.md 的运行时流程（实现层顺序调整见 Decision 6）
- 遵循 CAPABILITY_BILLING_MODEL.md 的角色边界（插件零定价权 → 零代码计费见 Decision 7）
- `usage_records` 只追加，不可 UPDATE/DELETE
- 多租户隔离：跨租户污染视为 P0 Bug
- 支付网关通过适配器模式接入（本期实现 Stripe）

## Goals

1. Plan + PlanItem CRUD 全流程可配置（含用量限制、超额策略、重置策略）
2. 订阅生命周期 API 完整（创建→试用→激活→续费→取消→升降级→过期）
3. 配额自动发放和重置（订阅激活/续费时按 PlanItem 配置操作）
4. Admin UI 可管理套餐、查看订阅、手动赠送配额
5. Stripe Webhook 基础对接（payment_intent.succeeded → 激活订阅）
6. EntitlementService 门面统一编排运行时流程
7. 插件计费零代码透明化（manifest 声明 + 自动 middleware）

## Non-Goals

- Marketplace 插件分成（后续提案）
- 多支付网关并行（本期仅 Stripe，其他通过适配器扩展）
- 发票生成和税务计算
- 用户自助升降级前端页面（本期仅 Admin 管理）
- 优惠券/折扣系统

## Decisions

### 1. 配额发放时机

**决策**：订阅激活时同步发放，续费时按重置策略处理。

**替代方案**：
- 异步队列发放 — 增加复杂度，首期无需
- 惰性发放（首次使用时） — 违反 ENTITLEMENT_SYSTEM 的预加载原则

### 2. 套餐变更策略

**决策**：升级即时生效（按比例退款），降级周期末生效。

**理由**：符合主流 SaaS 实践，用户升级应立即获得更多能力。

### 3. PlanItem 重置策略存储

**决策**：存储在 `plan_items` 表的 `resetStrategy` 字段。

**选项**：hard（删旧发新）、soft（余额累加）、capped（累加但封顶）。

### 4. 前端实现

**决策**：使用 auto-crud 模式管理 Plan，自定义页面管理 PlanItem 配置。

**理由**：Plan 本身是标准 CRUD，PlanItem 需要 capability 选择器等自定义交互。

### 5. 多 Plan 叠加配额聚合

**决策**：同一 featureKey 的多个配额桶独立存在，扣减时按优先级瀑布式消耗，不做 max/sum 聚合。

**理由**：
- 现有 `UnifiedUsageService` 已实现瀑布扣减（priority DESC → expiresAt ASC），每个桶独立扣减
- `tenant_quotas` 的唯一约束 `(organizationId, featureKey, sourceType, sourceId)` 保证同一 Plan 对同一 feature 只有一个桶
- 多 Plan 订阅时，各 Plan 各自发放独立桶，扣减按优先级顺序消耗
- 不需要额外的 max/sum 聚合逻辑，瀑布模型天然支持

**替代方案**：
- max 聚合（取最大值） — 浪费低级 Plan 的配额，且需额外聚合逻辑
- sum 聚合（求和） — 即当前瀑布模型的等价效果（所有桶最终都可被消耗）

### 6. Entitlement 运行时步骤顺序

**决策**：Permission Check (RBAC) 在 Load Entitlements 之前执行。

**理由**：
- RBAC 检查是 O(1) 内存操作（缓存的 CASL 规则），Load Entitlements 需要 DB 查询
- 两者正交（RBAC = 用户授权，Entitlement = 组织付费），无语义依赖
- 便宜的检查先执行，快速拒绝无权用户，避免无意义的 DB 查询

**与治理文档的差异**：ENTITLEMENT_SYSTEM.md 的概念模型将 Load Entitlements 排在 Permission Check 前面。此处的调整是实现层的性能优化，不违反语义约束。

### 7. 插件计费零代码透明化

**决策**：通过 manifest 声明 + 全局 tRPC middleware 实现，插件代码不写任何计费逻辑。

**机制**：
- manifest 新增 `capabilities.billing.procedures` 映射（procedure → featureKey）
- 全局 middleware 在插件 procedure pipeline 上自动拦截，按 planItem.type 决策：
  - `boolean`：只做存在性检查（有活跃桶且未过期 → 放行）
  - `metered`：检查配额 + consume(1)
- 需要动态消耗量的场景（如 token 数、文件大小），插件可选择显式调用 `ctx.usage.consume()`

**替代方案**：
- 包裹 router（wrappedRouter） — tRPC router 是 immutable 的，build 后无法修改 procedure
- 要求插件手写 `require()` + `consume()` — 违反 CAPABILITY_BILLING_MODEL 的"插件零定价权"精神

### 8. EntitlementService 门面模式

**决策**：创建 `EntitlementService` 作为 facade，编排运行时 5 步流程，委托给已有服务。

**委托关系**：
- Permission Check → `PermissionKernel.require()`
- Load Entitlements → `TenantQuotaRepo.getActiveByFeatureKey()`
- Usage Validation + Consume → `UnifiedUsageService.consume()`

**理由**：现有组件已覆盖所有能力，只需一个统一入口编排顺序。避免重复实现。

### 9. Capability 身份模型

**决策**：Capability 是抽象标识符（**subject**），不是路由。路由和 capability 之间通过映射配置关联。

**术语对齐**：使用 `subject` 替代原来的 `featureKey`，与 `refactor-infra-policy-path-driven` 的三系统统一治理模型（RBAC + Billing + Infra Policy 共用 `subject`）保持一致。RBAC 中 `subject` = 权限分组，Billing 中 `subject` = 配额桶标识。两者格式相同（如 `core.storage`），可共享 `meta.subject`，分叉时用 `meta.permission.subject` / `meta.billing.subject` 独立覆盖。

**理由**：
- 一个 subject 可能被多个路由消耗（如 `core.storage` 被 uploadFile/uploadAvatar/importMedia 共享）
- 一个路由可以不消耗任何 subject（免费 procedure）
- 路由是 API 入口，subject 是计费维度，两者正交
- 映射配置由 manifest（插件）或代码（Core）指定，计费系统只认 subject

**capability 注册来源**：
- 插件：manifest `capabilities[]` 声明，Core 启动时扫描收集
- Core：seed/config 注册（`core.teamMembers`、`core.storage`、`core.projects` 等）

### 10. Core 功能计费

**决策**：Core 功能与插件共享同一套配额基础设施（tenant_quotas、瀑布扣减、overagePolicy），仅调用方式不同。

**差异对比**：

| 维度 | 插件 | Core |
|------|------|------|
| 映射声明 | manifest `billing.procedures` | 无需声明 |
| 运行时调用 | 全局 tRPC middleware 自动拦截 | Service 层显式调用 `entitlementService.requireAndConsume()` |
| 开发者感知 | 零代码 | 一行代码 |
| featureKey 命名空间 | `{pluginId}.*` | `core.*` |

**Core 不能自动拦截的原因**：Core 的计费点分散在各 Service 中（createProject、inviteMember、uploadFile...），不像插件有统一的 `pluginApis.xxx` 入口。且 Core 的消耗量往往是动态的（文件大小、token 数），需要在业务逻辑中传入具体 amount。

### 11. 插件 billing middleware 挂载策略

**决策**：在 `registerPluginRouter()` 时以 host-side wrapper 方式挂载，而非在 `procedureBase` 上挂载。

**理由**：
- `pluginProcedure` 使用独立的 `initTRPC` 实例（`packages/plugin/src/trpc.ts:9`），与 host 的 `procedureBase` 完全隔离
- 挂载在 `procedureBase` 上的 middleware 无法触达插件 procedure
- 在 `registerPluginRouter()` 将插件 router 合并到 `pluginApis` 命名空间时，注入 host-side billing wrapper
- `context.ts` 已有 `extractPluginIdFromPath()` 检测插件请求 + 加载 manifest 的完整基础设施

**替代方案**：
- 修改 `pluginProcedure` 注入 host middleware — 破坏插件 SDK 隔离性，违反 PLUGIN_CONTRACT
- 要求插件显式使用 host 提供的 procedure — 增加插件开发者负担，违反零代码目标

### 12. subject 命名空间强制隔离

**决策**：通过注册时校验强制命名空间规则，防止 subject 冲突。

**规则**：
- `core.*` 保留给 Core，来源为 plugin 时拒绝注册
- 插件 subject 必须以 `{pluginId}.*` 为前缀
- 重复 subject 注册报错（DB 唯一约束）

**理由**：
- subject 是全局唯一标识符，冲突会导致计费错乱
- 命名空间隔离与 permission 命名规范（`plugin:{pluginId}:{action}`）保持一致
- 注册时校验比运行时检查更安全（fail-fast）

### 13. 消费引擎统一

**决策**：废弃 `UsageService`（仅操作 `userQuotas`），统一使用 `UnifiedUsageService`（操作 `tenantQuotas` + `userQuotas`）。

**理由**：
- 两个引擎并存会导致语义漂移：`UsageService.consume()` 只扣 user 桶，`UnifiedUsageService.consume()` 按瀑布扣减
- EntitlementService facade 只委托给 `UnifiedUsageService`，保持单一消费路径
- 渐进式迁移：先标记 `UsageService` 为 `@deprecated`，逐步替换调用方

### 14. 四层 Capability 控制模型

**决策**：采用四层优先级链（L4 Admin Override > L3 Developer Declaration > L2 Module Default > Default Policy）+ L1 合法性约束层，确保平台对商业模型的完全控制权。

**核心原则**：插件在结构上就无法破坏平台的商业模型。

**四层架构**（对齐 `refactor-infra-policy-path-driven` 三系统统一治理模型）：

| 层级 | 数据源 | 优先级 | 职责 |
|------|--------|--------|------|
| L4 Admin Override | Settings `billing.override.{path}` (global scope) | 最高 | 平台管理员运行时重映射，无需重启 |
| L3 Developer Declaration | manifest `billing.procedures` | 高 | 插件开发者声明映射 |
| L2 Module Default | Settings `billing.module.{m}.subject` (global scope) | 中 | 管理员配置模块级默认，所有 procedure 继承 |
| Default Policy | Settings `billing.defaultUndeclaredPolicy` | 最低 | 兜底：allow/deny/audit |
| **L1 合法性约束** | `capabilities` 表（status 字段） | — | 验证 subject 已注册且 approved（不参与优先级） |

**Resolution 优先级链**：
```
L4 billing.override.{path}
  > L3 manifest billing.procedures
  > L2 billing.module.{m}.subject
  > Default Policy (billing.defaultUndeclaredPolicy)
  → L1 校验：subject 必须在 capabilities 表中 approved
```

**L4 Settings key 格式**：`billing.override.pluginApis.{pluginId}.{procedureName}` (global scope)
- 与 RBAC 的 `rbac.override.{path}` 完全对称
- 无需 DB 表，SettingsService 直接支持，读写即生效

**L2 Module Default key 格式**：`billing.module.{pluginId}.subject` (global scope)
- 与 Infra Policy 的 `infra.policy.{m}` 完全对称
- 一次配置，模块下所有未被 L3/L4 覆盖的 procedure 自动继承

**理由**：
- L1 提供平台对 capability 生命周期的完全控制（pending → approved → rejected）
- L2 Module Default 大幅减少配置量（一个模块只需配一次，而非每个 procedure）
- L3 保持插件开发者零代码体验（manifest 声明即可）
- L4 让平台在不修改插件代码/manifest 的情况下运行时重映射计费
- Settings-based L2/L4 与 RBAC 和 Infra Policy 三系统同构，共享统一的 Admin UI 和缓存失效机制

**替代方案**：
- 仅 L3（manifest 声明）— 平台无法覆盖插件的计费行为，且每个 procedure 都需单独声明
- L4 用 DB 表存储 — 破坏三系统同构性，需额外 DDL，Settings 已足够（含 TTL 缓存 + 主动失效）
- 路由即 capability（1:1 映射）— 丧失多路由共享 subject 的灵活性，见 Decision 9

### 15. 未声明 procedure 的 Default Policy

**决策**：对未在 L2/L3/L4 中命中的 procedure，按平台级 Default Policy（Settings `billing.defaultUndeclaredPolicy`）处理。

**可选策略**：
- `allow`：未声明的 procedure 免费通过（开发友好，不推荐生产环境）
- `deny`：未声明的 procedure 被阻断（最严格，防止漏网免费使用）
- `audit`：未声明的 procedure 放行但记录审计日志供管理员审查（**推荐默认值**）

**与 RBAC Default Policy 对齐**（来自 `refactor-infra-policy-path-driven`）：
| 策略 | Billing | RBAC |
|------|---------|------|
| `audit` | 放行但记审计日志 | 放行但记日志，推荐默认 |
| `deny` | 阻断未声明的 procedure | 阻断无权限声明的 procedure |
| `allow` | 放行（不推荐生产） | 放行（不推荐生产） |

**理由**：`audit` 作为默认值平衡了安全性和开发体验。生产环境可切换为 `deny`，开发环境可切换为 `allow`。

**替代方案**：
- 硬编码为 deny — 插件新增 procedure 必须同步更新 manifest，增加开发摩擦
- 硬编码为 allow — 插件可能忘记声明 procedure 导致永久免费使用，存在商业风险

### 16. Capability 状态审批工作流

**决策**：插件注册的 capability 需经平台管理员审批后才能用于 PlanItem 配置。

**状态机**：
```
plugin 声明 → auto-register(pending) → admin 审批(approved) → 可用于 PlanItem
                                      → admin 拒绝(rejected) → 不可用
```

**规则**：
- Core capability seed 时直接为 `approved`（信任源）
- Plugin capability 自动注册为 `pending`
- `plan_items.featureKey` FK 仅允许引用 `status = 'approved'` 的 capability
- 已被 PlanItem 引用的 capability 不可设为 `rejected`（需先移除 PlanItem 引用）

**理由**：
- 平台保留对"什么能力可以收费"的最终决定权
- 防止插件自动注册的 capability 未经审查就进入套餐配置
- 审批流程为平台管理员提供了 capability 质量控制的机会

**替代方案**：
- 自动 approved — 任何插件声明的 capability 立即可用于 PlanItem，平台失去审查机会
- 不存储 status — 通过独立的"已启用"表管理，增加表数量和查询复杂度

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 并发续费导致重复扣费 | 乐观锁（version 字段）+ 幂等键 |
| 配额重复发放 | sourceId 唯一约束（`uq_tenant_quotas_source`） |
| Webhook 丢失 | 重试队列 + 手动对账接口 |
| 配额超扣 | 事务 + 行级锁（FOR UPDATE） |
| Plan 删除但有活跃订阅 | 软删除策略，阻止硬删除 |
| 插件 middleware 链路断裂 | host-side wrapper 在 `registerPluginRouter()` 层注入（Decision 11） |
| subject 命名冲突 | 注册时命名空间校验 + DB 唯一约束（Decision 12） |
| 双消费引擎语义漂移 | 废弃 UsageService，统一 UnifiedUsageService（Decision 13） |
| Core 显式调用遗漏 | lint 规则扫描 + 代码审查，逐步覆盖核心 Service |
| 未声明 procedure 漏网免费使用 | Default Policy 默认 `audit`，审计日志提醒管理员（Decision 15） |
| L4 覆盖与 L3 声明不一致导致混淆 | Admin UI 显示当前生效的映射来源（L2/L3/L4），覆盖记录可追溯 |
| 插件 capability 未审批即被使用 | `plan_items.subject` FK 仅引用 `approved` 状态（Decision 16） |

## Migration Plan

1. 创建 `capabilities` 表（subject(PK), type, unit, description, source, pluginId, **status**, createdAt）— 新表无兼容风险
2. 重命名 `plan_items.featureKey` → `plan_items.subject`（含 FK 约束更新）— 需 Drizzle 迁移
3. 添加 `plan_items` 新字段 `overagePolicy`（text, default 'deny'）— 向后兼容
4. 确认 `plan_items` 已有字段无需迁移：`resetStrategy`、`resetCap`、`quotaScope`（已在 schema 中定义）
5. 确认 `plan_subscriptions` 和 `tenant_quotas` 表已创建（由现有迁移覆盖）
6. 初始化 Settings keys（通过 seed 脚本）：
   - `billing.defaultUndeclaredPolicy = 'audit'`（平台级 Default Policy）
   - `billing.module.{m}.subject`（各模块默认 subject，可后续由管理员配置）
7. 迁移现有 membership 类型的 userQuotas → tenantQuotas（按设计文档脚本）
8. 标记 `UsageService` 为 `@deprecated`，迁移调用方至 `UnifiedUsageService`
9. 回滚方案：字段添加可 revert，新表可 drop，Settings key 可删除

## Open Questions

1. 试用期是否需要独立的配额策略（还是共享正式配额）？
2. 是否支持"加量包"一次性购买（不影响月配额重置）？
3. ~~多 Plan 叠加时 limit 取 max 还是 sum？~~ → 已决策：瀑布模型，独立桶按优先级消耗（见 Decision 5）
