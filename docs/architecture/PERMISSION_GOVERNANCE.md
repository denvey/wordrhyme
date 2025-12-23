# Nebula CMS — Permission Governance (Frozen v1)

> 本文档定义 **Nebula CMS 的权限模型、裁决边界与治理规则**。
>
> 它不是 RBAC / ABAC 的教程，而是回答一个更根本的问题：
>
> **谁，有资格决定"能不能"？**
>
> 本文件是 `SYSTEM_INVARIANTS.md` 与 `CORE_DOMAIN_CONTRACT.md` 的直接下位法，
> 对 Plugin / Runtime / Billing / Marketplace 具有最高约束力。

---

## 0. 核心原则（Non‑Negotiable）

### 0.1 权限是"裁决"，不是"能力"

> **权限判断是一种裁决行为，而不是可扩展能力。**

含义：

* 权限只能由 Core 判定
* 插件永远不能"拥有"权限
* 插件只能请求裁决结果

---

### 0.2 权限优先级高于插件生态

* 插件体验 < 系统安全
* 插件功能 < 多租户隔离

> 如果两者冲突，插件必须让步。

---

### 0.3 未声明的能力 = 永远禁止

* 插件 manifest 中未声明的能力
* 插件在运行时 **永远不可用**
* 即使宿主用户是超级管理员

> 权限是 *白名单模型*，不是黑名单

---

## 1. 权限层级模型（Scope Hierarchy）

Nebula 的权限系统以 Scope 为基础：

```ts
type PermissionScope = 'instance' | 'organization' | 'space' | 'project';
```

层级关系：

```text
instance
 └─ organization
     └─ space
         └─ project
```

规则：

* 上层权限可向下继承
* 下层权限不得反向提升
* 插件权限必须声明其最小 Scope

---

## 2. 权限模型抽象（Model‑Agnostic）

Nebula **不强制** 具体模型（RBAC / ABAC），但强制以下抽象：

### 2.1 权限三要素

```text
Subject  → 谁在请求
Action   → 想做什么
Resource → 对什么做
```

任何模型都必须能映射到该三元组。

---

### 2.2 Capability 定义

Capability 是系统可裁决的最小授权单元：

```text
resource : action : scope
```

示例：

* `content:read:space`
* `content:write:space`
* `order:refund:store`
* `plugin:event:emit:self`

**Scope 不是上下文参数，而是权限语义本身。**

---

### 2.3 多租户是第一等公民

所有权限裁决 **必须显式绑定**：

* Tenant
* Workspace / Space

禁止：

* 默认全局权限
* 跨租户隐式授权

---

## 3. Core 权限模型（Core Permissions）

### 3.1 Core 权限的定义权

* Core 拥有所有 **基础能力权限** 的定义权
* Core 权限由系统版本控制

示例：

```ts
core.permissions = [
  'space.read',
  'space.write',
  'content.create',
  'content.publish',
  'plugin.manage'
];
```

插件 **不得**：

* 删除 Core 权限
* 修改 Core 权限语义
* 将 Core 权限绑定到插件生命周期

---

## 4. 插件权限模型（Plugin Permissions）

### 4.1 插件可以定义权限，但有严格限制

```md
- Plugins may declare permissions
- Plugin permissions must be namespaced
- Plugin permissions never affect core authorization
```

---

### 4.2 插件权限命名规范（强制）

```text
plugin:{pluginId}:{action}
```

示例：

* `plugin:nebula-seo:settings.read`
* `plugin:nebula-seo:settings.write`

规则：

* 插件权限 **不得** 使用非 plugin 命名空间
* 插件权限 **不得** 覆盖 Core 权限

---

### 4.3 插件权限声明方式

插件必须在 manifest 中声明其权限：

```json
{
  "permissions": {
    "scope": "space",
    "definitions": [
      {
        "key": "settings.read",
        "description": "Read SEO settings"
      },
      {
        "key": "settings.write",
        "description": "Modify SEO settings"
      }
    ]
  }
}
```

> Core 在加载插件时进行校验，但不理解权限语义。

---

### 4.4 插件只能声明"需求"

插件 **必须显式声明**：

* 所需 Action
* 所需 Resource 类型

**声明 ≠ 授权。**

Core 可以：

* 全部拒绝
* 部分允许
* 按租户 / 空间裁决

插件 **不得假设** 声明一定会被批准。

---

## 5. 权限裁决唯一中心（Single Authority）

### 5.1 Core 是唯一裁决者

* 所有 `allow / deny` 必须发生在 Core

插件：

* 不得缓存权限结果
* 不得复写权限逻辑
* 不得绕过权限校验

---

### 5.2 Plugin 的权限地位

> 插件在权限体系中 **永远是"被审查对象"**。

插件只能：

* 声明自己"需要什么"
* 接受 Core 的裁决

插件不能：

* 授权自己
* 授权其他插件

---

### 5.3 权限校验必须发生在执行边界

所有以下边界 **必须触发权限裁决**：

* API / Service 调用
* Event 派发
* Hook 执行
* 数据访问（CRUD）
* 外部网络 / 文件 / 系统资源访问

插件内部逻辑 **不被信任**。

---

## 6. 权限与 Hook / Runtime 的关系

### 6.1 执行前裁决原则

* 权限判断发生在 Hook / Runtime 之前
* Runtime 不进行权限判断
* Runtime 不提升权限

---

### 6.2 Hook 不等于授权

* 能被 Hook 调用 ≠ 有权限
* Hook 只代表"时机允许"

---

### 6.3 Event / Hook 必须二次裁决

即使：

* 插件 A 触发事件
* 插件 B 已声明监听

系统仍需校验：

> 插件 B 是否有权处理该事件

---

## 7. 角色与权限分配（Roles & Assignment）

### 7.1 Role is a Mapping, Not Authority

* Role ≠ 权限本体
* Role = Capability 集合

示例：

* `Editor` → `content:read/write:space`
* `Admin` → 多个 capability 的组合

插件 **不得假设某个 Role 存在**。

---

### 7.2 Core 角色

* Core 内置角色（如 Owner / Admin / Editor）
* 角色与 Core 权限绑定

插件 **不得**：

* 修改 Core 角色
* 默认向 Core 角色注入插件权限

---

### 7.3 插件角色（可选）

插件 **可以** 定义私有角色：

```md
- Plugin roles are isolated
- Plugin roles cannot include core permissions
- Plugin roles are deleted with the plugin
```

---

## 8. 用户 / 系统 / 插件权限区分

### 8.1 用户权限

* 来自：角色 / 策略
* 绑定：Tenant / Workspace

---

### 8.2 系统权限

* Core 内部使用
* 不可暴露给插件

---

### 8.3 插件权限

> 插件 **没有主体身份（No Principal）**。

插件：

* 只能在"代用户 / 代系统"上下文中执行
* 永远不能独立持权

---

## 9. 权限生命周期（Lifecycle & Revocation）

### 9.1 插件卸载时

* 所有插件权限立即失效
* 所有插件角色被删除
* 不影响 Core 权限与角色

---

### 9.2 插件禁用时

* 插件权限不可用
* 权限分配记录保留
* 重新启用后可恢复

---

## 10. 权限失败语义（Failure Semantics）

* 权限拒绝：明确失败、不降级
* 插件不得：捕获后假装成功、转换为其他行为

Decision (Allow / Deny) 是 **终止语义**。

---

## 11. 审计与可追溯性

Core **必须**：

* 记录关键权限裁决
* 标注：请求者、插件 ID、Tenant

插件：

* 不得篡改审计结果

---

## 12. OSS 与 SaaS 权限差异

### 12.1 同一语义

* SaaS 与 Self-hosted 使用同一权限语义
* 差异只能来自 **配置**，不能来自 **代码分支**

---

### 12.2 能力对比

| 能力    | OSS  | SaaS  |
| ----- | ---- | ----- |
| 自定义角色 | 完全开放 | 可能受限  |
| 插件权限  | 全支持  | 全支持   |
| 高危权限  | 自行负责 | 平台可限制 |

> SaaS 平台拥有最终权限治理权。

---

## 13. 明确禁止（Hard Ban）

Nebula **明确禁止**：

* 插件内部实现权限系统
* 插件缓存 allow / deny
* 插件跨租户共享权限状态
* 插件通过配置逃避权限
* 插件动态修改权限图
* 插件共享权限定义
* 跨插件权限依赖

---

## 14. 演进与兼容性

### 14.1 新权限只新增，不破坏

* 插件权限必须显式适配新 Scope
* 权限 Contract 高于任何实现细节

---

### 14.2 权限语义变更

* 新权限类型：只能新增
* 权限语义变更：主版本升级

---

## 15. 明确非目标（Non-Goals）

Nebula v0.x **不承诺**：

* 插件动态修改权限图
* 插件共享权限定义
* 跨插件权限依赖

---

## 16. 设计宣言（写给未来的你）

> **权限不是"能不能做"，而是"谁敢做、谁负责"。**

> 权限不是"方便开发者的工具"，
> 而是"保护系统边界的法律"。

> 一个敢做插件市场的平台，
> 一定对权限体系极度保守。

这是 Nebula CMS 能同时支撑开源生态与商业平台的关键。

---

**本文件一经发布，即视为冻结（Frozen）。**

任何试图将权限下放给插件的行为，都属于 **架构性错误**。
