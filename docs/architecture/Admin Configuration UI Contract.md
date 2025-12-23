# Nebula CMS — Admin Configuration UI Contract (v0.1)

> 本文档定义 **Nebula CMS 的 Admin 配置系统的最终形态 Contract**
> 目标：
>
> * 不写死 UI
> * 不绑定前端框架
> * 支持 Core + Plugin
> * 支持 OSS & SaaS
> * 支持未来 5 年复杂商业配置

---

## 0. 核心结论（先看）

> **Admin 不是页面集合，而是「配置能力的渲染器」**

UI ≠ 页面
UI = **Schema + State + Policy + Capability**

---

## 1. Admin 的系统地位（非常重要）

Admin 在 Nebula 中是一个 **Core 子系统**：

```text
┌──────────────┐
│ Core Domain  │
└─────▲────────┘
      │
┌─────┴────────┐
│ Admin Engine │  ← 不是 UI
└─────▲────────┘
      │
┌─────┴────────┐
│ Admin UI     │  ← React / Vue / OSS 可替换
└──────────────┘
```

> Admin UI **可以换**
> Admin Engine **不能换**

---

## 2. Admin 配置的四大基础模型（终局）

### 2.1 Configuration Schema（配置结构）

所有可配置内容 **必须声明 Schema**

```ts
type ConfigSchema = {
  id: string
  scope: 'instance' | 'organization' | 'space' | 'project'
  owner: 'core' | `plugin:${pluginId}`
  fields: FieldSchema[]
}
```

字段示例：

```ts
{
  key: 'seo.titleTemplate',
  type: 'string',
  i18n: true,
  default: '{title} | My Site',
  visibility: 'admin',
  editable: true
}
```

---

### 2.2 Configuration State（配置状态）

```ts
type ConfigState = {
  schemaId: string
  scopeId: string
  values: Record<string, unknown>
  source: 'default' | 'override'
}
```

规则：

* 所有配置 **可继承**
* 下层可 override 上层
* 插件配置不污染 Core

---

### 2.3 Configuration Policy（配置治理）

```ts
type ConfigPolicy = {
  permission?: PermissionKey
  planGate?: PlanConstraint
  usageGate?: UsageConstraint
  readonlyWhen?: Condition
}
```

示例：

```json
{
  "permission": "plugin:analytics:settings.write",
  "planGate": {
    "minPlan": "pro"
  }
}
```

👉 **配置本身就是能力**

---

### 2.4 Configuration Capability（配置即能力）

```ts
type ConfigCapability = {
  affects: 'runtime' | 'billing' | 'ui'
  triggers?: EventHook[]
}
```

例如：

* 改一个配置 → 影响运行时
* 改一个配置 → 影响计费规则
* 改一个配置 → 影响 UI 渲染

---

## 3. Admin 页面不是“页面”，而是「视图声明」

### 3.1 View Definition

```ts
type AdminView = {
  id: string
  schemaIds: string[]
  layout: 'form' | 'table' | 'wizard'
  scope: PermissionScope
}
```

示例：

```json
{
  "id": "seo-settings",
  "schemaIds": ["plugin:seo:settings"],
  "layout": "form",
  "scope": "space"
}
```

---

### 3.2 插件如何扩展 Admin？

插件 **不能写页面**，只能：

* 声明 Config Schema
* 声明 Admin View
* Core 决定是否挂载

```json
{
  "admin": {
    "views": [
      {
        "id": "analytics-dashboard",
        "schemaIds": ["plugin:analytics:config"],
        "layout": "table"
      }
    ]
  }
}
```

---

## 4. 权限 / 套餐 / 用量 与 Admin 的关系（关键）

### 4.1 权限控制

* Admin UI 不判断权限
* Admin Engine 在返回 Schema 时 **已裁剪字段**

```text
用户 → Admin API → 已过滤 Schema → UI 渲染
```

---

### 4.2 套餐控制（Plan-aware UI）

```ts
FieldSchema.planGate = {
  minPlan: 'pro'
}
```

UI 表现：

* OSS：显示但禁用
* SaaS：可隐藏或 Upsell

---

### 4.3 用量驱动 UI（Usage-aware UI）

```ts
{
  key: 'apiKey.limit',
  type: 'number',
  usageBound: 'api.calls'
}
```

> Admin UI 可以显示：
>
> * 已使用
> * 剩余
> * 超出费用预估

---

## 5. 多语言 / 多币种 / 全球化预留（不实现，但冻结）

### 5.1 多语言字段

```ts
FieldSchema.i18n = true
```

State 存储：

```json
{
  "seo.titleTemplate": {
    "en": "...",
    "fr": "..."
  }
}
```

---

### 5.2 多币种配置（非价格）

```ts
FieldSchema.currencyAware = true
```

---

## 6. OSS vs SaaS Admin 差异点（只在 Policy 层）

| 能力        | OSS | SaaS |
| --------- | --- | ---- |
| 自定义 View  | 全部  | 可限制  |
| 高危配置      | 自担  | 平台可锁 |
| Upsell UI | ❌   | ✅    |

👉 **Schema 不分叉，Policy 分叉**

---

## 7. MVP 实现清单（只做这些）

### ✅ 必做（2–3 周）

* Config Schema Registry
* Config State 存储
* Admin API（Schema / State）
* 表单型 Admin UI（最基础）

### ❌ 不做但已预留

* Wizard
* 可视化 Dashboard
* 拖拽
* AI Admin

---

## 8. 一句话总结（非常重要）

> **你不是在做 Admin 页面，你是在做“系统自我描述能力”。**

这一步完成后：

* 插件 = 配置声明
* Admin = 自动生成
* 商业能力 = Policy 组合


