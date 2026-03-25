## Why

插件 schema 目前需要重复手写 `plugin_<pluginId>_` 表名前缀以及 `organization_id` / `acl_tags` / `deny_tags` 等平台保留字段，容易产生重复劳动和 drift。现在已经切换到以 SQL migration 为唯一运行时来源，适合把“平台统一注入”的能力收敛到 schema 定义和构建注入层，而不是回到运行时 DDL 生成。

## What Changes

- 新增零配置插件表工厂，插件 schema 定义时不再手写 `pluginId`、表名前缀或策略字段。
- 为插件 server 构建注入来自 `manifest.json` 的 `pluginId` 常量，作为插件表工厂的唯一来源。
- 更新 `shop` 插件 schema 作为首个迁移示例，验证 drizzle-kit migration 仍可正常生成和消费。
- 更新插件开发文档，要求插件 schema 优先使用统一工厂而不是裸 `pgTable`。

## Capabilities

### New Capabilities
- `plugin-table-factory`: 为插件 schema 提供零配置表工厂，自动推导带前缀的物理表名并注入平台保留字段。

### Modified Capabilities
- `database-schema`: 插件 schema 的定义方式调整为通过统一表工厂生成，保留 SQL migrations 作为唯一运行时 schema authority。

## Impact

- `packages/db` 新增插件 schema helper 与导出。
- 插件 `tsup.config.ts` 需要注入构建期 `pluginId` 常量。
- `plugins/shop/src/shared/schema.ts` 需要迁移到新 helper。
- 插件开发文档与 OpenSpec 约束需要同步更新。
