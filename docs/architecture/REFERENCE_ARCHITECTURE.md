# REFERENCE_ARCHITECTURE.md

> 本文档是 **WordRhyme CMS 的权威参考架构（Reference Architecture）**。
>
> 目标：
>
> * 为人类工程师提供一致的系统心智模型
> * 为 AI 编程（Claude Code / Codex / Cursor / Windsurf）提供**默认假设**
> * 保证所有实现与治理文档一致，不出现“各写各的”

---

## 0. 架构地位（Normative Status）

* 本文档 **不定义新规则**，只解释“如何落地”
* 若与以下文档冲突，以下文档优先：

  * `SYSTEM_INVARIANTS.md`
  * `PLUGIN_CONTRACT.md`
  * `EVENT_HOOK_GOVERNANCE.md`
  * `PERMISSION_GOVERNANCE.md`
  * `RUNTIME_GOVERNANCE.md`
  * `BILLING_MONETIZATION_GOVERNANCE.md`
  * `MARKETPLACE_STRATEGY.md`

---

## 1. 总体架构视图（High‑Level）

```text
┌───────────────────────────────┐
│           Admin (Host)         │
│  React + Rspack + MF 2.0       │
└───────────────▲───────────────┘
                │ MF Remotes
┌───────────────┴───────────────┐
│        Plugin Admin UI         │
│   (RemoteEntry / Components)  │
└───────────────────────────────┘

┌───────────────────────────────┐
│          API Server            │
│  NestJS + Fastify              │
│  Core + Plugin Modules         │
└───────────────▲───────────────┘
                │ Capability API
┌───────────────┴───────────────┐
│         Plugin Runtime         │
│  Node / Worker / WASM (future)│
└───────────────────────────────┘

┌───────────────────────────────┐
│        Infrastructure         │
│  Postgres / Redis / NAS / PM2 │
└───────────────────────────────┘
```

---

## 2. 单体 + 插件 = 模块化单体（Modular Monolith）

WordRhyme CMS **不是微服务系统**。

原则：

* 单一进程模型
* 明确模块边界
* 通过 Plugin Contract 防止逻辑耦合

理由：

* 插件系统本身已经引入复杂度
* 微服务会放大部署与治理成本
* PM2 + Cluster 已满足水平扩展

---

## 3. 后端分层结构（Server）

```text
apps/server
├─ bootstrap.ts          # 统一启动 / 重启入口
├─ main.ts               # Fastify + NestJS
├─ core/
│  ├─ domain/            # 核心领域模型（不含插件）
│  ├─ services/
│  └─ api/
├─ plugins/
│  ├─ loader/            # Plugin Bootstrapper
│  └─ registry/          # 插件元信息注册表
└─ capabilities/         # Plugin API 实现层
```

**强约束**：

* Core 不 import Plugin
* Plugin 只通过 capabilities 访问系统

---

## 4. Plugin Loader 的参考实现模型

加载流程（重启时）：

1. 扫描 `/plugins` 目录
2. 读取 `manifest.json`
3. 校验 `engines.WordRhyme`
4. 注册插件元信息
5. 动态 `import()` 插件 server entry
6. 挂载 NestJS Module

失败策略：

* 单插件失败 ≠ 系统失败
* 标记插件为 `disabled`

---

## 5. Capability 注入模型

```text
Core Implementation
      ↓
Capability Adapter
      ↓
@WordRhyme/plugin-api
      ↓
Plugin Code
```

特性：

* Capability 是稳定接口
* 实现可替换
* 可被 Mock（测试 / AI 生成代码）

---

## 6. Admin 前端架构（MF 2.0）

### 6.1 Host 责任

* 提供统一 Layout
* 提供 Extension Points
* 控制插件渲染边界

### 6.2 Plugin Admin UI 责任

* 只暴露组件
* 不控制路由主权
* 不持有全局状态

---

## 7. SaaS 与 Self‑Hosted 的差异点

| 维度          | Self‑Hosted | SaaS |
| ----------- | ----------- | ---- |
| 插件安装        | 本地 / 市场     | 仅市场  |
| 插件授权        | 可选          | 强制   |
| Runtime 隔离  | 弱           | 强    |
| Marketplace | 可选          | 必选   |

---

## 8. AI 编程的默认假设（非常重要）

当 AI 为 WordRhyme CMS 编写代码时：

* **假设 Plugin 不可信**
* **假设 Capability 是唯一入口**
* **假设任何插件都可能被卸载**
* **假设 SaaS 环境是强治理**

AI 不应：

* 直接访问 Core 私有实现
* 在插件中写全局副作用
* 假设插件永远存在

---

## 9. 可演进路径（Roadmap‑Safe）

未来可无破坏引入：

* WASM Plugin Runtime
* 多进程 Plugin Worker
* Remote Plugin Execution
* Edge / Region‑based Runtime

因为：

* Contract 已冻结
* Capability 已抽象

---

## 10. 冻结声明

* Status: **Frozen**
* Change Policy: Architecture Review Only
* Audience: Core Dev / Plugin Dev / AI

> **这是 WordRhyme CMS 的“施工蓝图”。**
> 不按它施工，迟早返工。
