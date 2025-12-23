# MVP 实现任务清单 (MVP Implementation Tasks)

> **原则**: 每个任务都应交付用户可见或可测试的进展。
> **顺序**: 任务按序排列，以尽可能支持并行工作。
> **验证**: 每个阶段都包含明确的验证标准。

---

## 阶段 1：项目基础 (可并行)

### 1.1 Monorepo 设置
- [ ] 1.1.1 初始化 pnpm workspace 结构。
- [ ] 1.1.2 为所有包配置 TypeScript (共享 tsconfig)。
- [ ] 1.1.3 设置 ESLint + Prettier (冻结契约：TypeScript 严格模式)。
- [ ] 1.1.4 创建 `packages/plugin-api` 包结构。
- [ ] 1.1.5 创建 `packages/shared` 包 (共享 Zod 模式、tRPC 类型)。
- [ ] 1.1.6 创建 `apps/server` NestJS 应用程序。
- [ ] 1.1.7 使用 Rspack 创建 `apps/admin` React 应用程序。
- [ ] 1.1.8 验证所有包是否构建成功 (`pnpm build`)。

**验证**: `pnpm install && pnpm build` 在所有工作区中均成功。

---

### 1.2 基础设施设置
- [ ] 1.2.1 创建 `docker-compose.yml` (PostgreSQL 16 + Redis 7)。
- [ ] 1.2.2 添加环境变量模板 (`.env.example`)。
- [ ] 1.2.3 在 `GETTING_STARTED.md` 中记录本地开发启动流程。
- [ ] 1.2.4 验证服务是否启动：`docker-compose up -d`。
- [ ] 1.2.5 测试从服务器应用的连接性。

**验证**: Docker 服务健康，服务器成功连接到 Postgres + Redis。

---

## 阶段 2：核心数据库模式与验证

### 2.1 Drizzle ORM 设置
- [ ] 2.1.1 安装 Drizzle ORM + postgres 驱动。
- [ ] 2.1.2 配置 Drizzle 模式目录 (`apps/server/src/db/schema/`)。
- [ ] 2.1.3 设置迁移工具 (drizzle-kit)。
- [ ] 2.1.4 创建数据库连接模块 (NestJS)。
- [ ] 2.1.5 安装 `drizzle-zod` 用于自动生成 Zod 模式。

**验证**: Drizzle 成功生成迁移。

---

### 2.2 核心表 (根据 DATA_MODEL_GOVERNANCE.md)
- [ ] 2.2.1 定义 `tenants` 表 (多租户根节点)。
- [ ] 2.2.2 定义 `workspaces` 表 (租户子作用域)。
- [ ] 2.2.3 定义 `users` 表 (身份，会话之后由 better-auth 处理)。
- [ ] 2.2.4 定义 `plugins` 表 (id, version, status, manifest JSONB)。
- [ ] 2.2.5 定义 `permissions` 表 (能力定义)。
- [ ] 2.2.6 定义 `role_permissions` 表 (角色 → 能力映射)。
- [ ] 2.2.7 定义 `user_roles` 表 (用户 → 角色 → 租户作用域)。
- [ ] 2.2.8 使用 `drizzle-zod` 生成 Zod 模式 (`createInsertSchema`, `createSelectSchema`)。
- [ ] 2.2.9 导出生成的模式供 tRPC 使用。
- [ ] 2.2.10 运行迁移并在数据库中验证模式。

**验证**: `pnpm db:migrate` 成功，表存在于 Postgres 中，Zod 模式自动生成。

---

## 阶段 3：核心启动实现 (串行)

### 3.1 内核与配置 (CORE_BOOTSTRAP_FLOW.md 第 1 阶段)
- [ ] 3.1.1 创建内核模块 (`apps/server/src/core/kernel/`)。
- [ ] 3.1.2 实现系统配置加载器 (环境变量、部署模式)。
- [ ] 3.1.3 实现内核状态机 (启动中 → 运行中 → 重载中)。
- [ ] 3.1.4 添加对内核状态的全局只读访问。

**验证**: 服务器启动，内核正确记录状态转换。

---

### 3.2 上下文提供者 (CORE_BOOTSTRAP_FLOW.md 第 2 阶段)
- [ ] 3.2.1 创建上下文模块 (`apps/server/src/core/context/`)。
- [ ] 3.2.2 实现 `TenantContextProvider` (请求 → 租户 ID)。
- [ ] 3.2.3 实现 `UserContextProvider` (请求 → 用户 ID，better-auth 的占位符)。
- [ ] 3.2.4 实现 `LocaleContextProvider` (默认: en-US)。
- [ ] 3.2.5 实现 `CurrencyContextProvider` (默认: USD)。
- [ ] 3.2.6 实现 `TimezoneContextProvider` (默认: UTC)。
- [ ] 3.2.7 在内核中注册所有提供者。

**验证**: 请求中间件正确提取上下文 (使用模拟租户进行测试)。

---

### 3.3 插件清单扫描 (CORE_BOOTSTRAP_FLOW.md 第 3 阶段)
- [ ] 3.3.1 创建插件加载器模块 (`apps/server/src/plugins/loader/`)。
- [ ] 3.3.2 为 `manifest.json` 验证创建 Zod 模式 (`packages/shared/schemas/manifest.ts`)。
- [ ] 3.3.3 实现清单扫描器 (扫描 `/plugins/*/manifest.json`)。
- [ ] 3.3.4 使用 Zod 模式验证清单 (pluginId, version, vendor, type, runtime, engines.nebula, capabilities, permissions, server, admin)。
- [ ] 3.3.5 实现静态资源映射 (安全地将 `/plugins/:pluginId/admin/*` 映射到磁盘)。
- [ ] 3.3.6 标记无效插件并记录审计信息。
- [ ] 3.3.7 在 `plugins` 表中存储插件元数据。

**验证**: 在 `/plugins/test/` 中放置测试 `manifest.json`，验证其已被扫描并验证。

---

### 3.4 插件依赖图 (CORE_BOOTSTRAP_FLOW.md 第 4 阶段)
- [ ] 3.4.1 实现依赖解析器 (核心版本 → engines.nebula)。
- [ ] 3.4.2 检测循环依赖 (如果发现则拒绝)。
- [ ] 3.4.3 自动禁用冲突的插件。
- [ ] 3.4.4 在启动时记录依赖图。

**验证**: 测试两个插件 (一个有效，一个版本错误)，验证错误的插件已被禁用。

---

### 3.5 能力初始化 (CORE_BOOTSTRAP_FLOW.md 第 5 阶段)
- [ ] 3.5.1 在 `@nebula/plugin-api` 中定义能力 (Capability) 接口。
- [ ] 3.5.2 实现日志能力 (Logger Capability)。
- [ ] 3.5.3 实现权限能力 (连接到权限内核)。
- [ ] 3.5.4 实现数据访问能力 (受限的读/写)。
- [ ] 3.5.5 按固定顺序注册能力 (Logger → Permission → Data)。
- [ ] 3.5.6 为插件创建能力注入系统。

**验证**: 插件可以访问声明的能力，未经声明的能力被阻止访问。

---

### 3.6 插件模块注册 (CORE_BOOTSTRAP_FLOW.md 第 6 阶段)
- [ ] 3.6.1 为插件服务器入口实现动态 `import()`。
- [ ] 3.6.2 将插件代码包装在 NestJS 模块中。
- [ ] 3.6.3 通过 Runtime Adapter 执行所有插件代码 (超时 + 并发限制)。
- [ ] 3.6.4 实现自动私有表迁移 (扫描 `/plugins/{id}/migrations`)。
- [ ] 3.6.5 调用 `onInstall` 生命周期钩子 (如果是首次安装)。
- [ ] 3.6.6 调用 `onEnable` 生命周期钩子。
- [ ] 3.6.7 处理插件错误而不使系统崩溃。
- [ ] 3.6.8 记录插件注册状态。

**验证**: 参考插件加载，生命周期钩子执行，错误被隔离。

---

### 3.7 HTTP 服务器启动 (CORE_BOOTSTRAP_FLOW.md 第 7 阶段)
- [ ] 3.7.1 启动 Fastify HTTP 服务器。
- [ ] 3.7.2 注册核心路由 (健康检查、插件状态 API)。
- [ ] 3.7.3 注册插件路由 (如果在清单中声明)。
- [ ] 3.7.4 将内核状态设置为 `running`。

**验证**: `curl http://localhost:3000/health` 返回 200，插件路由工作正常。

---

## 阶段 4：权限内核与 tRPC API (在 2.2 之后可并行)

### 4.1 权限服务
- [ ] 4.1.1 创建权限模块 (`apps/server/src/core/permission/`)。
- [ ] 4.1.2 实现 `can(user, capability, scope)` 方法。
- [ ] 4.1.3 实现白名单逻辑 (默认拒绝)。
- [ ] 4.1.4 查询 `user_roles` + `role_permissions` + 上下文。
- [ ] 4.1.5 添加权限缓存 (仅限内存、单个请求)。
- [ ] 4.1.6 为 NestJS 路由实现权限装饰器 (`@RequirePermission`)。

**验证**: 使用硬编码的管理员角色进行测试，验证能力检查是否工作。

---

### 4.2 插件权限 API
- [ ] 4.2.1 在 `@nebula/plugin-api` 中暴露权限能力。
- [ ] 4.2.2 插件通过 API 调用 `ctx.permissions.can(...)`。
- [ ] 4.2.3 插件无法绕过权限检查 (在加载器中强制执行)。

**验证**: 插件被拒绝访问未声明的能力。

---

### 4.3 tRPC 服务器设置
- [ ] 4.3.1 安装 tRPC 服务器库 (`@trpc/server`)。
- [ ] 4.3.2 创建 tRPC 上下文 (包含来自请求的租户、用户)。
- [ ] 4.3.3 在 NestJS 中创建 tRPC 路由器 (`apps/server/src/trpc/`)。
- [ ] 4.3.4 定义插件过程 (list, install, enable, disable, uninstall)。
- [ ] 4.3.5 使用来自 `drizzle-zod` 的自动生成 Zod 模式进行数据库操作。
- [ ] 4.3.6 为非数据库输入添加自定义 Zod 模式 (例如清单验证)。
- [ ] 4.3.7 导出用于客户端的路由器类型 (`AppRouter`)。
- [ ] 4.3.8 将 tRPC 端点添加到 Fastify (`/trpc`)。

**验证**: 测试 tRPC 端点，验证自动生成的 Zod 模式是否正确工作。

---

## 阶段 5：管理 UI 宿主 (在 1.1 之后可并行)

### 5.1 Rspack + Module Federation 2.0 设置
- [ ] 5.1.1 安装 Rspack + `@module-federation/enhanced` (MF 2.0)。
- [ ] 5.1.2 使用 `@module-federation/enhanced/rspack` 配置 Module Federation 2.0。
- [ ] 5.1.3 定义标准共享依赖项 (react, react-dom, lucide-react, shadcn 基础)。
- [ ] 5.1.4 安装 Tailwind CSS 4.0 + 通过 `@config` 指令配置。
- [ ] 5.1.5 安装 shadcn/ui CLI (`npx shadcn-ui@latest init`)。
- [ ] 5.1.6 添加核心 shadcn/ui 组件 (Button, Card, Tabs, Dialog 等)。
- [ ] 5.1.7 定义扩展点类型 (侧边栏、设置页面等)。
- [ ] 5.1.8 创建扩展点注册中心 (运行时插件 UI 加载器)。
- [ ] 5.1.9 测试静态远程入口 (模拟插件 UI)。

**验证**: 宿主应用通过 MF 2.0 加载并显示模拟远程组件。

---

### 5.2 基础布局与导航
- [ ] 5.2.1 使用 shadcn/ui 创建布局组件 (页眉、侧边栏、内容区域)。
- [ ] 5.2.2 创建侧边栏组件 (可通过插件条目扩展)。
- [ ] 5.2.3 创建设置页面容器 (使用 shadcn/ui Tabs 的可扩展标签页)。
- [ ] 5.2.4 实现客户端路由 (React Router)。
- [ ] 5.2.5 添加占位符“插件”页面 (列出已安装的插件)。
- [ ] 5.2.6 添加深色模式切换 (shadcn/ui 主题支持)。

**验证**: 管理 UI 渲染正常，导航正常工作，设置页面显示正常。

---

### 5.3 tRPC 客户端设置
- [ ] 5.3.1 安装 tRPC 客户端库 (`@trpc/client`, `@trpc/react-query`)。
- [ ] 5.3.2 创建 tRPC 客户端实例。
- [ ] 5.3.3 配置 TanStack Query 提供者 (tRPC React 必需)。
- [ ] 5.3.4 创建用于插件操作的 tRPC 钩子 (list, install, enable, disable)。
- [ ] 5.3.5 测试对服务器的 tRPC 调用 (例如获取插件列表)。

**验证**: 管理 UI 成功通过 tRPC 从服务器获取插件列表。

---

### 5.4 插件 UI 集成
- [ ] 5.4.1 从服务器 API 获取插件清单 (通过 tRPC)。
- [ ] 5.4.2 动态加载插件的 `RemoteEntry.js`。
- [ ] 5.4.3 注入插件侧边栏条目。
- [ ] 5.4.4 渲染插件设置页面标签页。
- [ ] 5.4.5 优雅地处理插件 UI 错误 (错误边界)。

**验证**: 参考插件的管理 UI 出现在侧边栏和设置中。

---

## 阶段 6：插件 API 包

### 6.1 TypeScript 类型
- [ ] 6.1.1 定义 `PluginContext` 接口 (能力、日志器等)。
- [ ] 6.1.2 定义 `PluginManifest` 模式。
- [ ] 6.1.3 定义能力接口 (Logger, Permission, Data)。
- [ ] 6.1.4 定义生命周期钩子签名 (`onInstall`, `onEnable` 等)。
- [ ] 6.1.5 从 `@nebula/plugin-api` 导出所有类型。

**验证**: 参考插件导入类型，TypeScript 编译无误。

---

### 6.2 运行时助手 (Helpers)
- [ ] 6.2.1 创建 `definePlugin(config)` 助手 (类型安全的插件定义)。
- [ ] 6.2.2 创建日志工具 (作用域限定为插件 ID)。
- [ ] 6.2.3 创建权限检查助手。
- [ ] 6.2.4 在 JSDoc 注释中记录 API。

**验证**: 参考插件成功使用助手。

---

## 阶段 7：参考插件 (Hello World)

### 7.1 后端插件
- [ ] 7.1.1 创建 `examples/plugin-hello-world` 目录。
- [ ] 7.1.2 编写 `manifest.json` 清单 (声明能力)。
- [ ] 7.1.3 实现服务器入口 (`src/server.ts`)。
- [ ] 7.1.4 实现生命周期钩子 (`onEnable` 记录 "Hello World")。
- [ ] 7.1.5 添加一个简单的 API 路由 (`GET /hello`)。
- [ ] 7.1.6 使用权限能力检查访问权限。

**验证**: 插件加载，记录消息，API 路由返回 200。

---

### 7.2 前端插件 UI
- [ ] 7.2.1 创建管理 UI 入口 (`src/admin.tsx`)。
- [ ] 7.2.2 通过 Rspack Module Federation 导出 RemoteEntry。
- [ ] 7.2.3 实现侧边栏条目组件。
- [ ] 7.2.4 实现设置页面标签页组件。
- [ ] 7.2.5 在宿主应用中构建并测试。

**验证**: 插件 UI 出现在管理侧边栏和设置中。

---

## 阶段 8：集群协调 (PM2 + Redis)

### 8.1 滚动重载机制
- [ ] 8.1.1 添加 PM2 配置 (`ecosystem.config.js`)。
- [ ] 8.1.2 实现 `RELOAD_APP` 信号的 Redis pub/sub 监听器。
- [ ] 8.1.3 在重载信号时触发优雅停机。
- [ ] 8.1.4 测试 PM2 滚动重载 (`pm2 reload all`)。
- [ ] 8.1.5 验证插件变更在重载后生效。

**验证**: 安装/启用插件 → Redis 广播 → PM2 重载 → 插件变为活跃状态。

---

### 8.2 插件安装端到端流程
- [ ] 8.2.1 创建插件安装 tRPC 过程 (`POST /trpc/plugin.install`)。
- [ ] 8.2.2 使用 Zod 验证输入 (文件上传、元数据)。
- [ ] 8.2.3 上传 ZIP，解压到 `/plugins/{pluginId}`。
- [ ] 8.2.4 使用 Zod 模式验证 `manifest.json`。
- [ ] 8.2.5 更新 `plugins` 表状态。
- [ ] 8.2.6 通过 Redis 广播 `RELOAD_APP`。
- [ ] 8.2.7 测试完整流程：上传 → 重载 → 插件活跃。

**验证**: 通过管理 UI 上传插件 ZIP，验证其在重载后加载。

---

## 阶段 9：测试与验证

### 9.1 契约合规性测试
- [ ] 9.1.1 测试：系统按 `CORE_BOOTSTRAP_FLOW` 阶段启动。
- [ ] 9.1.2 测试：插件隔离 (无法访问核心内部)。
- [ ] 9.1.3 测试：强制执行权限检查 (默认拒绝)。
- [ ] 9.1.4 测试：多租户上下文正确限定作用域。
- [ ] 9.1.5 测试：插件生命周期钩子按顺序执行。
- [ ] 9.1.6 测试：无效的插件清单被拒绝。

**验证**: 所有契约验证测试均通过。

---

### 9.2 集成测试
- [ ] 9.2.1 测试：安装 → 启用 → 禁用 → 卸载 插件。
- [ ] 9.2.2 测试：插件 UI 在管理宿主中加载。
- [ ] 9.2.3 测试：使用 PM2 的滚动重载。
- [ ] 9.2.4 测试：多个租户隔离。
- [ ] 9.2.5 测试：插件错误不会使系统崩溃。

**验证**: 所有集成测试均通过。

---

## 阶段 10：文档

### 10.1 开发者指南
- [ ] 10.1.1 编写 `GETTING_STARTED.md` (设置、运行、测试)。
- [ ] 10.1.2 编写 `PLUGIN_TUTORIAL.md` (分步构建插件)。
- [ ] 10.1.3 在 API 参考中记录 `@nebula/plugin-api`。
- [ ] 10.1.4 记录核心 API 端点 (插件安装、状态等)。
- [ ] 10.1.5 添加架构图 (可选，可使用 Mermaid)。

**验证**: 新开发者可以按照文档运行 MVP 并创建插件。

---

### 10.2 契约验证报告
- [ ] 10.2.1 创建合规性检查清单 (所有治理文档)。
- [ ] 10.2.2 验证实现是否符合 `SYSTEM_INVARIANTS.md`。
- [ ] 10.2.3 验证实现是否符合 `PLUGIN_CONTRACT.md`。
- [ ] 10.2.4 验证实现是否符合 `CORE_BOOTSTRAP_FLOW.md`。
- [ ] 10.2.5 记录任何偏差 (应为零偏差)。

**验证**: 合规性报告确认 100% 遵守契约。

---

## 依赖关系与并行化

**可以立即启动 (并行)**:
- 1.1 Monorepo 设置
- 1.2 基础设施设置
- 5.1 Rspack + Module Federation 设置

**串行依赖**:
- 2.x (数据库) 依赖于 1.1, 1.2
- 3.x (核心启动) 依赖于 2.x
- 4.x (权限) 依赖于 2.2 (表)
- 6.x (插件 API) 依赖于 3.5 (能力接口)
- 7.x (参考插件) 依赖于 6.x
- 8.x (集群) 依赖于 3.x, 7.x
- 9.x (测试) 依赖于以上所有阶段

**预计时间线 (1 名开发人员)**:
- 阶段 1-2：3-4 天
- 阶段 3：5-7 天 (核心启动较为复杂)
- 阶段 4：3-4 天
- 阶段 5：4-5 天
- 阶段 6-7：2-3 天
- 阶段 8：2-3 天
- 阶段 9-10：3-4 天

**总计**: 单个开发人员约 25-35 天 (4-5 周)
**两名开发人员**: 通过并行化约 15-20 天 (3-4 周)

---

**注意**: 所有任务必须针对冷冻的架构契约进行验证。任何偏差都需要修改提案并重新批准。
