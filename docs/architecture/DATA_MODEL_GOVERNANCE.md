# Data Model Governance (冻结文档)

> 本文档定义 **Nebula CMS 的数据模型治理与不可变边界（Hard Data Contract）**。
>
> 目标：
>
> * 防止 Core / Plugin / SaaS 之间形成数据层耦合
> * 保证插件可卸载、可升级、可组合
> * 为多租户 / 多语言 / 多币种 / 商业化提供长期安全的数据基础
> * 避免 1–3 年后的数据返工与迁移灾难

---

## 0. 核心原则（Non‑Negotiable Invariants）

1. **Core Schema 是系统主权数据，插件永远不能修改**
2. **插件数据必须是可识别、可隔离、可回收的**
3. **任何数据扩展都必须有明确 ownership**
4. **数据模型必须先于实现冻结**
5. **SaaS 与开源本地部署使用同一数据契约**

> ❗ 数据治理失败，系统必死；功能失败，只是慢。

---

## 1. 数据层分区模型（Data Zone Model）

Nebula CMS 的数据层被严格划分为四个 Zone：

```text
┌──────────────────────────────┐
│ Core Domain Data             │  ← 系统主权
├──────────────────────────────┤
│ Extension Data (Shared)      │  ← 受控扩展
├──────────────────────────────┤
│ Plugin Private Data          │  ← 插件私有
├──────────────────────────────┤
│ Runtime / Derived Data       │  ← 可丢弃
└──────────────────────────────┘
```

### 1.1 Core Domain Data（核心域数据）

* 由 Core 定义、迁移、升级
* 代表系统事实（Source of Truth）

示例：

* users
* tenants / spaces
* content / entities
* permissions / roles
* subscriptions / plans

**插件规则：**

* ❌ 禁止修改
* ❌ 禁止加字段
* ❌ 禁止外键依赖
* ❌ 禁止触发器

---

### 1.2 Extension Data（共享扩展数据）

用于插件 **扩展 Core 实体**，但不破坏 Core Schema。

#### 推荐模型：plugin_data

```sql
plugin_data (
  tenant_id TEXT,
  plugin_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  locale TEXT NULL,
  data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (tenant_id, plugin_id, entity_type, entity_id, locale)
)
```

**特性：**

* tenant 隔离
* plugin 明确 ownership
* 支持多语言
* 可整体回收

**适用场景：**

* SEO 数据
* 自定义字段
* 插件元信息

---

### 1.3 Plugin Private Data（插件私有数据）

插件 **允许拥有完全私有的数据表**，但必须满足治理约束。

#### 强制规则

* 表名必须带插件前缀

  * `plugin_<plugin_id>_*`
* 必须声明 migration
* 禁止与 Core 表建立外键
* 必须支持 tenant_id

#### Ownership

| 事项        | 责任方 |
| --------- | --- |
| Schema 设计 | 插件  |
| Migration | 插件  |
| 升级兼容      | 插件  |
| 数据清理      | 插件  |

Core **不保证插件私有数据的可用性或完整性**。

---

### 1.4 Runtime / Derived Data（运行时派生数据）

* Cache
* Index
* Search
* Analytics

**特征：**

* 可重建
* 不参与数据契约
* 不作为事实数据

---

## 2. 多租户数据隔离（Tenant Isolation）

### 2.1 强制 tenant_id

所有非 Core Runtime 数据：

* 必须包含 tenant_id
* 禁止跨 tenant 查询

### 2.2 插件禁止假设单租户

插件：

* ❌ 禁止使用全局唯一数据
* ❌ 禁止使用 singleton 表

---

## 3. 多语言 / 多币种在数据层的处理

### 3.1 语言（Locale）

规则：

* 不允许新增 `title_en / title_fr`
* 不允许插件自行定义语言列

推荐方式：

* JSON 结构
* 或 plugin_data + locale

```json
{
  "en-US": { "title": "Hello" },
  "fr-FR": { "title": "Bonjour" }
}
```

### 3.2 币种（Currency）

核心原则：

* 金额 ≠ 显示货币

规则：

* Core 存储基准金额（如 minor unit）
* 币种 & 汇率属于上下文

插件：

* ❌ 禁止硬编码币种
* ❌ 禁止自行换算

---

## 4. 插件数据生命周期（Lifecycle Governance）

### 4.1 安装

* 插件可创建私有表
* 插件可初始化 plugin_data

### 4.2 禁用

* 数据必须保留
* 禁止自动删除

### 4.3 卸载

插件必须声明：

```ts
onUninstall({ strategy: 'keep' | 'delete' })
```

Core 行为：

* delete → 删除 plugin_data + 私有表
* keep → 标记 orphaned

---

## 5. 数据升级与迁移原则

### 5.1 Core

* Core Migration 只影响 Core Schema
* 不感知插件表

### 5.2 Plugin

* 插件必须自带 migration
* 插件版本升级 = 数据契约升级

---

## 6. SaaS 与开源的一致性

**同一插件：**

* 本地安装
* SaaS 市场安装

必须：

* 使用相同数据模型
* 不依赖 SaaS 私有表

SaaS **只能**：

* 托管
* 隔离
* 计量

---

## 7. 禁止事项（Hard Ban List）

插件 **永远禁止**：

* 修改 Core 表
* 向 Core 表加字段
* 建立外键指向 Core
* 假设单租户
* 绕过 plugin_data

---

## 8. 未来演进策略

允许：

* 新 Extension Zone
* 新 Storage Engine
* 新 Index / Search

不允许：

* 破坏既有数据契约

---

> **数据模型是 Nebula CMS 的“骨架”。**
>
> 功能可以重写，UI 可以推倒，
> 但数据契约一旦破坏，系统就不再是同一个系统。
