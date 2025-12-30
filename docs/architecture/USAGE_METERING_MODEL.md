# WordRhyme — Usage Metering Model (v0.1)

> 本文档定义 **WordRhyme 的用量计量（Usage Metering）强约束模型**。
>
> 它是连接 **插件能力（Capability）→ 组合（Composition）→ 计费（Billing）** 的唯一桥梁。
>
> 本文档的目标不是“如何收费”，而是回答：
>
> **系统如何在插件完全无感的前提下，可靠、统一、可扩展地统计用量。**

---

## 0. 定位与边界（Scope & Responsibility）

Usage Metering 负责：

* 统计 **能力级别（Capability-level）** 的使用情况
* 支持多维度（时间 / 用户 / 项目 / 租户）计量
* 为组合规则与计费系统提供可信数据

Usage Metering **不负责**：

* 定义价格
* 判断套餐等级
* 扣费或结算

> 用量是事实数据，不是业务决策。

---

## 1. 不可变原则（Metering Invariants）

以下规则 **不可被任何插件或实现破坏**：

1. **插件永远不能自行维护用量状态**
2. **用量统计必须由 Core 接管与校验**
3. **插件只能上报“发生了什么”，不能声明“该怎么计费”**
4. **所有用量数据必须可审计、可回放**
5. **用量模型必须同时适用于 OSS 与 SaaS**

---

## 2. 计量对象（What is metered）

### 2.1 唯一计量单位：Capability Usage

WordRhyme 中 **唯一允许被计量的对象是 Capability**。

```ts
type UsageEvent = {
  capabilityId: string;
  provider: 'core' | string; // pluginId
  scope: PermissionScope;    // org | space | project
  subjectId: string;         // orgId / spaceId / projectId
  actorId?: string;          // userId (optional)
  amount: number;            // >= 1
  timestamp: number;
};
```

---

### 2.2 Capability 是否可计量

* Capability 在声明时标记：

```json
{
  "id": "seo.analysis.run",
  "metered": true
}
```

* 非 metered 的 capability **严禁上报用量**

---

## 3. 插件与用量的关系

### 3.1 插件能做什么

插件 **只能**：

* 调用 Core 暴露的 `usage.report()`
* 上报一次“能力被使用”的事实

```ts
usage.report({
  capability: 'seo.analysis.run',
  amount: 1
});
```

---

### 3.2 插件不能做什么（Hard Ban）

插件 **严禁**：

* 查询当前剩余额度
* 判断是否超额
* 判断用户等级
* 根据用量做业务分支

> 插件必须始终假设：**“是否允许使用”已经由系统决定。**

---

## 4. 用量聚合模型（Aggregation Model）

### 4.1 原始事件 vs 聚合数据

* 原始 UsageEvent：

  * 只追加（append-only）
  * 不可修改

* 聚合视图（Derived View）：

  * 按时间窗口生成
  * 可重建

---

### 4.2 时间窗口（Window Types）

Core 必须支持以下窗口类型：

```ts
type UsageWindow = 'realtime' | 'daily' | 'monthly';
```

* 插件 **不知道窗口类型**
* 组合规则选择窗口

---

## 5. 用量与组合规则的关系

### 5.1 用量限制属于组合

```ts
type UsageLimitRule = {
  capabilityId: string;
  window: UsageWindow;
  limit: number | 'unlimited';
};
```

* 插件不知道 limit
* 插件只上报 usage

---

### 5.2 超额（Overage）

```ts
type OverageRule = {
  capabilityId: string;
  unit: number;   // 如：每 100 次
  priceRef: string; // 计费系统引用
};
```

是否允许超额、如何收费：

* 由 Billing Governance 决定
* 不属于 Metering 决策

---

## 6. 多租户与隔离

### 6.1 用量隔离原则

* 用量 **必须绑定到最小 Scope**
* 不同 organization / space / project 之间完全隔离

---

### 6.2 继承规则

* 上层 scope 可查看下层用量
* 下层 scope 不可反查上层

---

## 7. OSS 与 SaaS 一致性

| 能力         | OSS | SaaS |
| ---------- | --- | ---- |
| Usage 事件模型 | ✅   | ✅    |
| 聚合窗口       | 可配置 | 平台固定 |
| 强制限制       | ❌   | ✅    |

> OSS 可以“不收费”，但 **不能“不计量”**。

---

## 8. 安全与反作弊（Anti-abuse）

Core 必须保证：

* 插件无法伪造 capabilityId
* 插件无法伪造 scope
* 插件无法回滚或删除用量

推荐策略：

* Capability 注册白名单
* Usage API 签名校验
* 异常模式检测

---

## 9. 失败与降级策略

* Usage 系统不可用：

  * 可允许能力继续使用（策略可配置）
  * 但必须记录异常

> **宁可账算错一次，不可服务全挂。**

---

## 10. 非目标（Explicit Non-Goals）

WordRhyme v0.x 不支持：

* 插件读取剩余额度
* 插件自行限制调用次数
* 插件直接对接支付系统

---

## 11. 架构总结

> **用量是事实层，组合是规则层，计费是商业层。**
>
> 三者解耦，系统才能长期演进。

这套 Usage Metering Model 是 WordRhyme 能同时支撑：

* 插件生态
* SaaS 商业模式
* 开源可控性

的关键基础设施之一。
