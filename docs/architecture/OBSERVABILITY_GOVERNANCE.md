# Nebula CMS — Observability Governance

> 本文档定义 Nebula CMS 在 **可观测性（Logging / Metrics / Tracing / Audit）** 方面的系统级治理规范。
>
> 目标不是“监控工具选型”，而是冻结 **责任边界、数据归属、插件行为约束**，以保证：
>
> * 插件可观测但不可污染
> * SaaS / 开源一致
> * 商业计量、审计、风控可落地
> * 未来 AI 生成插件可治理

---

## 0. 核心原则（Non‑Negotiable Invariants）

1. **插件不得直接接触底层观测基础设施**（如 stdout、APM SDK、Prometheus client）。
2. **所有可观测能力必须通过 Core 提供的 Observability API**。
3. **观测数据必须可归因（Attribution）到 Plugin / Tenant / User / Capability**。
4. **观测 ≠ 调试**，任何插件级 debug 行为不得影响系统稳定性。
5. **观测系统必须支持 SaaS 商业计量与审计需求**。

---

## 1. 可观测能力分层模型

Nebula CMS 将可观测性拆分为四个正交层级：

| 层级      | 目标           | 是否对插件开放    |
| ------- | ------------ | ---------- |
| Logging | 行为记录、错误追踪    | ✅（受控）      |
| Metrics | 用量、性能、计费     | ✅（受控）      |
| Tracing | 请求级链路分析      | ❌（插件不可控）   |
| Audit   | 安全 / 合规 / 账务 | ❌（Core 专属） |

插件只能通过 **受控 API** 写入 Logging / Metrics，**永远不能控制 Tracing / Audit**。

---

## 2. Observability Capability Contract

Core 向插件暴露统一的观测能力接口：

```ts
interface ObservabilityAPI {
  logger: PluginLogger;
  metrics: PluginMetrics;
}
```

插件 **不得**：

* import 第三方 logging / metrics SDK
* 直接输出 console.log / console.error
* 创建自定义 exporter

---

## 3. Logging Governance

### 3.1 Plugin Logger 约束

```ts
interface PluginLogger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}
```

### 3.2 强制日志归因字段（自动注入）

Core 自动附加以下上下文：

* plugin_id
* plugin_version
* tenant_id
* user_id (if available)
* capability (if applicable)
* locale / currency (if available)

插件 **无法覆盖或伪造这些字段**。

### 3.3 日志级别治理

* info：允许
* warn：允许（可触发告警）
* error：允许（自动关联插件健康度）
* debug / trace：❌ 禁止（防止日志洪水）

---

## 4. Metrics Governance（计量与商业核心）

### 4.1 插件可声明的 Metrics 类型

插件只能声明 **离散、可计量的事件型指标**：

```ts
metrics.increment('content.generated', { model: 'gpt-4' })
```

禁止：

* 自定义时间序列
* 自定义 histogram
* 自定义 label 维度

### 4.2 Metrics 与 Billing 的强绑定

所有 Plugin Metrics 都具备以下潜在用途：

* 使用量计费（per call / per unit）
* 套餐限额（quota enforcement）
* SLA 统计
* 插件市场分成结算

> **任何不能用于计费或限额的 Metrics 都不应存在。**

---

## 5. Tracing Governance（插件不可控）

* Tracing 由 Core 在 HTTP / Job / Hook 边界自动注入
* 插件只能被动参与 Trace
* 插件无法：

  * 创建 span
  * 修改 trace context
  * 注入 baggage

目的：

> 防止插件破坏链路完整性或逃避责任归因。

---

## 6. Audit Governance（安全与合规）

Audit 属于 **系统主权能力**，插件完全不可见。

Audit 覆盖：

* 权限变更
* 计费变更
* 插件安装 / 启停 / 卸载
* 数据导出 / 删除

插件：

* ❌ 不可写入
* ❌ 不可读取
* ❌ 不可感知是否存在

---

## 7. 插件健康度与隔离策略

Core 基于 Observability 数据维护插件健康状态：

| 状态        | 触发条件            |
| --------- | --------------- |
| healthy   | 正常运行            |
| degraded  | error / warn 超标 |
| suspended | 严重异常或滥用         |
| disabled  | 管理员或系统禁用        |

插件状态可用于：

* UI 提示
* 自动限流
* 自动熔断
* 市场下架

---

## 8. SaaS / Open Source 一致性原则

* 开源版本：观测数据本地化
* SaaS 版本：观测数据集中化

但：

> **插件看到的 Observability API 完全一致**。

---

## 9. AI 插件治理（Forward‑Looking）

Observability 是 AI 插件治理的基础：

* AI 插件必须使用官方 Metrics 上报调用次数
* 模型调用必须可审计
* Token / Cost 计算通过 Metrics 完成

> 没有 Observability，就没有 AI 插件市场。

---

## 10. 明确非目标（Explicit Non‑Goals）

Nebula CMS 不承诺：

* 插件级自定义监控面板
* 插件级 APM 接入
* 插件绕过 Core 上报观测数据

---

## 11. 冻结声明（Freeze Statement）

> 本文档定义的是 **治理模型，而非实现细节**。
>
> 所有未来实现、插件、AI 生成代码 **必须遵守本治理规范**。
>
> 一切便利性让位于系统长期可控性。
