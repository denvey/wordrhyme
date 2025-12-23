# 变更：Nebula CMS MVP 核心实现

## 为什么 (Why)

Nebula CMS 目前仅以架构文档 (v0.1) 的形式存在。为了验证已冻结的架构契约并支持插件生态的发展，我们需要一个实现以下内容的 **最小可行性产品 (MVP)**：

1.  **核心系统启动 (Core System Bootstrap)** - 演示 `CORE_BOOTSTRAP_FLOW.md` 中定义的确定性启动流程。
2.  **插件生命周期管理 (Plugin Lifecycle Management)** - 通过至少一个参考插件验证插件契约。
3.  **权限内核 (Permission Kernel)** - 实现集中式授权模型。
4.  **多租户上下文 (Multi-tenant Context)** - 证明租户隔离按设计工作。
5.  **基础管理 UI (Basic Admin UI)** - 为插件 UI 集成提供宿主应用程序。

MVP 必须严格遵守所有已冻结的契约和治理文档。它的目的**不是**构建一个功能完整的 CMS，而是证明架构是可实现的且契约是正确的。

## 变更内容 (What Changes)

### 新能力 (所有均为新增)

- **core-bootstrap**: 遵循 `CORE_BOOTSTRAP_FLOW.md` 的系统初始化。
- **plugin-runtime**: 插件加载、生命周期管理和隔离。
- **plugin-assets**: 为插件 UI 提供安全的静态资源服务。
- **permission-kernel**: 集中式权限评估和执行。
- **multi-tenant-context**: 租户/工作区/用户上下文提供者。
- **admin-ui-host**: 基于 React + Rspack + Module Federation 2.0 的宿主应用程序。
- **plugin-api**: 插件公共 API 边界 (`@nebula/plugin-api`)。
- **database-schema**: 核心 PostgreSQL 模式 (Drizzle ORM)。
- **cluster-coordination**: 基于 Redis 的重载信号 (PM2 集成)。

### 实现范围

**后端 (NestJS + Fastify + tRPC)**:
- 具有确定性启动阶段 (1-7) 的核心内核。
- 使用 Zod 进行插件清单 (`manifest.json`) 扫描和验证。
- 能力注入系统 (Logger, Permission, Data Migrator)。
- 插件数据库迁移 (自动私有表设置)。
- 安全的插件静态资源服务 (用于 Module Federation 入口)。
- 权限服务 (基于能力的授权)。
- 上下文提供者 (租户、用户、语言区域、货币、时区)。
- 数据库模型 (仅限核心表 - 尚无插件数据)。
- 通过 PM2 实现的高速滚动重启机制。
- 用于类型安全客户端-服务器通信的 tRPC API 路由器。

**前端 (React + Rspack + Module Federation + shadcn/ui)**:
- 带有 shadcn/ui 组件的管理 UI 宿主应用程序。
- 扩展点注册中心 (侧边栏、设置页面)。
- 插件远程入口加载器 (Module Federation)。
- 基础布局 (页眉、侧边栏、内容区域)。
- 用于类型安全服务器调用的 tRPC 客户端。
- Tailwind CSS + shadcn/ui 实现一致的设计系统。

**开发者体验**:
- `@nebula/plugin-api` 包 (TypeScript 类型 + 运行时)。
- 参考插件示例 (演示生命周期 + UI 扩展)。
- 开发环境设置 (用于 Postgres + Redis 的 Docker Compose)。
- 插件脚手架 CLI (可选，可延后)。

**不属于 MVP 范围 (明确不在 MVP 中)**:
- ❌ 计费与市场 (延至 MVP 后)。
- ❌ 事件钩子 (延至 MVP 后)。
- ❌ 全球化运行时 (延后，使用 en-US + USD 默认值)。
- ❌ 可观测性仪表盘 (延后，仅日志)。
- ❌ 插件市场 UI。
- ❌ 高级权限 UI (仅 API + 硬编码管理员角色)。
- ❌ 内容建模 (CMS 特定功能)。
- ❌ API 网关 / 速率限制。

## 影响 (Impact)

### 受影响的规范 (新创建的规范)
所有规范均为**新增** (没有要修改的现有规范):

- `specs/core-bootstrap/spec.md` - 系统初始化要求
- `specs/plugin-runtime/spec.md` - 插件生命周期和加载
- `specs/permission-kernel/spec.md` - 授权模型
- `specs/multi-tenant-context/spec.md` - 上下文提供者
- `specs/admin-ui-host/spec.md` - 前端宿主应用程序
- `specs/plugin-api/spec.md` - 公共插件 API 契约
- `specs/database-schema/spec.md` - 核心数据模型
- `specs/cluster-coordination/spec.md` - 多节点重载

### 受影响的代码
所有代码均为**新增**:

- `apps/server/` - 后端应用程序
- `apps/admin/` - 前端应用程序
- `packages/plugin-api/` - 共享插件 API 包
- `packages/core/` - 核心领域逻辑 (如果需要)
- `examples/plugin-hello-world/` - 参考插件
- `infra/docker-compose.yml` - 本地开发环境
- `package.json` - Monorepo 设置 (pnpm workspaces 或 npm workspaces)

### 验证标准

如果满足以下条件，则认为 MVP 是**成功**的：

1. ✅ 系统按 `CORE_BOOTSTRAP_FLOW.md` 阶段确定性地启动。
2. ✅ 参考插件可以安装、启用、禁用、卸载。
3. ✅ 插件 UI 通过 Module Federation 出现在管理宿主中。
4. ✅ 权限检查阻止未经授权的能力访问。
5. ✅ 每个请求正确解析多租户上下文。
6. ✅ 当插件状态更改时，通过 PM2 实现滚动重载。
7. ✅ 所有治理契约均经过验证 (无违反项)。

### 破坏性变更

**无** - 这是第一个实现。所有契约保持冻结。

### 依赖项

**运行时**:
- Node.js 20+ (LTS)
- PostgreSQL 16+
- Redis 7+
- pnpm 9+ (包管理器)

**核心库**:
- NestJS + Fastify (后端框架)
- Drizzle ORM + drizzle-zod (数据库 + 自动生成模式)
- tRPC (类型安全 API)
- Zod (验证，从 Drizzle 自动生成用于数据库操作)
- React + Rspack (前端)
- Module Federation 2.0 (`@module-federation/enhanced`) (插件 UI 加载)
- shadcn/ui + Tailwind CSS 4.0 (UI 组件)

### 架构一致性

此 MVP 实现**必须**符合：

- ✅ `SYSTEM_INVARIANTS.md` - 所有宪法规则
- ✅ `CORE_DOMAIN_CONTRACT.md` - 核心边界执行
- ✅ `PLUGIN_CONTRACT.md` - 插件隔离和能力模型
- ✅ `CORE_BOOTSTRAP_FLOW.md` - 启动阶段排序
- ✅ `PERMISSION_GOVERNANCE.md` - 白名单授权模型
- ✅ `RUNTIME_GOVERNANCE.md` - 插件执行边界
- ✅ `DATA_MODEL_GOVERNANCE.md` - 核心与插件数据所有权

任何与其冲突的实现细节在定义上都是**无效**的。

---

**提案状态**: 待批准
**目标版本**: v0.1-alpha.1 (第一个实现)
**预计复杂度**: 高 (基础性工作，1 名开发人员约 3-4 周的工作量)
**风险级别**: 中 (架构验证，尚无生产用户)
