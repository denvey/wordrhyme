# MVP 设计文档 (MVP Design Document)

## 上下文 (Context)

Nebula CMS 目前作为冻结的架构规范 (v0.1) 存在，尚无实现代码。MVP 必须证明：

1.  已冻结的契约是**可实现**且**正确**的
2.  插件隔离模型在实践中可行
3.  启动流程是确定性且可测试的
4.  Module Federation 2.0 可以支持插件 UI 集成

**利益相关者**:
- 核心开发团队 (验证架构)
- 插件作者 (需要稳定的 API 进行构建)
- 未来的 SaaS 运营商 (需要了解部署模型)

**约束**:
- 必须遵守所有已冻结的治理文档
- 不得引入契约范围之外的功能
- 必须使用指定的技术栈 (不提供备选方案)
- 必须具备生产级的代码质量 (而非原型质量)

---

## 目标 / 非目标 (Goals / Non-Goals)

### 目标

1.  **验证启动流程**: 证明 `CORE_BOOTSTRAP_FLOW.md` 阶段按顺序工作
2.  **验证插件契约**: 参考插件演示隔离和能力模型
3.  **验证权限模型**: 白名单授权与集中式内核工作正常
4.  **验证多租户**: 上下文提供者正确界定所有操作的范围
5.  **验证 UI 扩展**: Module Federation 在不与核心耦合的情况下加载插件 UI
6.  **验证滚动重载**: PM2 + Redis 实现插件变更的零停机

### 非目标

1.  ❌ 功能完备性 (无内容建模、无工作流、无 SEO)
2.  ❌ 生产部署 (无 CI/CD、无监控仪表盘、无备份)
3.  ❌ 市场 (无计费、无支付网关、无插件发现)
4.  ❌ 高级权限 UI (仅 API，硬编码管理员角色已足够)
5.  ❌ 日志之外的可观测性 (无指标、无追踪、无 APM)
6.  ❌ 全球化运行时 (默认为 en-US + USD，i18n 结构可稍后建立)

---

## 决定 (Decisions)

### 决定 1：Monorepo 结构

**选择**: 使用 pnpm workspaces，将 `apps/` 和 `packages/` 分开

**原因**:
- 插件 API 必须是一个独立的包 (插件导入它，而不是核心)
- Admin + Server 是不同的可部署项
- 支持共享 TypeScript 配置和工具

**考虑过的备选方案**:
- Multi-repo (由于增加了 MVP 范围内的协调开销而被拒绝)
- Rush/Nx (对于 MVP 范围来说属于过度设计)

**结构**:
```
wordrhyme/
├── apps/
│   ├── server/          # NestJS + Fastify 后端
│   └── admin/           # React + Rspack 前端
├── packages/
│   ├── plugin-api/      # @nebula/plugin-api (公共契约)
│   └── core/            # @nebula/core (内部，可选)
├── examples/
│   └── plugin-hello-world/
├── infra/
│   └── docker-compose.yml
└── pnpm-workspace.yaml
```

---

### 决定 2：数据库模式策略

**选择**: Drizzle ORM，配合显式模式文件 + 通过 `drizzle-zod` 自动生成 Zod 模式

**原因**:
- Drizzle 轻量级 (启动快，契约要求)
- 显式迁移避免隐式模式漂移
- TypeScript 原生 (查询的类型安全)
- **单一事实来源**: 数据库模式 → 自动生成 Zod 模式
- 消除手动模式重复 (无需单独定义 Zod)

**实现**:
```ts
// 1. 定义 Drizzle 模式
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  email: text('email').notNull(),
});

// 2. 自动生成 Zod 模式
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// 3. 在 tRPC 中使用
export const userRouter = router({
  create: publicProcedure
    .input(insertUserSchema)
    .mutation(({ input }) => db.insert(users).values(input)),
});
```

**考虑过的备选方案**:
- Prisma (由于启动较慢、过多的魔术 ORM 行为而被拒绝)
- TypeORM (由于过重的装饰器和隐藏的复杂性而被拒绝)
- Knex.js (由于级别太低、无类型安全而被拒绝)
- 手动 Zod 模式 (由于重复数据库模式、易出错而被拒绝)

**迁移策略**:
- 开发环境: `drizzle-kit generate` + 手动审查
- 生产环境: git 中的版本化迁移 (不自动应用)

---

### 决定 3：插件能力注入 (Plugin Capability Injection)

**选择**: 通过 NestJS 提供者进行依赖注入，作用域限定在插件上下文

**原因**:
- NestJS 已经使用了 DI (利用现有模式)
- 支持测试时的模拟 (mocking)
- 在注入时执行能力白名单

**实现**:
```ts
// 在插件加载器中
const pluginModule = await import(pluginEntry);
const capabilities = buildCapabilities(manifest.capabilities);
const pluginContext = {
  logger: capabilities.logger,
  permissions: permissionService, // 裁决器，不属于插件 capability
  data: capabilities.data,
};
pluginModule.onEnable(pluginContext); // 注入，而非全局
```

**考虑过的备选方案**:
- 全局单例 (违反隔离性)
- 手动工厂模式 (繁琐且易出错)

---

### 决定 4：插件 UI 加载策略

**选择**: **Module Federation 2.0**，使用运行时远程入口 URL

**原因**:
- 契约要求 (REFERENCE_ARCHITECTURE.md 指定了 MF 2.0)
- **Module Federation 2.0 相比 1.0 的改进**:
  - 更好的运行时性能 (优化的分块加载)
  - 增强的类型安全 (自动共享 TypeScript 类型)
  - 改进的错误处理
  - 原生支持现代构建工具 (Rspack, Vite)
- 真正的运行时隔离 (插件不打包宿主代码)
- 支持插件版本化 (可以加载多个版本)

**Module Federation 2.0 核心特性**:
- `@module-federation/enhanced` - 具有更好 DX 的现代运行时
- 类型安全的共享依赖项
- 具有更好错误边界的动态远程加载
- 内置对异步边界处理的支持

**实现**:
- 宿主定义扩展点: `registerExtension(point, component)`
- 插件清单包含 `admin.remoteEntry: "/admin/remoteEntry.js"`
- 宿主从服务器获取清单，在运行时加载远程内容
- 每个插件 UI 的错误边界 (隔离故障)
- 使用 `@module-federation/enhanced/rspack` 进行 Rspack 集成

**共享依赖项 (Shared Dependencies)**:
为了确保 UI 一致性并避免运行时错误，宿主必须共享：
- `react`, `react-dom`
- `lucide-react`
- `@nebula/plugin-api` (运行时上下文所必需)
- 基础 CSS 变量和主题令牌 (Tailwind/shadcn 基础)

---

### 决定 5：插件静态资源服务

**选择**: Fastify 静态文件服务器，具有动态路由映射

**原因**:
- Admin UI 宿主需要加载插件的 `remoteEntry.js` 和分块文件。
- 服务器必须从 `/plugins/{pluginId}/dist/admin/` 目录提供这些文件。
- 安全：必须防止路径遍历 (例如 `../../etc/passwd`)。

**实现**:
- 路由: `/plugins/:pluginId/static/*`
- 解析器: 将 `:pluginId` 映射到经过验证的插件目录。
- 中间件: 设置性能缓存头。

---

### 决定 6：插件数据库迁移服务

**选择**: 核心迁移器，扫描并执行来自插件子目录的迁移。

**原因**:
- 插件可能需要私有表 (`plugin_{id}_*`)。
- `onInstall` 钩子是初始化数据的标准位置。
- 核心应提供迁移器实例以确保一致性和日志记录。

**实现**:
- 能力: 在 `onInstall` 中注入 `dbMigrator`。
- 引擎: 与核心设置兼容的 Drizzle 迁移。

---

### 决定 7：标准插件包布局 (Standard Plugin Package Layout)

**提案**: 为所有 Nebula 插件提供统一的目录结构。

**布局**:
```text
/plugins/{id}/
├── manifest.json       # 元数据与能力
├── dist/
│   ├── server.js       # 后端入口 (副作用/钩子)
│   └── admin/
│       └── remoteEntry.js # MF 2.0 入口
└── migrations/         # Drizzle 迁移文件
```

---

### 决定 8：权限作用域层级 (Permission Scope Hierarchy)

**选择**: 硬编码 租户 → 工作区 → 项目 层级 (面向未来的结构，MVP 中执行最少)

**原因**:
- 契约指定了 `实例 → 组织 → 空间 → 项目` (PERMISSION_GOVERNANCE.md)
- MVP 仅需要租户级隔离 (工作区/项目可以默认为 null)
- 数据库模式中已存在该结构 (已做好未来准备，无需返工)

**实现**:
```ts
interface PermissionScope {
  tenantId: string;
  workspaceId?: string; // MVP 中可为 null
  projectId?: string;   // MVP 中可为 null
}

can(user, capability, scope: PermissionScope): boolean
```

**考虑过的备选方案**:
- 扁平的仅限租户模型 (由于以后需要架构迁移而被拒绝)
- 全层级执行 (对于 MVP 来说过于沉重，没有工作区管理的 UI)

---

### 决定 9：滚动重载触发机制 (Rolling Reload Trigger Mechanism)

**选择**: 使用 Redis Pub/Sub 的 `RELOAD_APP` 频道，配合 PM2 优雅重载

**原因**:
- 集群协调已需要 Redis
- Pub/Sub 简单、可靠、低延迟
- PM2 内置优雅重载 (无需自定义进程管理)

**流程**:
1. 插件安装 API → 更新数据库 → 将 `RELOAD_APP` 发布到 Redis
2. 所有服务器节点订阅 `RELOAD_APP`
3. 收到消息时 → 触发 `pm2 reload <app-name>` (或者如果 PM2 自动重启则执行 `process.exit(0)`)
4. PM2 处理滚动重启 (一次重启一个实例，零停机)

---

### 决定 10：上下文解析策略 (Context Resolution Strategy)

**选择**: 使用 Async Local Storage (ALS) 处理请求限定的上下文

**原因**:
- Node.js 原生支持 (无依赖)
- 自动通过异步调用传播
- 避免在各处传递 `ctx` 参数

**实现**:
```ts
// 在 Fastify 中间件中
asyncLocalStorage.run(context, async () => {
  await next();
});

// 在请求生命周期的任何位置
const ctx = asyncLocalStorage.getStore();
console.log(ctx.tenantId, ctx.userId);
```

---

### 决定 11：Admin UI 状态管理

**选择**: MVP 不使用全局状态库 (仅使用 React Context + 本地状态)

**原因**:
- MVP 范围很小 (插件列表、设置 UI)
- 全局状态增加了复杂性，但无明显收益
- 可延至 MVP 后，待 UX 模式明确后再引入

---

### 决定 12：前后端通信 (tRPC)

**选择**: 使用 tRPC 处理 Admin UI 和服务器之间类型安全的 API 通信

**原因**:
- 端到端类型安全 (客户端/服务器共享 TypeScript 类型)
- 无需代码生成 (与 GraphQL 或 OpenAPI 不同)
- 出色的 DX (自动补全、编译时错误)
- 非常适合 monorepo 结构 (工作区中共享类型)
- 相比 REST 减少了样板代码

---

### 决定 13：数据验证 (Zod + Drizzle 集成)

**选择**: 使用 Zod 进行运行时验证 + 通过 `drizzle-zod` 从数据库模型自动生成模式

**原因**:
- 与 tRPC 无缝集成 (tRPC 使用 Zod 模式)
- **单一事实来源**: Drizzle 模式 → 自动生成 Zod 模式
- 无手动重复 (数据库模式同时定义数据库结构和验证)
- 插件清单验证 (自定义 Zod 模式，不来自数据库)
- 环境变量验证

---

### 决定 14：UI 组件库 (shadcn/ui + Tailwind CSS 4.0)

**选择**: 管理 UI 组件使用 shadcn/ui + Tailwind CSS 4.0

**原因**:
- 不是依赖项 (组件复制到代码库中，完全拥有所有权)
- 基于 Radix UI (无障碍、无样式组件)
- **Tailwind CSS 4.0** (最新版本，性能提升，原生 CSS 特性)
- 可自定义，无需对抗框架抽象
- 高质量的默认值 (缩短 MVP 实现时间)

---

### 决定 15：插件清单文件名

**选择**: `manifest.json` (而不是 `plugin.json`)

**原因**:
- 行业标准 (Chrome 扩展、VS Code 扩展都使用 `manifest.json`)
- 更具描述性 (明确是清单，而不只是配置)
- 符合生态系统惯例

---

## 风险 / 权衡 (Risks / Trade-offs)

### 风险 1：Module Federation 浏览器兼容性
- **风险**: MF 2.0 在旧版浏览器 (Safari, 移动端) 中可能存在边缘情况。
- **缓解**: 记录要求的浏览器版本 (Chrome 90+, Firefox 88+, Safari 14+)。在所有目标浏览器中测试参考插件。
- **权衡**: 在 MVP 中接受有限的浏览器支持 (以后可以添加 polyfill)。

### 风险 2：Drizzle ORM 成熟度
- **风险**: Drizzle 比 Prisma/TypeORM 晚，资源可能较少。
- **缓解**: 仅使用稳定的 Drizzle 特性 (基础 CRUD, 迁移)。保持核心查询简单。
- **权衡**: 更快的启动速度 vs 系统成熟度 (对于 MVP 是可以接受的)。

### 风险 3：插件安全 (不受信任的代码)
- **风险**: MVP 假设为“受信任的插件” (RUNTIME_GOVERNANCE.md 明确指出 v0.x 不做 VM 隔离)。
- **缓解**: 明确记录：**MVP 不适用于不受信任的插件**。为未来的沙箱 (WASM, 工作线程) 添加 TODO。
- **权衡**: 安全 vs 复杂度 (按照契约推迟到 v1.x)。

### 风险 4：开发环境对 PM2 的依赖
- **风险**: 开发者可能不想在本地运行 PM2。
- **缓解**: 支持两种模式：`pnpm dev` (不使用 PM2) 和生产模式 (测试滚动重载)。
- **权衡**: DX 灵活性 vs 生产一致性。

---

## 迁移计划 (Migration Plan)
**不适用** - 这是第一个实现。

---

## 开放问题 (Open Questions)

### Q1：身份验证集成时机
**选项**: 1. 完整集成 better-auth。 2. 数据库中硬编码管理员用户。
**建议**: **选项 2**。身份验证不在 MVP 验证范围内。

### Q2：插件 API 版本控制
**选项**: 1. 与核心版本相同。 2. 独立版本控制。
**建议**: **选项 1**。MVP 阶段更简单。

### Q3：插件存储位置
**选项**: 1. 硬编码 `/plugins`。 2. 通过环境变量配置。
**建议**: **选项 2**。支持 Docker 卷挂载。

---

## 实现说明 (Implementation Notes)

### 代码质量标准
- TypeScript 严格模式。
- 必须修复 ESLint 错误。
- 核心模块必须有 JSDoc 注释。

### 测试要求
- 权限检查的单元测试。
- 插件生命周期的集成测试。
- 手动测试：参考插件在 Admin UI 中加载，PM2 滚动重载正常。

---

## 成功标准清单

如果实现可以演示以下内容，则 MVP 设计是成功的：
- ✅ 服务器按所有 7 个 `CORE_BOOTSTRAP_FLOW` 阶段启动。
- ✅ 参考插件安装、启用、禁用、卸载。
- ✅ 参考插件 UI 出现在管理侧边栏。
- ✅ 权限检查阻止未经授权的能力访问。
- ✅ 多租户上下文隔离租户。
- ✅ 滚动重载工作。
- ✅ 无治理契约违反。

---

**设计状态**: 随提案等待审批
**最后更新**: 2025-12-22
**作者**: Claude Code (AI 辅助架构验证)
