# WordRhyme CMS — Plugin Contract

> 本文档定义 **WordRhyme CMS 插件系统的唯一、冻结的契约（Contract）**。
>
> 所有插件（开源 / 商业 / SaaS / 内置）**必须严格遵守本契约**，否则视为非法插件。

---

## 1. Contract Scope（契约范围）

Plugin Contract 约束以下内容：

* 插件的 **身份定义**
* 插件的 **能力声明（Capability）**
* 插件的 **生命周期**
* 插件与 **Core / Runtime / Permission / Billing / Globalization** 的交互方式
* 插件的 **权限、资源、数据、事件边界**

> 本 Contract 是 **SYSTEM_INVARIANTS.md 的直接下游实现约束**。

---

## 2. Plugin Identity（插件身份）

### 2.1 Plugin 是什么

在 WordRhyme CMS 中：

> **Plugin = 一个受 Runtime 控制、能力显式声明、永不直接依赖 Core 内部实现的扩展单元**

插件 **不是**：

* 一个 npm 包随意 import Core
* 一个可以 monkey patch 全局状态的模块
* 一个可以直接访问数据库的代码块

### 2.2 Plugin 唯一标识

每个插件必须拥有不可变身份：

```json
{
  "pluginId": "com.vendor.plugin-name",
  "version": "1.0.0",
  "vendor": "vendor-name",
  "type": "extension | integration | feature",
  "runtime": "node | edge | wasm"
}
```

约束：

* `pluginId` 全局唯一，不可复用
* `version` 必须遵循 semver
* `runtime` 决定插件运行沙箱

---

## 3. Capability Declaration（能力声明）

### 3.1 为什么必须 Capability First

WordRhyme CMS 的核心原则：

> **插件不能“做什么”，只取决于它“声明了什么能力”**

禁止：

* 隐式权限
* 运行时临时申请能力
* 未声明却可访问系统资源

### 3.2 Capability Manifest

每个插件必须提供 `manifest.json`：

```json
{
  "capabilities": {
    "ui": {
      "adminPage": true,
      "frontendWidget": false
    },
    "data": {
      "collections": ["posts", "products"],
      "read": true,
      "write": false
    },
    "events": {
      "subscribe": ["order.created"],
      "emit": ["order.fulfilled"]
    },
    "billing": {
      "plans": true,
      "usageMeter": true
    },
    "globalization": {
      "i18n": true,
      "currency": true
    }
  }
}
```

约束：

* Capability 是 **白名单**，未声明 = 不允许
* Capability 是 **静态的**，运行时不可变

---

## 4. Plugin Lifecycle（插件生命周期）

插件生命周期由 **Runtime 全权管理**。

### 4.1 Lifecycle Stages

```
install → register → enable → active → disable → uninstall
```

### 4.2 Lifecycle Hooks（受控）

插件只能实现以下生命周期钩子：

```ts
onInstall(ctx)
onEnable(ctx)
onDisable(ctx)
onUninstall(ctx)
```

约束：

* 生命周期钩子 **不可阻塞系统启动**
* 不允许访问未声明 Capability 的资源

### 4.3 Runtime Reload Semantics（变更生效时机）

WordRhyme 区分两类插件变更：

**代码/Manifest 变更**（Install / Update / Uninstall）：
* 涉及文件系统操作或内存中模块替换
* 仅在 PM2 Rolling Reload 后生效（需重启）
* 流程：文件变更 → DB 状态更新 → Redis RELOAD_APP → PM2 Rolling Reload

**配置/激活变更**（Settings 修改、Theme 切换、功能开关）：
* 仅修改数据库行，不涉及文件系统或模块替换
* 可即时生效，无需重启
* 前端通过 query refetch / invalidation 感知变化

判断标准：

> 是否涉及文件系统操作或内存中模块替换？
> 是 → 需要 Rolling Reload；否 → 即时生效。

---

## 5. Plugin ↔ Core Boundary（核心边界）

### 5.1 严禁事项（Hard Rules）

插件 **永远不允许**：

* import Core 内部模块
* 直接访问数据库连接
* 修改 Core 状态机
* 替换系统服务实现

### 5.2 合法交互方式

插件只能通过：

* Capability API
* Event / Hook
* Service Proxy（Permission / Billing / i18n 等）

---

## 6. Plugin & Permission Model

插件本身 **不拥有权限**。

> 插件只是能力提供者，真正的访问权限属于：

* User
* Role
* Plan

插件必须通过 `PermissionService` 查询：

```ts
can(user, "plugin:com.vendor.xxx", "use")
```

---

## 7. Plugin & Billing Integration

插件 **不得自行实现收费系统**。

插件只能：

* 声明其 **可计费能力**
* 报告 **Usage / Meter**

计费规则由：

* System Plan
* Site Plan
* Role Entitlement

统一组合。

---

## 8. Plugin & Globalization

插件必须：

* 所有文案使用 i18n key
* 不写死 currency / locale

示例：

```json
{
  "label": "plugin.xxx.title",
  "price": { "amount": 10, "currency": "SYSTEM" }
}
```

---

## 9. Plugin Runtime Isolation

插件运行在受限环境：

* Node Sandbox / Edge / WASM
* 无全局变量污染
* 无跨插件直接调用

所有插件通信：

> **Event → Runtime → Permission → Target**

---

## 10. Contract Stability Rule（冻结规则）

本 Contract：

* 不因某个插件方便而修改
* 不因 MVP 而破坏
* 只允许 **向后兼容扩展**

任何破坏本 Contract 的行为：

> **视为架构违规（Architecture Violation）**

---

## 11. Summary（一句话总结）

> **WordRhyme CMS 的插件不是“代码扩展点”，而是“受治理的系统能力模块”。**
