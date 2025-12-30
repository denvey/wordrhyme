# ENTITLEMENT_SYSTEM.md

## WordRhyme 能力授权与计量系统（v1.0）

> 本文档定义 **WordRhyme 的授权（Entitlement）与计量（Metering）完整系统**。
>
> 包含：数据模型、运行时流程、校验规则。
>
> 该系统对 **Core、Plugin、Billing、Permission** 均具有强约束力。

---

## PART I — 数据模型（Data Model）

### 0. 数据建模第一原则

1. **能力（Capability）不可定价**
2. **套餐（Plan）不绑定插件**
3. **用量（Usage）必须可审计**
4. **所有计费推导必须可回放**

---

### 1. 核心实体总览

```text
Tenant
 ├── PlanSubscription
 │     └── Plan
 │           └── PlanGrant (Capability)
 │
 ├── Entitlement (Runtime Snapshot)
 │
 └── UsageRecord
```

---

### 2. Capability（能力定义）

> 能力是插件对系统暴露的**最小可授权单元**。

```sql
capabilities (
  id TEXT PRIMARY KEY,
  plugin_id TEXT,
  type TEXT, -- boolean | metered
  unit TEXT, -- request | token | seat | action
  description TEXT,
  created_at TIMESTAMP
)
```

**约束**：

* 插件只能 **注册** capability
* 插件不能：定价、限制套餐、控制授权

---

### 3. Plan（套餐）

> Plan 属于 **宿主系统 / SaaS 商业层**。

```sql
plans (
  id TEXT PRIMARY KEY,
  name TEXT,
  billing_cycle TEXT, -- monthly | yearly
  price_cents INT,
  currency TEXT,
  is_active BOOLEAN
)
```

---

### 4. PlanGrant（套餐能力授权）

```sql
plan_grants (
  plan_id TEXT,
  capability_id TEXT,
  limit INT,          -- NULL 表示 unlimited
  overage_policy TEXT, -- deny | charge | throttle
  PRIMARY KEY (plan_id, capability_id)
)
```

**重要语义**：

* 同一 capability 可被多个 Plan 授权
* 同一 Tenant 可拥有多个 Plan

---

### 5. PlanSubscription（订阅关系）

```sql
plan_subscriptions (
  tenant_id TEXT,
  plan_id TEXT,
  status TEXT, -- active | canceled | expired
  started_at TIMESTAMP,
  ends_at TIMESTAMP
)
```

---

### 6. Entitlement（运行时授权快照）

> Entitlement 是 **Runtime 使用的聚合视图**，不是配置表，是计算结果。

```sql
entitlements (
  tenant_id TEXT,
  capability_id TEXT,
  limit INT,
  used INT,
  reset_at TIMESTAMP,
  source TEXT, -- plan | promo | manual
  PRIMARY KEY (tenant_id, capability_id)
)
```

**生成规则**：

* 多 Plan：limit = max / sum（按配置）
* unlimited > number
* used 永远实时更新

---

### 7. UsageRecord（用量记录，审计级）

```sql
usage_records (
  id UUID PRIMARY KEY,
  tenant_id TEXT,
  capability_id TEXT,
  amount INT,
  occurred_at TIMESTAMP,
  request_id TEXT,
  source TEXT -- plugin_id / system
)
```

**强约束**：

* ❌ 不允许 UPDATE
* ❌ 不允许 DELETE
* 只允许 INSERT

---

### 8. BillingLedger（计费账本）

> Billing 永远基于 UsageRecord 推导

```sql
billing_ledger (
  id UUID PRIMARY KEY,
  tenant_id TEXT,
  capability_id TEXT,
  usage_id UUID,
  price_cents INT,
  currency TEXT,
  period TEXT,
  created_at TIMESTAMP
)
```

---

### 9. 重置与周期模型

| Capability 类型 | reset_at |
| ------------- | -------- |
| boolean       | NULL     |
| metered（月）    | 月初       |
| metered（年）    | 年初       |
| trial         | 指定时间     |

---

### 10. 多租户 & 多站点隔离

```text
Tenant A:
  - entitlements A
  - usage A

Tenant B:
  - entitlements B
  - usage B
```

任何跨 Tenant JOIN 必须显式声明。

---

### 11. 插件允许的数据接触边界

| 表             | 插件访问 |
| ------------- | ---- |
| capabilities  | 只读   |
| entitlements  | 只读   |
| usage_records | ❌ 禁止 |
| billing_*     | ❌ 禁止 |

插件 **永远只能通过 API 间接使用数据**。

---

## PART II — 运行时流程（Runtime Flow）

### 0. 运行时第一原则

> **任何插件能力的使用，必须经过统一运行时校验。
> 插件不允许绕过、缓存、替代该流程。**

---

### 1. 运行时涉及的核心对象

```text
Request Context
 ├── Tenant
 ├── End User
 ├── Active Plan(s)
 └── Entitlements
```

---

### 2. 标准运行时调用入口（唯一合法路径）

**插件侧调用（唯一允许方式）**：

```ts
await permission.require("pluginC.request");
await usage.consume("pluginC.request", 1);
```

插件：

* ❌ 不知道套餐
* ❌ 不知道价格
* ❌ 不知道限额
* ✅ 只声明"我要用能力"

---

### 3. Runtime Flow 总览（强制顺序）

```text
1. Resolve Context
2. Load Entitlements
3. Permission Check
4. Usage Validation
5. Consume Usage
6. Execute Capability
```

任何一步失败 → **立即中断请求**

---

### 4. Step-by-Step 运行时流程

**Step 1：Resolve Context（上下文解析）**

```text
- 当前 Tenant
- 当前 End User
- 所属 Workspace / Project（如有）
- 当前时间（用于周期判断）
```

> ⚠️ Context 不可由插件传入，只能由 Core 注入。

---

**Step 2：Load Entitlements（加载授权）**

Entitlement 来源：

* 用户订阅的 Plan
* Plan grants 的 Capability
* 动态叠加规则（试用、赠送、活动）

生成结构：

```ts
Entitlement {
  capability: string
  limit: number | "unlimited"
  used: number
  resetAt?: timestamp
  overagePolicy?: "deny" | "charge" | "throttle"
}
```

---

**Step 3：Permission Check（权限校验）**

```text
IF entitlement does not exist
  → DENY (403)
```

说明：

* boolean capability 在此阶段终止
* metered capability 进入下一步

---

**Step 4：Usage Validation（用量校验）**

```text
IF limit === unlimited
  → PASS

IF used + amount <= limit
  → PASS

IF exceeds limit
  → Apply Overage Policy
```

---

**Step 5：Overage Policy 执行**

| Policy    | 行为      |
| --------- | ------- |
| deny      | 抛出超限错误  |
| throttle  | 限流 / 延迟 |
| charge    | 记录超额用量  |
| downgrade | 降级能力    |

⚠️ 插件 **完全无感知** 该策略存在。

---

**Step 6：Consume Usage（原子计量）**

```ts
used += amount
persist()
```

强制要求：

* 原子性
* 幂等（支持 retry）
* 可审计

---

**Step 7：Execute Capability（能力执行）**

> **只有在所有校验通过后，插件逻辑才允许执行。**

---

### 5. 请求失败语义（统一）

| 场景   | 错误类型            |
| ---- | --------------- |
| 未订阅  | NOT_ENTITLED    |
| 超出限额 | QUOTA_EXCEEDED  |
| 账单异常 | BILLING_BLOCKED |
| 系统异常 | INTERNAL_ERROR  |

插件 **禁止自定义错误码**。

---

### 6. 多 Plan 叠加规则（必须支持）

WordRhyme 必须支持：

* 多个 Plan 同时生效
* Capability 取 **最大授权**
* 限额取：unlimited > 数值、数值可叠加（可配置）

---

### 7. 运行时缓存规则（重要）

允许缓存：

* Entitlement 快照（短 TTL）

禁止缓存：

* Used Usage（必须实时）
* Overage 状态

---

### 8. 多租户隔离保证

```text
Tenant A usage ≠ Tenant B usage
Tenant A plan ≠ Tenant B plan
```

任何跨租户污染视为 **P0 Bug**。

---

### 9. 开源 & SaaS 模式差异

| 模式   | Billing Engine |
| ---- | -------------- |
| 开源   | 可关闭 / 简化       |
| SaaS | 强制启用           |

⚠️ **Runtime Flow 不允许差异化**。

---

### 10. 插件违规行为（Hard Ban）

插件若出现以下行为，必须被标记为 **Unsafe Plugin**：

* 绕过 permission.require
* 本地记录 usage
* 模拟 entitlement
* 直接执行能力逻辑

---

### 11. 与 Runtime Flow 的关系（强绑定）

```text
permission.require
   ↓
entitlements
   ↓
usage.consume
   ↓
usage_records
   ↓
billing_ledger
```

**任何绕过此路径的行为都是系统违规。**

---

## PART III — 集成示例

### 示例 1：插件使用能力

```ts
// 插件代码
async function processRequest() {
  await ctx.permission.require("pluginC.request");
  await ctx.usage.consume("pluginC.request", 1);

  // 能力逻辑
  return processAI();
}
```

---

### 示例 2：多Plan组合

```yaml
# Tenant订阅了 Plan A + Plan B
Plan A:
  - pluginC.request: 100

Plan B:
  - pluginC.request: 50

# 最终Entitlement
Entitlement:
  - pluginC.request: 150 (sum策略)
```

---

## 设计冻结声明

> **任何未来功能（AI、API、Workflow、Automation）都必须通过本 Runtime Flow 执行。**

---

**本文件一经发布，即视为冻结（Frozen）。**
