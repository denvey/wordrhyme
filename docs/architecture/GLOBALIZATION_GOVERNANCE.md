# GLOBALIZATION_READINESS.md

## Nebula CMS 全球化预留设计规范（v1.0）

> 本文档定义 **Nebula CMS 在架构层面对多语言（i18n）、多币种（Multi-Currency）、全球化（Globalization）所做的强约束预留设计**。
>
> 目标：
>
> * **MVP 阶段零实现成本**
> * **未来扩展零数据返工**
> * **插件 / SaaS / 开源模式统一**

---

## 0. Globalization 的架构定位

> **全球化不是功能，而是系统基础属性。**

Nebula 在 v0.x 阶段：

* ❌ 不提供完整全球化功能
* ✅ 必须保证 **任何核心设计不阻塞未来全球化**

---

## 1. 全局第一原则（Non-Negotiable）

### 1.1 不可逆原则

以下三类问题 **一旦晚做 = 必然返工**：

1. 文本语言
2. 金额与币种
3. 时间与区域

Nebula **必须在数据与契约层面一次性解决**。

---

### 1.2 MVP 约束声明

> MVP 阶段：
>
> * 可以只支持一种语言
> * 可以只支持一种币种
> * 可以不接税务 / 区域策略
>
> **但结构必须已经存在。**

---

## 2. 多语言（Internationalization / i18n）

### 2.1 核心原则

> **业务数据 ≠ 展示语言**

任何面向人类阅读的文本：

* 不得假设单一语言
* 不得写死为字符串字段

---

### 2.2 强制推荐数据模式（JSONB）

```sql
*_i18n JSONB
```

示例：

```json
{
  "en": "Pricing Plan",
  "zh-CN": "价格套餐",
  "ja": "料金プラン"
}
```

MVP：

* 只填 `en`
* 但字段必须存在

---

### 2.3 适用范围（必须支持）

以下类型 **必须允许 i18n**：

* Plugin name / description
* Plan name / description
* Capability display name
* Admin UI 文本（插件级）

---

### 2.4 明确禁止的设计（Hard Ban）

❌ `title_en`, `title_zh`
❌ 单一 `name TEXT`
❌ 插件自行定义语言表结构
❌ Core 假设默认语言

---

### 2.5 插件 Contract 影响

插件 Manifest 示例：

```json
{
  "display": {
    "name": {
      "en": "SEO Toolkit",
      "zh-CN": "SEO 工具包"
    }
  }
}
```

插件：

* ❌ 不控制当前语言
* ✅ 提供多语言候选文本

---

## 3. 多币种（Multi-Currency）

### 3.1 核心原则（极重要）

> **金额永远与币种绑定，系统不做隐式换算。**

---

### 3.2 冻结的金额模型

```ts
Money {
  amount: number
  currency: string // ISO 4217
}
```

数据库层：

```sql
price_cents INT
currency TEXT
```

---

### 3.3 Billing / Plan 预留结构

```sql
plan_prices (
  plan_id TEXT,
  currency TEXT,
  price_cents INT,
  PRIMARY KEY (plan_id, currency)
)
```

MVP：

* 只插一条（如 USD）

---

### 3.4 严禁行为（现在就冻结）

❌ Core 自动换汇
❌ 前端计算金额
❌ 插件处理币种
❌ Billing 写死某种货币

---

## 4. 时间、时区与周期（Temporal Globalization）

### 4.1 系统时间标准

> **Nebula 的唯一时间标准是 UTC**

```text
- 数据库存储：UTC
- API 输入输出：UTC
- Runtime 判断：UTC
```

---

### 4.2 展示层责任

* 时区转换：前端 / 客户端
* 本地化格式：UI 层

Core / Plugin：

* ❌ 不感知时区
* ❌ 不存 local time

---

### 4.3 计费与周期对齐

* Billing 周期
* Usage reset
* Subscription 生效时间

**全部基于 UTC**

---

## 5. 税务与地区规则（不实现，但必须预留）

### 5.1 冻结接口（不提供实现）

```ts
TaxProvider {
  calculate(invoice, region): TaxResult
}
```

MVP：

* 默认实现返回 0

---

### 5.2 税不是插件能力

* 插件 ❌ 不参与税计算
* 插件 ❌ 不感知税率
* 税务逻辑永远属于商业层

---

## 6. 区域可用性（Regional Availability）

### 6.1 Capability 区域声明（可选）

```yaml
capability:
  id: ai.call
  availability:
    regions: ["US", "EU"]
```

MVP：

* 不校验
* 但字段合法

---

### 6.2 区域控制的归属

* Region 策略属于：

  * Policy Engine
  * Entitlement 层
* ❌ 插件自行判断区域

---

## 7. 多语言 / 多币种对现有文档的影响

| 文档                          | 影响            |
| --------------------------- | ------------- |
| SYSTEM_INVARIANTS.md        | 数据可全球化        |
| PLUGIN_CONTRACT.md          | 插件不可假设语言 / 币种 |
| ENTITLEMENT_DATA_MODEL.md   | Money 模型      |
| BILLING_ENGINE_INTERFACE.md | 多币种账单         |
| CORE_DOMAIN_CONTRACT.md     | UTC 时间        |

---

## 8. 开源 vs SaaS 一致性声明

> **Globalization 结构在两种模式下必须完全一致。**

| 项目             | 开源 | SaaS |
| -------------- | -- | ---- |
| i18n 字段        | 必须 | 必须   |
| Multi-Currency | 必须 | 必须   |
| Tax 接口         | 存在 | 存在   |

---

## 9. 常见反模式（明确写给未来的自己）

❌ “等国际化再说”
❌ “先写死 USD / en”
❌ “插件自己解决语言”
❌ “等有海外用户再改”

---

## 10. 最终冻结声明（非常重要）

> 从 v0.1 起：
>
> * 所有文本 **必须允许 i18n**
> * 所有金额 **必须携带 currency**
> * 所有时间 **必须是 UTC**
>
> **违反即视为架构缺陷。**

---

