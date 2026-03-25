## Context

当前插件系统已经具备以下资产：

- 插件 Manifest / Lifecycle / Capability 的统一契约
- `plugin_instances` 与 `plugins` 两层状态模型
- `plugin_migrations` 迁移跟踪表
- `PluginMigrationService` 支持：
  - 手写 SQL
  - drizzle-kit generate 产物
- 现有实现已经偏向“启动时统一检查 migration”

但在设计层仍存在语义漂移：

- 早期设计中有“`onInstall` / `onEnable` 时执行迁移”的表述
- 后续设计与代码中又出现“每次启动检查 pending migration”的表述
- 尚未正式定义这些模式的统一抽象关系

## Goals

1. 明确 WordRhyme 的插件市场治理模型只有一套统一契约
2. 将 Shopify-style 与 WordPress-style 收敛为统一模型下的不同 scope / strategy
3. 为未来插件市场建立稳定的治理边界
4. 为后续实现改造提供清晰的目标状态

## Non-Goals

- 本 change 不要求一次性完成插件市场 UI
- 本 change 不引入新的 marketplace UI 或 registry service 实现

## Decisions

### 1. Plugin Contract 只有一套

**决策**：无论 SaaS、私有部署、单实例还是未来插件市场，插件包都遵循同一套 Contract：

- `manifest.json`
- `capabilities`
- lifecycle hooks
- `schema.ts`
- `migrations/`

**原因**：
- 避免为不同部署模式维护两套插件生态
- 保证插件市场、运行时、治理层共享同一个心智模型

### 2. Marketplace / Registry 只有一套

**决策**：插件来源统一由 marketplace / registry 管理，不因运行模式分裂为“SaaS 插件”和“站点插件”两套市场。

**原因**：
- 分发源统一，便于签名、审核、兼容性标记、版本治理
- 差异应体现在安装目标和升级策略，而不是插件包来源

### 3. WordPress-style 不是独立架构，而是 scope-specific governance mode

**决策**：将 WordPress-style 定义为统一插件契约下的实例/站点级治理模式，而不是单独的插件系统。

**表述**：
- Shopify-style = platform-managed scope
- WordPress-style = instance-managed or site-managed scope

**原因**：
- 设计意图本身就是统一，而不是平行维护两套机制
- 这能解释为什么仓库中同时存在“平台级统一迁移”和“安装时初始化”两类设计痕迹

### 4. 差异收敛为 Scope + Strategy

**决策**：未来插件系统的可变维度主要只有两类：

- `installationScope`
  - `platform`
  - `tenant`
  - `instance`
- `migrationStrategy`
  - `startup-managed`
  - `install-managed`
  - `deploy-managed`

**原因**：
- 避免代码到处出现 “if SaaS / if WordPress”
- 让不同部署模式成为配置和治理策略，而不是隐式分叉

### 5. 默认主路径为 Shopify-first

**决策**：多租户 SaaS 和官方插件市场默认采用 Shopify-style Platform Managed。

默认行为：
- 平台统一发布插件版本
- 运行时或发布流水线统一执行迁移
- 租户无须手动升级 schema
- 租户安装/卸载只控制 capability、菜单、权限、配置是否可见/可用

**原因**：
- 更适合插件市场和 SaaS 托管模型
- 更便于控制升级窗口、兼容性和治理

### 6. 保留 WordPress-style 作为兼容模式

**决策**：私有部署、单实例、实验环境保留 Instance Managed 模式。

典型行为：
- 插件首次安装触发初始化和迁移
- 管理员可显式控制升级时机
- 卸载时按 retention 策略处理数据

**原因**：
- 有利于支持私有部署和本地插件目录场景
- 与统一 Plugin Contract 不冲突

### 7. 当前运行时对齐目标采用 Instance-first Migration Base

**决策**：在当前代码基础上，优先将运行时明确收敛为：

- `pluginInstances`：实例级插件可用状态
- `plugins`：组织级安装/启用状态
- `pluginMigrations`：实例级 migration 执行记录

也就是说，默认实现路径为：

- schema 演进由实例负责
- tenant 只控制插件是否对该组织生效
- 业务数据仍通过插件表中的 `organization_id` 或 ScopedDb 实现租户隔离

**原因**：
- 当前 `PluginManager` 已按实例加载插件
- 当前 `pluginInstances` 本身就是实例级唯一约束
- 当前 `runMigrations()` 实际调用传入固定 `'default'`，实现上已经接近实例级语义
- 若继续保留“组织级 migration 记录”但运行时按实例触发，会持续制造语义冲突

**兼容说明**：
- 这不否定未来支持 tenant-scoped installation governance
- 但 tenant-scoped governance 不等于 tenant-scoped schema migration
- 在 SaaS 默认模型下，推荐“实例级 schema + 租户级可见性/激活”

### 8. 安装与启用职责分离

**决策**：在目标实现中，应显式区分三类动作：

- `load / startup`
  - 负责发现插件代码
  - 负责实例级 migration 检查
  - 负责将插件载入运行时
- `install / uninstall`
  - 负责组织级安装状态变更
  - 负责菜单、能力、配置的组织级注册或撤销
- `enable / disable`
  - 负责组织级激活状态
  - 不负责 schema 演进

**原因**：
- 避免 `enablePlugin()` 与 `runMigrations()` 语义混杂
- 更符合 Shopify-first 路径
- 也能保留私有部署下的 install-managed 扩展点

### 9. WordPress-style 作为策略层扩展，而不是默认实现分支

**决策**：若后续要支持 WordPress-style Instance Managed，应通过策略配置启用，而不是把它和默认 SaaS 路径混写在同一主逻辑中。

建议抽象：

- `installationScope`
- `migrationStrategy`
- `upgradePolicy`

并由 control plane 决定传给 runtime，而不是 runtime 内散落 `if (saaS)` / `if (wordpress)`。

**原因**：
- 降低后续插件市场规模化后的复杂度
- 保持默认路径稳定
- 私有部署能力可以演进，但不会污染平台主路径

## Target Model

### Control Plane

负责：

- registry / marketplace
- 插件版本元数据
- 兼容性检查
- installation scope
- upgrade policy
- migration policy

### Runtime

负责：

- 加载插件
- 执行 lifecycle hooks
- 执行迁移
- 注册路由、菜单、能力

### Data Plane

负责：

- 插件业务表
- 迁移版本记录
- 插件安装状态
- 配置与保留策略

## Current State vs Target State

### Current State

- 代码实现偏向 `startup-managed`
- `pluginInstances` 为实例级状态
- `plugins` 为组织级安装状态
- `plugin_migrations` 虽然有组织维度，但当前运行路径仍偏实例级使用
- `enablePlugin()` / `disablePlugin()` 已是运行时激活语义，但未与 migration 语义严格分离
- `uninstallPlugin()` 具备删表能力，但仍使用实例级固定 scope

### Target State

- 文档明确说明两类模式都受支持
- 默认运行时路径采用“实例级 schema 演进 + 组织级安装/激活”
- 运行时根据 `installationScope` 与 `migrationStrategy` 执行
- SaaS 默认平台托管升级
- 私有部署可切换为安装驱动升级

## Runtime Alignment Plan

### A. Data Model Alignment

目标语义：

- `plugin_instances`
  - 表示当前部署实例是否具备该插件代码与运行能力
- `plugins`
  - 表示某组织是否安装/启用了该插件
- `plugin_migrations`
  - 表示当前实例是否已执行该插件 migration

建议：

- **Phase 1（本 change 默认）**：保留 `plugin_migrations` 当前表结构，但将 `organizationId = 'default'` 明确定义为 **instance-scope migration owner**，不是 tenant
- **Phase 2（后续清理）**：在模型稳定后，再将该字段重命名或重构为更准确的实例级 owner 标识

原因：

- 当前运行时已经按实例加载插件并执行 migration
- 当前共享表模型下，schema 演进本质上是实例级职责，而不是租户级职责
- 若继续把 `'default'` 理解为 tenant，会误导后续实现把租户安装与 schema 演进混为一谈

### B. Runtime Flow Alignment

推荐默认流程：

1. 启动时扫描插件目录
2. 校验 manifest
3. 执行实例级 pending migrations
4. 注册运行时能力（router / hooks / modules）
5. 根据 `plugins` 表恢复组织级安装/启用状态
6. 按组织恢复菜单、权限、能力可见性

### C. Tenant Flow Alignment

组织级安装：

- 创建或更新 `plugins` 记录
- 注册菜单/能力/配置的组织级可见性
- 不重复执行 schema migration

组织级启用：

- 执行组织级 `onEnable` 语义
- 打开菜单与能力可见性
- 不负责 schema 变更

组织级禁用：

- 执行组织级 `onDisable` 语义
- 隐藏菜单与能力
- 不删除 schema

组织级卸载：

- 变更组织级安装状态
- 清理组织级菜单/能力配置
- 默认不删除实例级 schema；删表只应在 instance-managed 策略下执行

### D. Compatibility Strategy

对 WordPress-style 兼容模式：

- 允许 install-managed migration strategy
- 允许实例管理员在安装时触发 migration
- 但仍要求遵循统一 Plugin Contract

默认实现优先级：

1. Shopify-first path
2. Instance-managed compatibility path

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 文档说支持双模式，但代码暂未完整落地 | 在任务中显式区分 governance alignment 与 runtime implementation |
| Marketplace 与 Runtime 职责边界继续混乱 | 明确 Contract / Registry / Runtime 三层 |
| 双模式导致实现分叉 | 将差异收敛为 scope / strategy 配置，而不是散落条件分支 |
| 后续实现误以为需要两套插件包格式 | 明确 Plugin Package 只有一套 |
| 现有 `plugin_migrations.organizationId` 命名误导实现 | 在实现任务中明确重构或过渡语义说明 |
| 组织级卸载错误地删除实例级 schema | 将删表行为显式绑定到 strategy，而不是默认行为 |

## Open Questions

1. `tenant` scope 是否需要作为独立安装目标，还是仅保留 `platform` / `instance` 两层？
2. `plugin_migrations` 采用两阶段策略：短期保留现表结构并文档化 `'default'` 的 instance 语义；长期再做结构重命名清理
3. Marketplace registry 是否需要区分“官方托管插件”和“第三方插件”的数据权限级别？
4. 组织级 `onInstall` / `onUninstall` 是否应与实例级 `load / unload` 彻底拆分？
