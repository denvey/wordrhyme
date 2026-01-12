# Change: Add Core Settings System

## Why

WordRhyme 目前缺少统一的配置管理系统，导致：
1. 所有配置硬编码在环境变量中，无法运行时调整
2. 插件无法存储私有配置，只能自己管理状态
3. 租户无法定制自己的配置（如 SMTP、AI 密钥等）
4. 无法实现功能开关（Feature Flags）进行灰度发布

配置系统是其他核心功能（文件系统、Webhook、Scheduler）的基础依赖。

## What Changes

### 新增功能
- **Settings 三层架构**：Global → Tenant → Plugin 配置层级
- **类型安全**：Schema 验证和默认值支持
- **敏感数据加密**：密码、密钥等加密存储
- **Feature Flags**：功能开关支持灰度发布和条件规则
- **审计日志**：配置变更追踪

### 数据库变更
- `settings` - 统一配置存储表
- `feature_flags` - 功能开关表
- `feature_flag_overrides` - 租户级功能开关覆盖

### API 端点
- `settings.get(scope, key)` - 获取配置值
- `settings.set(scope, key, value)` - 设置配置值
- `settings.list(scope)` - 列出配置项
- `settings.delete(scope, key)` - 删除配置
- `featureFlags.check(key, context)` - 检查功能是否启用
- `featureFlags.list()` - 列出功能开关

## Impact

### Affected Specs
- `database-schema` - 新增 settings 相关表
- `plugin-api` - 插件可访问 Settings API

### Affected Code
- `apps/server/src/db/schema/` - 新增 settings.ts, feature-flags.ts
- `apps/server/src/settings/` - 新增 SettingsModule
- `apps/server/src/trpc/routers/` - 新增 settingsRouter, featureFlagsRouter
- `packages/plugin/src/types.ts` - 扩展 PluginContext.settings

### Dependencies
- None (基础模块，无外部依赖)

### Migration
- 新表创建，无数据迁移
- 环境变量配置可逐步迁移到 Settings 系统
