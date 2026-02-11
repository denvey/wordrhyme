# WordRhyme Architecture v0.1 Final

> **状态：冻结（Frozen）**
> 本文档标志着 WordRhyme v0.1 架构设计的最终定型版本。
>
> 适用对象：
>
> * 团队开发与技术评审
> * 插件作者（第三方 / 官方）
> * AI 辅助编程上下文（Cursor / Windsurf）
>
> **原则：v0.1 之后的所有变更必须升级版本号，不允许隐式调整。**

---

## 1. Documentation Map (& Navigation)

WordRhyme uses a "Contract-First" approach. Use the map below to navigate the system definition.

### Level 0: Principles (The "Why")
*   **[SYSTEM_INVARIANTS.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/SYSTEM_INVARIANTS.md)**: The "Constitution" — non-negotiable rules.
*   **[GOVERNANCE_MODEL.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/GOVERNANCE_MODEL.md)**: How the platform maintains order and failure reactions.

### Level 1: Blueprint (The "What")
*   **[CORE_SKELETON.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/CORE_SKELETON.md)**: Internal module topology and bootstrap flow.
*   **[PLUGIN_CONTRACT.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/PLUGIN_CONTRACT.md)**: The hard boundary between Core and Plugins.
*   **[EVENTS_AND_HOOKS_MODEL.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/EVENTS_AND_HOOKS_MODEL.md)**: The communication protocol.

### Level 2: Execution (The "How")
*   **[GETTING_STARTED.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/GETTING_STARTED.md)**: Environment setup and installation.
*   **[PLUGIN_TUTORIAL.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/PLUGIN_TUTORIAL.md)**: Build your first plugin.
*   **[CONTRIBUTING.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/CONTRIBUTING.md)**: Workflow for Core contributions.

---

## 2. 架构总览（Arch Overview）

WordRhyme 是一个：

* **模块化单体（Modular Monolith）** 的 Headless CMS
* 通过 **插件系统** 实现能力扩展，而非微服务拆分
* 通过 **滚动重启** 实现插件生效，而非运行时热插拔

### 1.1 不可变核心结论（Hard Decisions）

| 决策点    | 结论                    | 不可更改原因       |
| ------ | --------------------- | ------------ |
| 插件生效方式 | 重启（Rolling Reload）    | 稳定性 > 幻想式热更新 |
| 后端框架   | NestJS + Fastify      | 插件隔离 + 工程成熟度 |
| 插件前端   | Module Federation 2.0 | 真正的微前端插件能力   |
| ORM    | Drizzle + Postgres    | 启动性能 + 显式控制  |
| 进程模型   | PM2 Cluster           | 零停机重启是系统能力   |

---

## 2. 架构分层（Frozen Layering Model）

```text
┌───────────────────────────┐
│        Admin UI Host       │  React + Rspack + MF 2.0
└────────────▲──────────────┘
             │
┌────────────┴──────────────┐
│      Plugin Frontend       │  RemoteEntry.js
└───────────────────────────┘

┌───────────────────────────┐
│      @wordrhyme/plugin-api │  Capability Boundary
└────────────▲──────────────┘
             │
┌────────────┴──────────────┐
│        @wordrhyme/core        │  NestJS Modules + Fastify
└───────────────────────────┘
             │
┌────────────┴──────────────┐
│   Postgres / Redis / FS    │
└───────────────────────────┘
```

**规则：**

* 插件只能向上依赖 `@wordrhyme/plugin-api`
* Core 永远不反向依赖插件

---

## 3. 插件系统（Frozen Contract Reference）

插件系统 **完全受以下文档约束**：

> 📜 **[PLUGIN_CONTRACT.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/PLUGIN_CONTRACT.md)**

该 Contract 具有最高优先级：

* 实现必须服从 Contract
* 需求不得破坏 Contract

---

## 4. 插件加载与生效模型（Final Runtime Model）

### 4.1 插件安装流程（冻结）

1. Admin 上传插件 ZIP
2. Server 解压至 `/plugins/{pluginId}`
3. 校验 `plugin.json`
4. 更新数据库插件状态
5. Redis 广播 `RELOAD_APP`
6. 所有节点执行 **PM2 Rolling Reload**
7. 重启时扫描并加载插件

> 插件 **不会** 在运行时被注入到已存在的 Nest 容器

---

## 5. 集群与部署模型（Final）

### 5.1 集群通信

* Redis Pub/Sub 仅用于 **控制信号**
* 不承载业务数据

### 5.2 文件系统

* `/plugins` 目录必须为共享存储（NFS / NAS）
* 不支持节点本地插件差异

### 5.3 进程管理

* PM2 是系统功能的一部分
* Docker 内使用 `pm2-runtime`

---

## 6. 数据模型原则（Frozen Rules）

* Core 表结构 **不可被插件修改**
* 插件数据必须：

  * 使用 JSONB 扩展
  * 或使用插件私有表

参考：`plugin_data` 通用模型

---

## 7. Admin UI 扩展模型（Frozen UI Contract）

插件只能注入以下 Extension Points：

* sidebar
* settings.page
* content.list.action
* content.detail.tab

> 未声明的 UI 注入点 **一律不支持**

---

## 8. 明确不做的事情（Non-Goals v0.x）

WordRhyme v0.x **明确不支持**：

* 插件运行时热替换（无重启）
* 插件沙箱 / VM 隔离
* 插件控制核心启动流程
* 插件修改全局中间件

---

## 9. 架构演进策略（Strict Versioning）

* v0.x：Trusted Plugin + 稳定内核
* v1.x：

  * 插件权限声明
  * 插件市场
  * 可选沙箱机制

任何破坏性调整：

* 必须升级主版本号
* 必须更新 Contract

---

## 10. 最终声明（Final Statement）

> **WordRhyme v0.1 架构到此冻结。**
>
> 后续所有讨论、实现、评审，都必须以本文件和 [PLUGIN_CONTRACT.md](file:///Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/PLUGIN_CONTRACT.md) 为准。
>
> 架构不是用来不断优化的，
> **而是用来被长期遵守的。**

WordRhyme adopts a Shopify-inspired permission model.
Authentication and tenant context are handled by better-auth,
while authorization is centralized in WordRhyme’s Permission Kernel.
Plugins must declare required permissions upfront and are granted
least-privilege access scoped to the active organization.


SYSTEM_INVARIANTS.md        ← 最高法
CORE_DOMAIN_CONTRACT.md    ← Core 边界（刚完成）
PLUGIN_CONTRACT.md         ← 插件宪法
EVENT_HOOK_GOVERNANCE.md   ← 扩展治理
PERMISSION_GOVERNANCE.md   ← 权限裁决
RUNTIME_GOVERNANCE.md      ← 插件运行边界
BILLING_GOVERNANCE.md      ← 收费与分成

🧱 系统不变量（不可被实现破坏）

SYSTEM_INVARIANTS.md

🧩 插件与扩展

PLUGIN_CONTRACT.md

EVENT_HOOK_GOVERNANCE.md

RUNTIME_GOVERNANCE.md

🔐 权限与安全

PERMISSION_GOVERNANCE.md

💰 商业与计费

BILLING_MONETIZATION_GOVERNANCE.md

🌍 全球化能力

GLOBALIZATION_GOVERNANCE.md

🗄 数据主权

DATA_MODEL_GOVERNANCE.md

📡 可观测性（刚刚完成）

OBSERVABILITY_GOVERNANCE.md

路由
http://localhost:3001/platform/users


哪些功能应该是插件？                                                                                                                              
                                                                                                                                                              
  📋 判断标准                                                                                                                                                 
  ┌──────────┬────────────────────┬──────────────────────┐                                                                                                    
  │ 判断维度 │   Core 基础设施    │   Plugin 可选功能    │                                                                                                    
  ├──────────┼────────────────────┼──────────────────────┤                                                                                                    
  │ 依赖方向 │ 被所有模块依赖     │ 独立，不被 Core 依赖 │                                                                                                    
  ├──────────┼────────────────────┼──────────────────────┤                                                                                                    
  │ 数据结构 │ 跨系统共享         │ 插件私有             │                                                                                                    
  ├──────────┼────────────────────┼──────────────────────┤                                                                                                    
  │ 卸载影响 │ 卸载会导致系统崩溃 │ 卸载不影响 Core      │                                                                                                    
  ├──────────┼────────────────────┼──────────────────────┤                                                                                                    
  │ 实现时机 │ MVP 必须预留       │ 后期按需开发         │                                                                                                    
  ├──────────┼────────────────────┼──────────────────────┤                                                                                                    
  │ 典型示例 │ 权限、计费、i18n   │ SEO、电商、论坛      │                                                                                                    
  └──────────┴────────────────────┴──────────────────────┘                                                                                                    
  ✅ 应该是 Core 的功能                                                                                                                                       
  ┌────────────────┬────────────────────────┐                                                                                                                 
  │      功能      │          原因          │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ i18n（多语言） │ 所有模块都需要翻译     │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ 权限系统       │ 所有操作都需要鉴权     │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ 计费系统       │ SaaS 核心商业模式      │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ 审计日志       │ 合规要求，不可卸载     │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ 设置系统       │ 插件依赖此系统存储配置 │                                                                                                                 
  ├────────────────┼────────────────────────┤                                                                                                                 
  │ 文件存储       │ 跨模块共享的基础能力   │                                                                                                                 
  └────────────────┴────────────────────────┘                                                                                                                 
  ✅ 应该是 Plugin 的功能                                                                                                                                     
  ┌─────────────┬───────────────────────┐                                                                                                                     
  │    功能     │         原因          │                                                                                                                     
  ├─────────────┼───────────────────────┤                                                                                                                     
  │ SEO 优化    │ 独立功能，不影响 Core │                                                                                                                     
  ├─────────────┼───────────────────────┤                                                                                                                     
  │ 电商模块    │ 垂直领域，可选安装    │                                                                                                                     
  ├─────────────┼───────────────────────┤                                                                                                                     
  │ 论坛/社区   │ 独立业务场景          │                                                                                                                     
  ├─────────────┼───────────────────────┤                                                                                                                     
  │ 第三方集成  │ Stripe、阿里云 OSS 等 │                                                                                                                     
  ├─────────────┼───────────────────────┤                                                                                                                     
  │ AI 写作助手 │ 增值功能，可付费启用  │                                                                                                                     
  └─────────────┴───────────────────────┘    