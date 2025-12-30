# Globalization Governance

> 本文定义 WordRhyme 在 **多语言（i18n） / 多币种（multi-currency） / 全球化（global-ready）** 方面的系统级治理原则。
>
> 目标不是立即实现全部能力，而是 **冻结不可变的设计前提（Invariants）**，确保 MVP 之后不会出现结构性返工。

---

## 1. Globalization 的系统定位

Globalization 是 **系统级横切能力（Cross-Cutting Concern）**，其优先级：

> **System > Domain > Plugin > Feature**

因此：

* ❌ 不允许由单个插件“自行实现一套 i18n / currency”
* ❌ 不允许插件绑定具体国家或货币逻辑
* ✅ 必须由 Core 提供统一 Contract 与 Runtime

---

## 2. Globalization Invariants（不可变原则）

### G1. 语言、货币、地区永远是「配置态」，不是「代码态」

* 任何语言 / 货币 / 地区：

  * ❌ 不允许写死在代码分支
  * ❌ 不允许通过 if/else 判断国家
  * ✅ 必须通过 Context 注入

---

### G2. Global Context 必须可组合、可覆盖、可继承

Global Context 由以下部分组成：

* `locale`（语言 + 地区，如 `en-US`）
* `currency`（展示/结算货币，如 `USD`）
* `timezone`
* `numberFormat`
* `dateFormat`
* `taxRegion`

特性：

* 可由 System / Tenant / Space / User / Request 覆盖
* 优先级明确、可追溯

---

### G3. 数据层必须支持「多语言结构」，而非多表

* ❌ 不允许为每种语言建一张表
* ❌ 不允许在 Schema 中固定语言字段（title_en / title_fr）
* ✅ 必须使用结构化 translations

示例（逻辑结构）：

```json
{
  "title": {
    "en-US": "Product",
    "fr-FR": "Produit"
  }
}
```

---

### G4. 币种与价格必须解耦

* `price` ≠ `currency`
* 系统内部：

  * 使用 **Base Currency（基准币种）**
* 展示层：

  * 允许多币种实时/缓存换算

---

## 3. Language (i18n) Governance

### 3.1 语言模型

* 语言采用 `BCP 47` 标准（如 `en-US`, `zh-CN`）
* 语言选择来源：

  1. User Preference
  2. Space / Tenant Default
  3. System Fallback

---

### 3.2 翻译责任边界

| 内容类型         | 翻译责任          |
| ------------ | ------------- |
| Core UI      | Core Team     |
| Plugin UI    | Plugin Author |
| Content Data | Content Owner |

系统只提供：

* 翻译结构
* fallback 规则
* runtime 注入

---

### 3.3 插件 i18n Contract

插件必须：

* 声明支持的语言列表
* 提供 default language
* 不得假设当前语言

---

## 4. Multi-Currency Governance

### 4.1 基准币种（Base Currency）

* 每个 Tenant / Space 必须定义一个 Base Currency
* 所有计费、统计、结算逻辑以 Base Currency 为准

---

### 4.2 展示币种（Display Currency）

* Display Currency ≠ Settlement Currency
* 由 Context 决定
* 汇率：

  * 可缓存
  * 可配置来源
  * 必须可审计

---

### 4.3 插件价格约束

插件：

* ❌ 不允许自行维护汇率
* ❌ 不允许假设某一币种
* ✅ 必须通过 Pricing API

---

## 5. Tax & Region Readiness

* 税务不是 MVP 必须实现
* 但必须：

  * 预留 `taxRegion`
  * 支持未来 Tax Plugin 注入

---

## 6. Globalization Runtime Context

Runtime 必须在以下阶段注入 Global Context：

* API Request
* Plugin Execution
* Hook / Event
* Pricing Calculation

并保证：

* Context 不可被插件篡改
* 只读访问

---

## 7. Plugin Compatibility Rules

插件声明：

* 是否支持 multi-language
* 是否支持 multi-currency

系统行为：

* 不兼容插件：

  * 降级
  * 警告
  * 禁用（可配置）

---

## 8. MVP Scope Clarification

### MVP 必须具备

* Global Context Contract
* Translation 数据结构
* Base Currency 概念

### MVP 可不实现

* 自动翻译
* 实时汇率
* 税务计算

---

## 9. Long-term Compatibility Promise

> 一旦进入 GA，以下 Contract **永久不破坏**：

* Translation 数据结构
* Global Context Shape
* Base / Display Currency 模型

---

## 10. Summary

Globalization 在 WordRhyme 中不是功能，而是：

> **系统存在方式的一部分**

提前冻结它，才能：

* 支持全球 SaaS
* 支持插件生态
* 支持长期商业化

---

**End of Globalization Governance**
