# Nebula CMS — Plugin Data Governance Contract (v0.1)

> 本文档定义 **Nebula CMS 插件数据的所有权、生命周期、治理与合规规则**。
>
> 这是一份 **系统级强约束（Hard Contract）**，适用于：
>
> * Core 实现
> * 官方插件
> * 第三方插件
> * 插件市场（Marketplace）
> * OSS 与 SaaS 两种运行形态

---

## 1. 核心原则（Data Invariants）

以下原则 **不可被任何插件或实现破坏**：

1. **Core 不理解插件数据语义**
2. **插件数据必须可识别、可隔离、可治理**
3. **插件卸载不能破坏 Core 的一致性**
4. **插件必须声明其数据策略（显式优于隐式）**

> 插件数据是 *可存在的*，但永远不是 *隐形的*。

---

## 2. 数据所有权模型（Data Ownership）

### 2.1 所有权定义

```md
- Plugin owns its data
- Core owns the storage platform
- End user owns the business meaning of data
```

解释：

* **插件**：负责定义、读写、迁移、清理其数据
* **Core**：只保证数据被安全存储、隔离、可审计
* **最终用户**：拥有业务使用权与合规责任

Core **不得假设** 插件数据的结构或用途。

---

## 3. 插件数据类型（Data Categories）

插件数据被明确划分为三类：

### 3.1 配置数据（Configuration Data）

* 插件设置
* 功能开关
* API Keys / Token（需加密）

特点：

* 体积小
* 可导出
* 与实例/空间强绑定

---

### 3.2 业务扩展数据（Extension Data）

* 内容附加字段
* 元数据（metadata）
* 行为记录

推荐存储方式：

```sql
plugin_data (
  plugin_id TEXT,
  scope TEXT,          -- instance | space | project
  entity_type TEXT,
  entity_id TEXT,
  data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (plugin_id, scope, entity_type, entity_id)
)
```

---

### 3.3 插件私有业务数据（Private Tables）

* 插件可创建**独立表**
* 表名必须以 `plugin_{pluginId}_*` 命名

限制：

* ❌ 不得修改 Core 表
* ❌ 不得向 Core 表添加外键
* ❌ 不得假设 Core 内部事务边界

---

## 4. 数据作用域（Data Scope）

插件 **必须** 明确声明其数据作用域：

```ts
type DataScope = 'instance' | 'space' | 'project';
```

规则：

* `instance`：整个 Nebula 部署
* `space`：多租户隔离单元
* `project`：空间内子单元

> 插件不得跨 Scope 读取或写入数据。

---

## 5. 插件卸载与数据保留策略（Retention Policy）

### 5.1 强制声明

每个插件 **必须** 在 manifest 中声明：

```json
{
  "dataRetention": {
    "onDisable": "keep",
    "onUninstall": "prompt"
  }
}
```

可选策略：

| 策略          | 含义       |
| ----------- | -------- |
| keep        | 保留所有数据   |
| soft-delete | 标记删除，可恢复 |
| hard-delete | 永久删除     |
| prompt      | 由管理员确认   |

---

### 5.2 Core 行为约束

* Core **不得自动删除插件数据**
* Core **必须** 在卸载前提示管理员
* 插件卸载失败 ≠ 数据立即删除

---

## 6. 插件升级与数据迁移（Migration）

### 6.1 插件责任

* 插件必须对其数据向前兼容
* 插件升级可包含 migration step

```ts
onUpgrade?(from: string, to: string): Promise<void>;
```

### 6.2 Core 责任

* Core 只保证 migration 在受控事务内执行
* Core 不校验插件数据正确性

---

## 7. 插件市场与数据治理（Marketplace Rules）

市场插件 **额外遵守** 以下规则：

* 必须声明数据类型与用途
* 必须支持至少一种导出方式（如 JSON）
* 插件下架后：

  * 已安装实例可继续运行
  * 不得强制删除用户数据

---

## 8. OSS 与 SaaS 差异边界

| 能力   | OSS  | SaaS     |
| ---- | ---- | -------- |
| 自定义表 | ✅    | ⚠️（可能受限） |
| 数据导出 | 插件自定 | 平台强制支持   |
| 合规审计 | 自行负责 | 平台介入     |

> SaaS 环境下，平台拥有最终合规裁量权。

---

## 9. 安全与合规（Security & Compliance）

* 插件必须声明访问的数据范围
* 插件不得私自采集未声明数据
* Core 可：

  * 限制插件数据访问
  * 冻结违规插件
  * 下架恶意插件

---

## 10. 明确非目标（Non‑Goals）

Nebula v0.x **不承诺**：

* 插件数据自动跨实例迁移
* 插件数据语义校验
* 插件级数据恢复保证

---

## 11. 演进策略（Forward Compatibility）

* 新的数据能力只新增，不破坏
* 已声明 retention policy 不得被强制更改
* 插件必须显式适配新规则

---

> **插件可以扩展系统，但不能污染系统。**
>
> 这是 Nebula CMS 插件生态能够长期存活的前提。
