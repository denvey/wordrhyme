# Change: Unify Plugin UI Extension Registration

## Why

当前插件 UI 扩展体系存在三个问题：

1. **重复注册**：同一个插件经常为同一组件注册多个 extension（如 email-resend 同时注册 `sidebar` + `settings_tab`，两者指向同一个 `SettingsPage`）。
2. **布局耦合**：插件开发者必须知道平台布局结构才能选择注册 `sidebar` / `settings_tab` / `dashboard_widget`。插件不应关心"在哪渲染"，只需声明"我提供什么"。
3. **两套体系未统一**：当前存在**页面级**扩展（`ExtensionPoint` enum）和已规划的**组件级**扩展（Cromwell Widget Slot 提案），两者独立设计，缺乏统一抽象。

行业参考：Grafana（expose + extension point）、Medusa（zone + defineWidgetConfig）、Shopify（target-based）均采用 **Slot & Fill** 模式实现细粒度 UI 注入，且支持一次注册多处消费。

## What Changes

### 1. 统一 Extension 注册模型

将现有的 discriminated union（`sidebar | settings_tab | dashboard_widget | header_action`）和 Cromwell 提案的 `admin.widgets[]` 统一为 **Slot-based Extension** 模型：

- 插件注册 `UIExtension`，声明 `slots[]`（目标插槽列表）+ 元数据（label/icon/order）+ 组件引用
- 每个 extension 可以同时出现在多个 slot 中（消除重复注册）
- 组件引用支持两种模式：直接引用（`component`）和延迟加载（`remoteComponent`）

### 2. `<PluginSlot>` 消费组件

Host 在 UI 中通过 `<PluginSlot name="slot.name" />` 声明插槽，自动从 Registry 获取匹配的 extensions 并渲染。支持 `inline | stack | tabs | grid` 四种布局模式。

### 3. 层级式 Slot 命名规范

采用 `{surface}.{page}.{area}` 层级命名（如 `article.editor.actions`、`settings.storage`、`dashboard.widgets`），支持通配符查询（`settings.*`）。

### 4. MF2.0 多入口按需加载

插件从单入口 `exposes: { './admin': ... }` 扩展为多入口，每个可注入组件独立 expose。`<PluginSlot>` 遇到 `remoteComponent` 时通过 MF2.0 `loadRemote()` 按需加载，不拉取整个插件 admin bundle。

### 5. Manifest 扩展

将 `admin.menus[]` 和 `admin.widgets[]` 统一为 `admin.extensions[]`，声明插件提供的所有 UI 扩展点及其目标 slot。

## Impact

- Affected specs: `admin-ui-host`, `plugin-api`
- Affected code:
  - `apps/admin/src/lib/extensions/` — Extension 类型重构、Registry 查询 API 改造
  - `apps/admin/src/components/` — 新增 `<PluginSlot>` 组件、改造消费端组件
  - `packages/plugin/src/manifest.ts` — Manifest schema 扩展 `admin.extensions[]`
  - `plugins/*/src/admin/index.tsx` — 迁移 3 个插件到新注册格式
  - `plugins/*/rsbuild.config.ts` — 扩展 `exposes` 为多入口
- Supersedes: `add-cromwell-inspired-enhancements` 中的 "Admin Widget Slot System"（第 2 项）
- No breaking changes to frozen contracts（插件仍通过 `@wordrhyme/plugin-api` 注册，Core 控制渲染位置）
- 项目未上线，直接迁移现有 3 个插件，无需兼容层
