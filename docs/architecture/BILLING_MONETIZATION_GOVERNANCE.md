# BILLING_MONETIZATION_GOVERNANCE.md

> 本文档定义 WordRhyme 中 **计费、分成、支付、订阅、插件收费** 的治理边界.
>
> 本文是**治理宪法级文档**，不是支付实现说明。

---

## 1. 文档定位

* 上位约束：`SYSTEM_INVARIANTS.md`
* 同级治理：

  * `PERMISSION_GOVERNANCE.md`
  * `PLUGIN_CONTRACT.md`
  * `RUNTIME_GOVERNANCE.md`
  * `EVENT_HOOK_GOVERNANCE.md`
* 下游实现文档（不在本文件）：

  * Billing API
  * Subscription Engine
  * Revenue Share Engine

---

## 2. 核心不变量（Monetization Invariants）

### 2.1 计费权唯一性

**所有收费、扣费、结算行为：**

* ✅ 只能由 **Core Billing Service** 发起
* ❌ 插件、Hook、Runtime **无任何收费权限**

> 插件不能“卖东西”，只能被平台代售。

---

### 2.2 金流绝对不可插件化

以下行为 **永远禁止插件参与**：

* 直接调用支付网关（Stripe / PayPal / Adyen 等）
* 处理用户支付凭证
* 修改订单金额
* 绕过平台抽成

> 金流 ≠ 扩展点

---

### 2.3 插件只能声明「商业意图」

插件可以：

* 声明：

  * 是否收费
  * 收费模式（订阅 / 一次性 / 用量）
  * 定价建议

插件不能：

* 决定最终价格
* 决定是否扣费
* 决定退款规则

**最终裁决权始终在 Core。**

---

## 3. 收费模型治理

### 3.1 支持的收费模型（白名单）

Core 可支持的模型包括但不限于：

* 免费（Free）
* 一次性购买（One-time Purchase）
* 周期订阅（Monthly / Yearly）
* 用量计费（Usage-based）

> 插件只能从白名单中选择，不能自定义模型。

---

### 3.2 Workspace / Tenant 级别计费

* 所有计费必须绑定到：

  * Workspace / Organization
  * 或 Platform Account

禁止行为：

* 对单个 User 直接收费（除非 Core 明确支持）
* 绕过 Workspace 权限体系

---

## 4. 插件分成治理（Revenue Share Governance）

### 4.1 平台主权

* 平台拥有 **最终分成规则制定权**
* 分成比例：

  * 可按插件
  * 可按开发者等级
  * 可按市场阶段调整

插件作者：

* ❌ 无权自行定制分成比例
* ❌ 无权私下收费

---

### 4.2 插件代码与收益解耦

* 插件 **不感知具体收入金额**
* 插件只能接收到：

  * 是否已授权
  * 当前订阅状态（active / expired）

> 插件“知道能不能用”，但不知道赚了多少钱。

---

## 5. SaaS 与开源模式共存治理

### 5.1 开源自托管（Self-hosted）

* Core 默认：

  * 不强制启用收费
  * 不强制连接 Marketplace

插件作者可以选择：

* 开源插件（完全免费）
* 商业插件（需 Marketplace 授权）

---

### 5.2 SaaS 托管模式

在官方 SaaS 环境中：

* Marketplace 默认启用
* 商业插件必须通过平台计费
* 平台自动处理：

  * 税务
  * 发票
  * 分账

---

## 6. 插件授权与运行时关系

* Runtime 只能：

  * 查询授权状态
  * 强制执行授权结果

Runtime **不能**：

* 推导收费逻辑
* 决定授权是否合法

> Runtime 是执行者，不是财务系统。

---

## 7. 违规与制裁

若插件尝试：

* 绕过 Billing Service
* 伪造授权状态
* 私下收费或泄露支付信息

平台可以：

* 立即下架插件
* 冻结插件收益
* 封禁开发者账号

无需插件作者同意。

---

## 8. 冻结声明（Freeze Declaration）

自本文件冻结后：

* 所有计费能力必须走 Core Billing
* 插件商业能力只能通过声明 + 授权验证实现
* 金流永不插件化

> **赚钱的自由永远小于系统的安全。**

---

## 9. 文档状态

* Status: **Frozen**
* Change Policy: Only via Core Governance Review
* Scope: Core / Plugin / Marketplace / SaaS
