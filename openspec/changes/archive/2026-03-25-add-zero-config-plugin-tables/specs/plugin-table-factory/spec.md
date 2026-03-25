## ADDED Requirements

### Requirement: Plugin Table Factory
插件 schema 定义 SHALL 提供零配置表工厂，用于生成带插件前缀的物理表名，并自动注入平台保留字段。

#### Scenario: Plugin schema defines a business table
- **WHEN** 插件作者使用统一表工厂定义 `products` 这类插件表
- **THEN** 系统生成的物理表名 MUST 使用 `plugin_<normalized_plugin_id>_<short_name>` 格式
- **AND** 表定义 MUST 自动包含 `organization_id`、`acl_tags`、`deny_tags` 三个字段
- **AND** 插件作者 MUST 不需要在 schema 文件里手写 `pluginId`

### Requirement: Build-Time Plugin Id Injection
插件构建流程 SHALL 从插件 `manifest.json` 注入唯一 `pluginId` 常量，供插件表工厂在 schema 定义和 migration 生成阶段使用。

#### Scenario: Plugin server build resolves schema helper
- **WHEN** 插件 server 代码构建或 drizzle schema 被加载
- **THEN** 插件表工厂 MUST 能读取到与 `manifest.json.pluginId` 一致的构建期常量
- **AND** 缺少该常量时系统 MUST 明确报错

