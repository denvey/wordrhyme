# Change: Unified Plugin Marketplace Governance

## Why

当前仓库中已经存在两类插件治理思路，但尚未在 OpenSpec 中正式统一：

- 一类是 **Shopify-style Platform Managed**：平台统一发布插件版本，运行时或发布流水线自动执行迁移，租户无感升级
- 另一类是 **WordPress-style Instance Managed**：插件安装/启用动作触发初始化和迁移，更适合私有部署或单实例环境

现状问题：

- 文档中同时出现“安装时迁移”和“启动时迁移”两种说法，缺少统一术语
- 代码已经明显偏向 Shopify-first，但设计意图其实是统一支持多种 scope / trigger strategy
- 未来若要建设插件市场，需要先统一治理模型，否则插件包分发、安装状态、迁移策略会继续漂移

## What Changes

- 正式定义 WordRhyme 的插件市场治理模型为 **Hybrid, Shopify-first**
- 明确 Plugin Contract / Plugin Package / Marketplace Registry 只有一套
- 明确插件差异主要来自：
  - `installationScope`
  - `migrationStrategy`
  - `upgradePolicy`
- 规定：
  - 多租户 SaaS 默认走 `Shopify-style Platform Managed`
  - 私有部署/单实例允许走 `WordPress-style Instance Managed`
- 将 WordPress-style 定义为统一插件契约下的 **instance/site-scoped governance mode**，而不是另一套独立架构
- 补充 plugin-runtime 规范，明确平台级、租户级、实例级的职责边界

## Impact

- Affected specs: `plugin-runtime`
- Affected docs:
  - `docs/PLUGIN_COMPATIBILITY_ROADMAP.md`
  - `docs/design.md`
  - `docs/architecture/PLUGIN_CONTRACT.md`（后续如采纳，可再同步）
- Affected implementation areas for follow-up:
  - `apps/server/src/plugins/plugin-manager.ts`
  - `apps/server/src/plugins/migration-service.ts`
  - `packages/db/src/schema/plugins.ts`
  - `packages/db/src/schema/plugin-migrations.ts`
- This change is primarily governance and architecture alignment; implementation can be phased separately
