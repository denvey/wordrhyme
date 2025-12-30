# WordRhyme CMS — Plugin Composition Governance (v0.1)

> 本文档定义 **WordRhyme CMS 中插件能力、权限、计费、用量的组合治理契约（Plugin Composition Contract）**。
>
> 它解决的问题不是“插件怎么写”，而是：
>
> **多个插件、多个能力、多个收费规则如何在同一系统中可组合、可治理、可扩展。**

---

## 0. 核心定位（Why this document exists）

在 WordRhyme CMS 中：

* 插件 ≠ 功能
* 插件 ≠ 计费单元
* 插件 ≠ 权限边界

**插件只是能力的提供者（Capability Provider）**。

真正面向最终用户（C 端 / 客户）的，是：

> **能力组合（Composition）**

如果没有明确的组合治理规则，系统将不可避免地走向：

* 插件互相耦合
* 计费逻辑分散在插件中
* SaaS / OSS 行为不一致
* 等级 / 套餐 / 用量无法统一表达

---

## 1. 组合治理的不可变原则（Composition Invariants）

以下规则 **不可被任何插件或实现破坏**：

1. **插件永远不能直接定义“套餐 / 会员等级”**
2. **插件不能感知自己是否被组合、如何被组合**
3. **计费、用量、等级永远属于 Core Governance**
4. **能力是最小组合单位，而不是插件本身**
5. **组合关系必须是声明式、可审计、可回滚的**

> 插件提供“能做什么”，系统决定“谁能用、怎么用、用多少、怎么付费”。

---

## 2. 能力模型（Capability Model）

### 2.1 能力的定义

在 WordRhyme 中，**Capability 是最小可组合单元**。

```ts
type Capability = {
  id: string;                // 全局唯一，如: content.publish
  provider: 'core' | string; // core 或 pluginId
  scope: PermissionScope;    // instance | org | space | project
  metered?: boolean;         // 是否可计量
};
```

* 一个插件可以提供 **多个 Capability**
* Capability 可以是：

  * 行为（action）
  * 资源访问
  * API 调用额度

---

### 2.2 插件如何声明 Capability

插件在 manifest 中声明：

```json
{
  "capabilities": [
    {
      "id": "seo.settings.manage",
      "scope": "space",
      "metered": false
    },
    {
      "id": "seo.analysis.run",
      "scope": "space",
      "metered": true
    }
  ]
}
```

规则：

* Capability 必须 namespaced 到插件
* 插件 **只声明能力，不声明价格、不声明等级**

---

## 3. 能力组合（Capability Composition）

### 3.1 什么是组合

组合是 Core 层的声明式结构：

```ts
type CapabilityBundle = {
  id: string;                // 如: plan.basic
  capabilities: CapabilityRef[];
};
```

组合可以表示：

* 会员等级
* 套餐
* 内部功能集
* 企业定制方案

插件 **不知道自己被哪个组合引用**。

---

### 3.2 示例：等级组合

```ts
Basic:
  - plugin:A.read
  - plugin:B.use

Pro:
  - plugin:A.read
  - plugin:B.use
  - plugin:C.run (limit: 100)

Enterprise:
  - plugin:A.read
  - plugin:B.use
  - plugin:C.run (unlimited)
```

---

## 4. 权限 × 能力 × 组合

### 4.1 权限只是门禁，不是套餐

* 权限决定：**“是否允许调用”**
* 组合决定：**“在什么条件下允许调用”**

```text
User
 └─ Role
     └─ Permission
         └─ Capability
             └─ Composition Rule
```

插件只参与 **Capability → Permission** 层级。

---

## 5. 用量与计量（Usage & Metering）

### 5.1 插件是否能自己计费？

**不能。**

插件只能：

* 标记 capability 是否可计量
* 上报 usage 事件

```ts
usage.report({
  capability: 'seo.analysis.run',
  amount: 1
});
```

---

### 5.2 用量规则属于组合

```ts
type UsageRule = {
  capability: string;
  limit: number | 'unlimited';
  overage?: {
    price: Money;
    unit: number;
  };
};
```

插件 **不知道 limit 是多少**。

---

## 6. 计费模型与组合

### 6.1 插件不允许定义价格

插件 **严禁**：

* 定义订阅价格
* 定义按量价格
* 判断用户是否付费

---

### 6.2 Core Billing 绑定组合

```ts
Plan
 └─ Bundle
     └─ Usage Rules
```

* SaaS 可强制启用
* OSS 可自行实现或关闭

---

## 7. 组合的生命周期

### 7.1 插件卸载

* 所有相关 Capability 自动失效
* 组合自动降级或失效
* 不影响其他插件

---

### 7.2 组合变更

* 必须是声明式变更
* 必须可审计
* 必须支持回滚

---

## 8. 插件隔离与组合安全

* 插件不能检测其他插件是否存在
* 插件不能基于组合做条件分支
* 插件不能 hardcode 等级逻辑

> **组合是平台能力，而不是插件能力。**

---

## 9. OSS 与 SaaS 的一致性原则

| 能力            | OSS | SaaS |
| ------------- | --- | ---- |
| 插件 Capability | ✅   | ✅    |
| 组合机制          | 可选  | 强制   |
| 计费绑定          | 可实现 | 内置   |

---

## 10. 非目标（Explicit Non‑Goals）

WordRhyme v0.x 不支持：

* 插件感知套餐
* 插件感知价格
* 插件直接限制用户等级
* 插件间组合依赖

---

## 11. 架构总结

> **插件提供能力，系统负责组合。**
>
> **插件越“无知”，平台越强大。**

这是 WordRhyme CMS 能同时成为：

* WordPress 级开源系统
* Shopify 级 SaaS 平台

的关键结构之一。
