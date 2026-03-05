# Change: 重构 Infra Policy 为路径驱动 + Settings-Only 模式（v2）

## Why

当前 Infra Policy v1 使用 subject-based 识别模块 + 手动注册 resolver 的方式，存在以下问题：
- **公开路由无法自动处理**：publicProcedure 无 `permission.subject`，需手动调 `resolveEffectiveOrgId`
- **静默失效**：开发者忘写 `subject` 或忘注册 resolver 时不会报错
- **双注册负担**：需同时调 `registerInfraPolicyResolver()` + `registerInfraSubjects()`
- **Core/插件不统一**：Core 手动注册，插件需 manifest 声明 `tenantOverride`
- **与 Billing 系统重复**：两个系统都需要扫描路由结构

经多模型评估（Codex + Gemini 交叉验证），请求路径 `pluginApis.{pluginId}.{procedure}` 和 `{routerName}.{procedure}` 天然包含模块标识，不需要任何声明或注册。

## What Changes

### 后端
- **重写 `infra-policy-guard.ts`**：删除 resolver/subject 注册机制，新增 `getModuleFromPath()` 路径提取 + 纯 Settings 查询
- **更新 `trpc.ts` 全局 middleware**：从读 `meta.permission.subject` 改为读 `path` 参数（tRPC middleware 独立参数）
- **解决 switchToCustom 鸡蛋悖论**：新增 `BYPASS_PROCEDURES` 白名单，元操作不受自身 guard 拦截
- **清理 `currency.ts`**：移除所有注册代码，简化公开路由（Context Swap 已自动处理）
- **switchToCustom/resetToPlatform 设置 Settings 标记**：`infra.customized.{module}` 替代 DB 查询
- **Settings 初始化 fail-fast**：`assertSettingsReady()` 防止未初始化时 guard 静默失效
- **Admin UI 模块发现**：新增 `infraPolicy.listConfigurableModules` endpoint
- **Settings key 迁移脚本**：旧 key → 新 key，含一致性校验
- **RBAC 非标准 mutation 权限**：全导出到 Permission 注册表（显示 Name），管理员可配权限，未配走 Default Policy。开发者未声明的 procedure 标记 `source: 'pending'`（Admin UI 显示"⚠️ 待配置"）
- **统一 subject 概念**：RBAC 和 Billing 共用 `subject` 术语（共享 `meta.subject`，分叉时 `meta.permission.subject` / `meta.billing.subject`），废弃 `featureKey` 和 `group` 概念
- **三系统统一治理**：Infra Policy + RBAC + Billing 共享模块级默认配置（扁平 key：`infra.policy.{m}` / `rbac.module.{m}.subject` / `billing.module.{m}.subject`），统一优先级链
- **配置模板**：可选的批量初始化工具，用于首次部署或标准化环境，不是日常配置入口。模板 apply 逐条写入 Settings（无跨 key 事务），通过 dry-run + 幂等 + report 缓解
- **各系统独立配置页**：Infra Policy（平台设置）、RBAC（角色管理，已有）、Billing（计费管理→能力映射）各自独立配置，不在同一页面
- **CASL action 注册**：新增 `AUTO_CRUD_ACTION_META`，11 个 auto-crud actions 含 group/label/risk 元数据，启动时与 PermissionRegistry 一同初始化
- **Admin UI actions 分组**：11 个 actions 按语义分三组（基础/批量/数据），默认只展开基础组，高危操作橙色标识
- **resolveCapability 简化**：利用 SettingsService 内部 cascade（tenant→global→default），单次调用替代手动两步查询
- **租户级 Capability 覆盖**：RBAC 和 Billing 统一使用 `{dimension}.override.{path}` 的 tenant/global scope；Billing tenant scope 仅允许租户配自己安装的插件路径（写入层校验归属）
- **Sub-Billing（B2B2X 二次售卖）**：三类 Capability 来源（平台基础设施 / 平台插件 / 租户自装插件），Billing 网关按来源分流（双层 / 单层）；插件 Manifest 统一 Cache-Miss 模式（先查市场预扫描，没有则实时扫描）；Usage 单表 + scope 列
- **Drift Detection（漂移检测）**：四层防超卖保护（UI 过滤 → API 校验 → 漂移检测 → 运行时网关）；事件驱动检测（平台降级/插件卸载触发扫描）+ 启动全量扫描（治理漂移报告）
- **性能优化**：预计算 Capability 映射（写时计算，运行时零 I/O）；Usage 异步写入（队列 + 批量刷盘）；tenantPluginCache LRU 限制内存

### 数据模型
- 无数据库 schema 变更
- Settings key 格式变更：`infra.policy.{module}`、`rbac.module.{module}.subject`、`billing.module.{module}.subject`（global scope，各子系统独立存储）、`infra.customized.{module}`（tenant scope）
- 新增 Settings key：`rbac.override.{path}`（global/tenant scope）、`billing.override.{path}`（global scope 平台配 / tenant scope 租户配自己插件）、`billing.sub-billing.enabled`（tenant scope）、`billing.sub-plan.{planId}`（tenant scope）
- 新增 Settings key：`billing.resolved.{path}`（预计算 Capability 映射缓存，global/tenant scope）

## Impact
- Affected specs: multi-tenant-context（Context Swap 行为规范化）
- Affected code:
  - `apps/server/src/trpc/infra-policy-guard.ts` — 重写
  - `apps/server/src/trpc/trpc.ts` — middleware 更新
  - `apps/server/src/trpc/routers/currency.ts` — 清理注册代码
  - `apps/server/src/trpc/routers/infra-policy.ts` — Settings 标记 + 模块发现
  - `apps/server/src/trpc/trpc.module.ts` — Settings 初始化
- Governance docs: 无需修改
- 设计参考: `.claude/plans/infra-policy-auto.md`（完整设计文档）
