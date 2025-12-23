# Nebula CMS — Core Domain Contract (Frozen v1)

> 本文档定义 **Nebula CMS Core Domain 的强约束契约（Core Domain Contract）**。
>
> 它回答一个核心问题：
>
> **什么是 Core 的不可变职责？什么永远不属于插件？**
>
> 本文件是 **SYSTEM_INVARIANTS 的直接下位法**，
> 高于 Plugin / Runtime / Billing / Hook 等所有扩展层。

---

## 0. 核心定位（Absolute Boundary）

### 0.1 Core Domain 的唯一使命

> **Core Domain 负责“系统存在本身”。**

Core 的职责不是“功能多”，而是：

* 系统是否还能启动
* 数据是否还能被信任
* 权限是否还能被裁决
* 插件是否还能被约束

**只要这些能力失效，Nebula CMS 即不复存在。**

---

### 0.2 Core 永远不是 Feature 集合

Core **不是**：

* 内容管理功能堆
* 业务模块合集
* 可随意扩展的工具箱

Core 是：

* 系统规则执行者
* 状态与边界的最终裁判

---

## 1. Core Domain 的冻结范围（Hard Scope）

以下能力 **永久属于 Core，不得插件化**：

### 1.1 系统身份与上下文

* Tenant / Workspace / Project
* User / Identity / Session
* Request / Execution Context

> 插件只能被动读取上下文，
> 永远不能创建或伪造上下文。

---

### 1.2 权限与授权裁决

* 权限模型定义
* 权限校验逻辑
* 授权失败处理

> 权限判断是“裁决”，
> 而不是“可扩展点”。

---

### 1.3 数据所有权与一致性

* Core 数据表结构
* 事务边界
* 数据一致性规则

插件：

* 不得修改 Core 表结构
* 不得破坏 Core 事务

---

### 1.4 插件治理系统

* 插件注册 / 启停 / 卸载
* 插件状态机
* 插件异常隔离

> 插件永远不能治理插件。

---

### 1.5 系统级生命周期

* 启动 / 重启 / 关闭
* 集群 Reload
* 版本迁移

这些能力 **永远不可 Hook 化**。

---

## 2. Core 明确不负责的内容（Anti-Scope）

Core **明确拒绝承担**：

* SEO / 营销
* 主题 / UI 表现
* 第三方集成逻辑
* 行业 / 垂直业务规则

这些 **必须插件化**，否则 Core 会腐化。

---

## 3. Core 与 Plugin 的唯一交互方式

### 3.1 单一入口原则

> **Plugin 只能通过 Plugin API 与 Core 交互。**

禁止：

* 直接 import Core 模块
* 访问 Core 内部状态
* 猜测 Core 实现细节

---

### 3.2 Capability 驱动

Core 通过 Capability 暴露能力：

* 权限能力
* 数据能力
* Hook 能力
* 日志能力

Capability：

* 显式声明
* 显式授权
* 可被收回

---

## 4. Core 状态机（不可绕过）

Core 至少维护以下状态机：

* Plugin State Machine
* Permission Evaluation Flow
* Request Lifecycle

插件：

* 只能监听结果
* 永远不能短路流程

---

## 5. 演进与兼容性原则

### 5.1 Core 稳定性优先级

> **Core 的稳定性优先于所有插件生态。**

* 插件不兼容 → 插件失败
* Core 不为插件妥协核心原则

---

### 5.2 演进策略

* Core 破坏性变更：

  * 主版本升级

* Plugin API：

  * 尽量向后兼容

---

## 6. 明确禁止（Hard Ban）

Nebula Core **明确禁止**：

* 将 Core 关键能力暴露为 Hook
* 将权限判断下放给插件
* 将系统状态交由插件维护
* Core 依赖插件才能启动

---

## 7. 设计宣言（Design Declaration）

> Core 是系统的“宪法执行者”，
> 而不是“民主投票的结果”。

> 插件可以失败，
> Core 不可以。

---

**本文件一经发布，即视为冻结（Frozen）。**

任何试图削弱 Core 边界的行为，
都意味着：

> 你正在把 Nebula CMS
> 变成另一个不可维护的系统。
