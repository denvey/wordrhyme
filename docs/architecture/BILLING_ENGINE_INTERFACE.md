# BILLING_ENGINE_INTERFACE.md

## Nebula CMS 计费引擎接口与职责边界（v1.0）

> 本文档定义 **Nebula CMS 中 Billing Engine 的职责、输入输出与不可越界规则**。
>
> Billing Engine 是：
>
> * **数据消费者**
> * **账务生成器**
> * **支付协调者**
>
> ❌ **不是权限系统**
> ❌ **不是能力控制者**
> ❌ **不是插件 API**

---

## 0. Billing 的定位（必须牢记）

> **Billing 永远不能“决定”用户能不能用功能，
> 它只能“结算”已经发生的用量。**

功能是否可用，只由：

* Permission
* Entitlement
* Runtime Flow
  决定。

---

## 1. Billing Engine 的唯一输入

Billing **只能读取**以下数据源：

```text
- plans
- plan_grants
- plan_subscriptions
- usage_records
- entitlements（只读）
```

Billing **严禁**：

* 写 entitlements
* 修改 usage_records
* 控制 permission.require

---

## 2. Billing Engine 的核心职责

### 2.1 账单生成（Invoicing）

```text
UsageRecords
  ↓
Pricing Rules
  ↓
Billing Ledger
  ↓
Invoice
```

---

### 2.2 超额计费（Overage）

Overage 来源 **只可能**是：

```text
PlanGrant.overage_policy === "charge"
```

Billing 不得自行判断是否允许超额。

---

### 2.3 周期结算（Settlement）

支持周期：

* Monthly
* Yearly
* Custom（企业）

---

## 3. Billing Engine 不得参与的事务（Hard Ban）

Billing Engine **不得**：

* 判断 capability 是否可用
* 阻断 Runtime Flow
* 调用插件逻辑
* 直接操作用户权限

⚠️ **即使账单失败，Runtime Flow 也不能立即被破坏**
（应通过状态同步而非即时阻断）

---

## 4. Billing 状态与系统联动

Billing 只能通过**状态信号**影响系统：

```ts
BillingStatus =
  | "active"
  | "past_due"
  | "suspended"
  | "canceled"
```

这些状态**不会立刻改变权限**，而是：

```text
Billing Status
  ↓
Policy Engine
  ↓
Entitlement Adjustment
```

---

## 5. Billing → Core 的唯一回调方式

```ts
onBillingStatusChanged(tenantId, status)
```

Core 决定：

* 是否降级
* 是否冻结
* 是否宽限期

Billing **无权直接执行**。

---

## 6. 定价规则（Pricing Rules）归属

> **定价规则属于商业层，不属于插件，也不属于 Core。**

```ts
PricingRule {
  capability_id
  unit_price
  currency
  effective_period
}
```

* 同一 capability 可：

  * 不同国家不同价
  * 不同套餐不同价
* 插件永远不可见

---

## 7. 多插件组合计费（关键能力）

Billing 必须支持：

* 多 capability 聚合
* 同一账单内多插件来源
* 单一发票（Single Invoice）

```text
Invoice
 ├── pluginA.use
 ├── pluginB.use
 └── pluginC.request (overage)
```

---

## 8. Billing Engine 与支付网关的关系

```text
Nebula Billing Engine
  └── Stripe / PayPal / Paddle / 自定义
```

支付网关：

* 只是执行收款
* 不理解 capability
* 不理解插件

---

## 9. 开源模式下的 Billing 行为

| 能力              | 开源  |
| --------------- | --- |
| UsageRecord     | 必须  |
| BillingLedger   | 可选  |
| Payment Gateway | 可关闭 |
| Invoicing       | 可禁用 |

⚠️ **数据结构必须存在，行为可禁用**

---

## 10. 插件相关的 Billing 禁令（非常重要）

插件 **禁止**：

* 自己创建订阅
* 自己定义价格
* 自己计算账单
* 自己触发支付

插件唯一允许的行为：

```ts
usage.consume(capability, amount)
```

---

## 11. Billing 失败语义（统一）

| 场景   | 行为           |
| ---- | ------------ |
| 支付失败 | 标记 past_due  |
| 多次失败 | 标记 suspended |
| 账单异常 | 不影响 Runtime  |
| 恢复支付 | 状态回滚         |

---

## 12. 与 Runtime / Entitlement 的关系（再冻结一次）

```text
Runtime 决定「能不能用」
Billing 决定「要不要付钱」
```

这两者 **永远不能互相调用**。

---

## 13. 架构级总结（这是平台能力）

> **Nebula 的计费系统不是“卖插件”，
> 而是“对能力定价”。**

一旦冻结这层：

* 插件市场自然成立
* SaaS 商业模型无限扩展
* 插件作者不再造轮子

---

## 14. 最终冻结声明

> 从 v1.0 起：
>
> * 插件无法碰钱
> * 钱无法碰插件
> * 能力是唯一纽带

---

