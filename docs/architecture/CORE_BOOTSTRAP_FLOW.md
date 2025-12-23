# Nebula CMS — Core Bootstrap Flow

> 本文档定义 **Nebula CMS Core 的启动（Bootstrap）与重载（Reload）完整流程**。
>
> 这是一份 **从治理文档走向真实代码实现的“桥梁文档”**，用于指导：
>
> * Core 实现顺序
> * 插件加载时机
> * Capability 注入
> * Context 组装
> * Runtime Reload 行为
>
> 本文档 **不涉及具体技术实现细节**，但对 **顺序、责任、边界** 做强约束。

---

## 0. Bootstrap 总原则（Hard Rules）

1. **Bootstrap 是确定性的（Deterministic）**

   * 同一状态 → 同一加载结果
   * 不允许基于运行时随机行为改变系统结构

2. **Core 先于 Plugin，Context 先于 Capability**

3. **任何 Plugin 的行为都必须发生在 Context 建立之后**

4. **Reload ≠ Restart**

   * Reload 是受控的生命周期再执行
   * 数据与外部状态必须保持一致

---

## 1. 启动阶段总览（High-Level Phases）

```text
Process Start
  ↓
Load System Config
  ↓
Init Core Kernel
  ↓
Init Context Providers
  ↓
Load Plugin Manifests
  ↓
Resolve Plugin Graph
  ↓
Init Capabilities
  ↓
Register Plugin Modules
  ↓
Start HTTP / Jobs / Hooks
  ↓
System Ready
```

该顺序 **不可被插件或业务代码改变**。

---

## 2. Phase 1 — System Config & Kernel

### 2.1 系统配置加载

加载内容：

* 环境变量
* deployment mode（open-source / saas）
* 节点角色（admin / worker）
* 全局 feature flags

原则：

* **无插件参与**
* **无 IO 副作用（除配置文件）**

### 2.2 Kernel 初始化

Kernel 职责：

* 管理 Core 生命周期
* 维护当前运行状态（booting / running / reloading）
* 提供全局只读访问点

Kernel 在此阶段：

* ❌ 不加载插件
* ❌ 不访问数据库

---

## 3. Phase 2 — Context Providers 初始化

Context 是 **系统的第一公民**。

### 3.1 必须存在的 Context Provider

| Context  | 来源                | 说明    |
| -------- | ----------------- | ----- |
| tenant   | request / job     | 多租户隔离 |
| user     | auth              | 权限与审计 |
| locale   | request / default | 多语言   |
| currency | tenant / request  | 多币种   |
| timezone | tenant            | 时间处理  |

### 3.2 Context 初始化原则

* Context Provider **只注册，不执行**
* 不允许读取插件配置
* 不允许访问 Plugin 数据

> 插件只能在 Context **已解析完成之后** 被调用。

---

## 4. Phase 3 — Plugin Manifest 扫描

### 4.1 扫描规则

扫描目录：

* `/plugins/*/manifest.json`

仅解析：

* id
* version
* engines.nebula
* capabilities declaration
* server / admin entry

禁止：

* 执行插件代码
* require / import 插件模块

### 4.2 Manifest 校验

校验失败的插件：

* 标记为 `invalid`
* 不参与后续阶段
* 记录 Audit

---

## 5. Phase 4 — Plugin Dependency Graph

Core 构建插件依赖图：

* Core Version → Plugin engines.nebula
* Plugin → Plugin（显式声明）

规则：

* 不允许隐式依赖
* 不允许循环依赖
* 冲突插件不可同时启用

解析失败：

* 插件被禁用
* Core 继续启动

---

## 6. Phase 5 — Capability 初始化

Capability 是 **Plugin 与 Core 的唯一连接点**。

### 6.1 Capability 初始化顺序

1. Logger
2. Observability
3. Permission
4. Billing
5. Data Access
6. Hook System

> 顺序不可改变（后者可能依赖前者）。

### 6.2 Capability 注入规则

* 插件 **只能获得声明过的 Capability**
* Capability 为只读 façade
* 插件无法感知底层实现

---

## 7. Phase 6 — Plugin Server Module Registration

### 7.1 加载策略

* 动态 import 插件 server entry
* 构建 Plugin Module Wrapper
* 注册到 NestJS Module Tree

### 7.2 生命周期调用

顺序：

```text
onInstall (once)
  ↓
onEnable
```

* 所有生命周期执行在 **受控事务与错误边界内**
* 单个插件失败不影响其他插件

---

## 8. Phase 7 — HTTP / Job / Hook 启动

此阶段系统才开始对外提供服务。

启动内容：

* HTTP Server (Fastify)
* Background Jobs
* Hook Dispatcher

原则：

* 插件只能注册声明过的路由 / hook
* 插件不可修改全局中间件

---

## 9. Reload Flow（插件安装 / 升级）

### 9.1 Reload 触发源

* 插件安装
* 插件升级
* 插件启停
* Core 配置变更

### 9.2 Reload 行为模型

```text
Broadcast Reload Signal
  ↓
Kernel enters reloading
  ↓
Graceful shutdown HTTP
  ↓
Re-run Phase 2 → Phase 8
  ↓
Kernel back to running
```

### 9.3 Reload 保证

* 请求不丢失
* 数据不回滚
* Context 一致

---

## 10. 错误处理与降级策略

| 阶段        | 错误影响      |
| --------- | --------- |
| Phase 1–3 | Core 启动失败 |
| Phase 4–6 | 插件被禁用     |
| Phase 7   | 服务可降级     |

Core **永远优先保证自身可运行**。

---

## 11. 与治理文档的对齐声明

本 Bootstrap Flow：

* 遵循 `SYSTEM_INVARIANTS.md`
* 遵循 `PLUGIN_CONTRACT.md`
* 遵循 `RUNTIME_GOVERNANCE.md`
* 遵循 `DATA_MODEL_GOVERNANCE.md`
* 遵循 `OBSERVABILITY_GOVERNANCE.md`

如实现与本文档冲突，**以本文档为准**。

---

## 12. 冻结声明（Freeze Statement）

> 本文档冻结的是 **启动顺序与系统边界**，而非技术实现。
>
> 所有 Core 实现、插件系统、AI 生成代码
> **必须严格遵守该 Bootstrap Flow**。

> 这是 Nebula CMS 从“设计正确”走向“实现可控”的关键一步。
