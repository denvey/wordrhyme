# Change: Add Infrastructure Plugin Tenant Configuration Model

## Why

基础设施类插件（S3 存储、OAuth 登录、SMTP 邮件、Stripe 支付等）需要支持平台与租户的配置分离。当前实现中：

1. 插件配置要么全平台共享（`plugin_global`），要么租户各自配置（`plugin_tenant`），但缺少**平台对租户配置权的控制机制**
2. S3 等插件的配置 Tab 无法根据"平台是否允许租户覆盖"动态显示/隐藏
3. 插件 manifest 缺少基础设施配置模型声明，平台管理员无法在 UI 上控制租户配置策略
4. 敏感字段（如 S3 secretAccessKey）当前未加密存储

## What Changes

### 新增功能

- **Manifest infrastructure 声明**：插件通过顶层 `infrastructure` 字段（与 `dataRetention`、`notifications` 同级）声明支持租户覆盖配置，并通过 `sensitiveFields` 标注需要脱敏的字段
- **Platform Policy 机制**：平台管理员通过 `infra.policy` 设置控制租户配置行为，使用 discriminated enum `mode`：
  - `unified` — 统一使用平台配置（租户不可见）
  - `allow_override` — 允许租户覆盖（可选，默认用平台的）
  - `require_tenant` — 要求租户自配（平台不提供默认）
- **Settings 页面动态可见性**：前端根据 `visibility` + `infra.policy` 双重过滤决定插件 Tab 是否对租户可见
- **OverridableSettingsContainer 通用组件**：统一处理"继承/自定义"切换交互
- **双层 Policy API**：
  - `infraPolicy.*` — Core router，平台管理员完整 CRUD（读写 policy）
  - `infraPolicy.getVisibility(pluginId)` — 租户安全端点，仅返回 `{ mode, hasCustomConfig }` 最小化信息

### 数据模型变更

- `plugin_global` scope 新增 `infra.policy` key（策略控制面）
- `plugin_global` scope 的 `infra.config` key 存平台默认配置
- `plugin_tenant` scope 的 `infra.config` key 存租户覆盖配置
- 敏感字段强制加密存储

### API 变更

- 新增 Core tRPC router `infraPolicy`：
  - `infraPolicy.get(pluginId)` — 平台管理员读取完整策略
  - `infraPolicy.set(pluginId, policy)` — 平台管理员设置策略
  - `infraPolicy.getVisibility(pluginId)` — 租户安全端点，返回 `{ mode, hasCustomConfig }`
  - `infraPolicy.batchGetVisibility(pluginIds[])` — 批量获取，避免 N+1 请求
- 修改 `plugin.settings.set/get/delete` — 租户操作前前置 policy 校验

## Impact

### Affected Specs
- `plugin-api` — manifest schema 新增顶层 `infrastructure` 字段（含 `sensitiveFields`）
- `settings` — 新增策略驱动的配置解析规则
- `admin-ui-host` — Settings 页面动态过滤逻辑

### Affected Code
- `packages/plugin/src/manifest.ts` — 新增顶层 `infrastructure` schema（含 `sensitiveFields`）
- `apps/server/src/trpc/routers/infra-policy.ts` — 新增 `infraPolicy` Core router
- `packages/plugin/src/extension-helpers.ts` — `SettingsTarget.visibility` 已实现
- `apps/admin/src/lib/extensions/extension-types.ts` — `SettingsTarget.visibility` 已实现
- `apps/admin/src/pages/Settings.tsx` — 加入动态 policy 过滤
- `apps/server/src/plugins/capabilities/settings.capability.ts` — policy 前置校验
- `plugins/storage-s3/` — 迁移到新数据结构

### Dependencies
- 依赖已有的 Settings 系统（`plugin_tenant → plugin_global` cascade）
- 依赖已有的 UI Extension 系统（`SettingsTarget.visibility`）
