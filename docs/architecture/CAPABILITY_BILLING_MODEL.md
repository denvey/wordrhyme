好，我直接给你一份 **可落库、可执行、可约束实现的正式文档**。
这份文档**不是卖插件的收费**，而是你刚才强调的：
👉 **插件安装后，宿主系统如何对 C 端用户收费，并且支持跨插件组合套餐。**

---

# CAPABILITY_BILLING_MODEL.md

## Nebula CMS 能力计费与套餐组合契约（v1.0）

> 本文档定义 **Nebula CMS 中“对终端用户收费”的统一能力计费模型**。
>
> 目标：
>
> * 支持 **跨插件组合套餐**
> * 支持 **按月 / 按量 / 无限 / 超额**
> * 避免插件各自实现收费逻辑
> * 为开源 + SaaS 双模式打下长期稳定基础

---

## 0. 核心结论（必须先冻结）

> **插件永远不直接面向“钱”。
> 插件只声明能力（Capability）。
> 所有收费、套餐、组合、计量、结算，统一由 Nebula Core 执行。**

这是 **不可协商（Non-Negotiable）原则**。

---

## 1. 角色与职责边界（极重要）

| 角色                   | 职责               |
| -------------------- | ---------------- |
| 插件开发者                | 声明能力（Capability） |
| 插件安装者（站点 / SaaS 管理员） | 组合套餐（Plan）       |
| 终端用户（C 端）            | 消费能力             |
| Nebula Core          | 权限校验、计量、结算、限制    |

---

## 2. 核心抽象总览（先看全局）

```text
Plugin
  └── Capability（能力声明）

Nebula Core
  ├── Plan（套餐）
  ├── Entitlement（授权）
  ├── Usage / Metering（计量）
  └── Billing Engine（结算执行）

End User
  └── Consumes Capability
```

---

## 3. Capability Contract（插件能力契约）

### 3.1 Capability 定义

Capability 是 **插件对外暴露的最小可计费单元**。

```yaml
capabilities:
  - id: pluginA.use
    type: boolean
    description: Enable Plugin A features

  - id: pluginC.request
    type: metered
    unit: request
    description: AI API calls
```

### 3.2 Capability 类型

| 类型      | 说明                 |
| ------- | ------------------ |
| boolean | 有 / 无              |
| metered | 按量消耗               |
| quota   | 固定额度（语义等同 metered） |

---

### 3.3 插件允许的行为（唯一）

插件 **只能**：

```ts
permission.require("pluginC.request")
usage.consume("pluginC.request", 1)
```

插件 **不能**：

* 定价
* 判断套餐等级
* 创建订阅
* 对接支付网关

---

## 4. Plan Contract（套餐模型）

### 4.1 Plan 的归属

> **Plan 永远属于宿主系统（站点 / SaaS），不属于插件。**

同一个插件：

* 不同站点 → 不同套餐
* 不同国家 → 不同价格
* 不同 SaaS → 不同商业模式

---

### 4.2 Plan 定义示例（你给的场景）

```yaml
plans:
  - id: level_1
    name: Basic
    price: 10/month
    grants:
      - pluginA.use
      - pluginB.use

  - id: level_2
    name: Pro
    price: 20/month
    grants:
      - pluginA.use
      - pluginB.use
      - pluginC.request: 100

  - id: level_3
    name: Enterprise
    price: 30/month
    grants:
      - pluginA.use
      - pluginB.use
      - pluginC.request: unlimited
```

---

## 5. Entitlement Contract（授权模型）

### 5.1 定义

Entitlement 是 **某个用户当前真实可用的能力状态**。

```ts
Entitlement {
  capability: "pluginC.request"
  limit: 100 | "unlimited"
  used: number
  resetAt?: timestamp
}
```

---

### 5.2 Entitlement 生成规则

* 用户订阅 Plan
* Plan grants → 生成 Entitlement
* 升级 / 降级 → Entitlement 重算
* 周期到期 → used 清零（如配置）

---

## 6. Metering Contract（统一计量）

### 6.1 唯一计量入口

```ts
usage.consume(capabilityId, amount)
```

> 插件 **禁止** 自行记录用量。

---

### 6.2 核心判断逻辑（由 Core 执行）

```text
1. 是否有 Entitlement？
2. 是否已超限？
3. 超限策略是什么？
```

---

### 6.3 超限策略（必须内置）

| 策略        | 行为   |
| --------- | ---- |
| deny      | 拒绝请求 |
| throttle  | 限流   |
| charge    | 超额计费 |
| downgrade | 降级能力 |

---

## 7. 超额计费模型（Advanced，但必须预留）

```yaml
overage:
  capability: pluginC.request
  price: 0.01 / request
```

⚠️ 插件依然 **不知道这件事存在**。

---

## 8. 组合能力规则（关键价值点）

Nebula 必须支持：

* 一个 Plan → 多插件
* 一个 Capability → 多 Plan
* 多 Capability → 一个价格

这是 Nebula **平台化的根本能力**。

---

## 9. 插件禁止收费清单（Hard Ban）

插件 **明确禁止**：

* ❌ 创建 Subscription
* ❌ 直接接 Stripe / PayPal
* ❌ 向终端用户展示价格
* ❌ 判断用户等级
* ❌ 自行限制用量

---

## 10. 开源 & SaaS 双模式兼容性

### 10.1 开源模式

* Plan / Billing Engine 可为：

  * 本地实现
  * 简化实现
  * 第三方接管

### 10.2 SaaS 模式

* 官方 Billing Engine
* 插件市场分成
* 企业级审计

👉 **能力模型完全一致**

---

## 11. 与 Plugin Marketplace 的关系（重要）

* Marketplace **不定义终端用户价格**
* Marketplace 只定义：

  * 插件 license
  * 插件安装权限
* 终端用户收费 = Host 决策

---

## 12. 设计定位总结（请记住这句话）

> **Plugins define what is possible.
> Hosts decide what is paid.
> Nebula enforces the rules.**

---

## 13. 非目标（Explicit Non-Goals）

Nebula 不负责：

* 插件作者的商业模式
* 插件作者的定价策略
* 插件内部 SaaS

---

## 14. 演进策略

* 新 Capability：可新增
* 旧 Capability：不可破坏
* Billing Engine：可替换
* 插件：零感知升级

---
