## Context

当前插件表定义直接使用 `pgTable`，每张表都手写完整物理表名和平台保留字段。运行时 migration 已统一为 SQL 文件执行，不能再通过 migration runner 动态补列，否则会引入新装/升级路径不一致的问题。项目现有插件均通过 `manifest.json` 声明唯一 `pluginId`，而插件 server 构建统一使用 `tsup`，适合在构建时注入一个稳定常量供 schema helper 使用。

## Goals / Non-Goals

**Goals:**
- 插件 schema 定义时不手写 `pluginId` 和物理表名前缀。
- 所有插件表默认带上平台策略字段：`organizationId`、`aclTags`、`denyTags`。
- 保持 Drizzle schema + drizzle-kit SQL migrations 作为唯一 schema truth。
- 让插件作者的表定义写法尽量接近 `pgTable`。

**Non-Goals:**
- 本次不改动运行时 `ScopedDb` 的 tenant/LBAC 判定逻辑。
- 本次不批量迁移所有插件，只以 `shop` 作为示例接入。
- 本次不引入 migration 执行阶段 SQL 改写或 DDL 自动生成。

## Decisions

### 1. 在 `packages/db` 提供零配置 `pluginTable()` helper

新增面向插件 schema 的 `pluginTable(name, columns, extraConfig?)` helper，内部完成：
- 读取构建期注入的 `__WR_PLUGIN_ID__`
- 计算 `plugin_${normalizedPluginId}_${name}` 物理表名
- 合并平台保留字段：
  - `organizationId`
  - `aclTags`
  - `denyTags`
- 返回标准 `pgTable` 结果，保持 drizzle-kit 兼容

之所以不恢复 `schema-to-ddl`，是为了避免双重 schema authority；helper 层补列后，Drizzle schema 和最终 migration 仍然是一套来源。

### 2. 通过插件 `tsup.config.ts` 从 `manifest.json` 注入 `__WR_PLUGIN_ID__`

每个插件 server 构建读取本地 `manifest.json` 的 `pluginId`，并在 tsup/esbuild define 中注入 `__WR_PLUGIN_ID__`。这样：
- 插件作者不需要手写 `pluginId`
- schema helper 不需要运行时探测文件路径
- drizzle-kit 读取 schema 时也能解析同一常量

### 3. 平台策略字段默认全量注入

本次不把是否开启 policy 暴露给插件作者。原因是平台目标要求所有插件表都具备 policy 支撑能力，不能依赖开发者手工选择。后续如需区分“资源表 vs 技术表”的业务语义，应由更高层约束控制，而不是通过是否存在列来表达。

### 4. `shop` 先行迁移并保留 migration 兼容

`shop` 当前 schema 覆盖了资源表、关联表和从属表，足够验证 helper 的可行性。迁移方式为：
- schema 改为使用 `pluginTable`
- 保持列名不变
- 重新生成后续 migration（如有必要）
- 不回退现有 SQL migration runner

## Risks / Trade-offs

- [所有插件表都带策略字段，schema 更宽] → 由平台统一承担这一约束，换取零配置和一致性。
- [需要修改多个插件的构建配置] → 先覆盖 active 插件模板与 `shop`，后续逐步迁移其他插件。
- [构建期常量缺失会导致 schema helper 失败] → helper 在缺少 `__WR_PLUGIN_ID__` 时显式抛错，避免静默生成错误表名。
- [drizzle-kit 需要能解析常量] → 在插件 `drizzle.config.ts` 中同步 define/预加载环境，确保 schema 文件在生成时可读取注入值。

## Migration Plan

1. 在 `packages/db` 增加 `pluginTable()` 与相关工具导出。
2. 为插件 server 构建增加 `__WR_PLUGIN_ID__` 注入。
3. 迁移 `shop` schema 到新 helper，并验证 type-check / drizzle config。
4. 更新插件开发文档与规范。

回滚方式：
- 若 helper 方案不稳定，可回退 `shop` schema 与插件构建配置改动。
- 不修改已有 migration runner 语义，因此回滚范围局限于 schema helper 和构建常量注入。

## Open Questions

- 是否要为插件 `drizzle.config.ts` 也统一提供一个读取 `manifest.json` 的 helper，避免每个插件重复定义。
- 后续是否需要 lint 规则禁止插件 schema 直接裸用 `pgTable`。
