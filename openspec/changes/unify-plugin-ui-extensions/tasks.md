## 1. Foundation — UIExtension 类型与 Slot 常量
- [ ] 1.1 定义 `UIExtension` 接口（替代 discriminated union），包含 `slots[]`、元数据、`component` / `remoteComponent` 双模式
- [ ] 1.2 定义 slot-specific 类型辅助函数（`navExtension()`、`settingsExtension()`、`dashboardExtension()`），编译时约束字段
- [ ] 1.3 定义 `SLOT_NAMES` 常量（v0.x ~15 个核心 slot），含 TSDoc 说明每个 slot 的用途和 context 类型
- [ ] 1.4 实现 slot 命名校验工具函数（`isValidSlotName()`、`matchSlotPattern()`，支持通配符 `settings.*`）
- [ ] 1.5 为 `UIExtension`、slot 常量和辅助函数编写单元测试

## 2. ExtensionRegistry 改造
- [ ] 2.1 重写 `ExtensionRegistry`：双 Map 结构（extensions + slotIndex），新 API：`register()`、`getBySlot()`、`getBySlotPattern()`、`unregisterPlugin()`
- [ ] 2.2 实现 slot 查询结果缓存（`slotCache: Map`），变更时清除受影响缓存，保证 `useSyncExternalStore` 引用稳定性
- [ ] 2.3 `subscribe()` 签名适配 `useSyncExternalStore`：`subscribe(onStoreChange: () => void): () => void`
- [ ] 2.4 删除 `ExtensionPoint` enum 和旧 discriminated union 类型（`SidebarExtension`、`SettingsTabExtension` 等）
- [ ] 2.5 编写 Registry 单元测试（slot 查询、通配符匹配、多 slot 注册、缓存失效、引用稳定性）

## 3. `<PluginSlot>` 消费组件
- [ ] 3.1 实现 `useSlotExtensions(slotName)` Hook，使用 `useSyncExternalStore`
- [ ] 3.2 实现 `<PluginSlot>` 组件：`name`、`context`、`layout`、`renderItem`、`permissionFilter`、`fallback` props
- [ ] 3.3 实现 `RemoteComponent`：模块级 `Map` 缓存 `React.lazy` 实例，避免渲染路径中重复创建
- [ ] 3.4 实现两层 `PluginErrorBoundary`：外层 slot 级 + 内层 per-extension 级，内层支持 retry 按钮
- [ ] 3.5 Suspense fallback 设置 `min-height` 避免布局跳动
- [ ] 3.6 空 slot 渲染 `null`（不占据布局空间）
- [ ] 3.7 编写 `<PluginSlot>` 组件测试（有 extension / 无 extension / 加载失败 / retry / 权限过滤）

## 4. plugin-loader 竞态保护
- [ ] 4.1 `loadPlugins()` 接受 `AbortSignal`，每步操作前检查取消状态
- [ ] 4.2 `PluginUILoader` cleanup 使用 `AbortController.abort()` + 当前 manifests 引用清理
- [ ] 4.3 `unregisterPlugin()` 清理 `remoteComponentCache` 对应条目
- [ ] 4.4 编写加载竞态单元测试（卸载后不注册、并发加载不冲突）

## 5. Manifest Schema 更新
- [ ] 5.1 在 `pluginManifestSchema` 中用 `admin.extensions[]` 替换 `admin.menus[]`（Zod schema），包含 `id`、`slots`、`label`、`icon`、`order`、`component`、`remoteComponent`、`category`
- [ ] 5.2 更新 `PluginManifest` TypeScript 类型（自动从 Zod 推导）
- [ ] 5.3 编写 manifest 校验测试

## 6. 插件迁移（直接修改）
- [ ] 6.1 迁移 storage-s3：`settings_tab` → `settingsExtension({ ... })`
- [ ] 6.2 迁移 email-resend：`sidebar + settings_tab` → `navExtension()` + `settingsExtension()`（或合并为一个 UIExtension）
- [ ] 6.3 迁移 hello-world：`sidebar + settings_tab` → `navExtension()` + `settingsExtension()`
- [ ] 6.4 更新 3 个插件的 `manifest.json`：`admin.menus[]` → `admin.extensions[]`

## 7. 消费端迁移
- [ ] 7.1 `PluginSidebarExtensions.tsx`：使用 `<PluginSlot name="nav.sidebar" renderItem={...} />`
- [ ] 7.2 `SystemSettings.tsx`：使用 `useSlotExtensions('settings.plugin')` + 权限过滤
- [ ] 7.3 `PluginPage.tsx`：使用 `useSlotExtensions('nav.sidebar')` 按 pluginId 过滤
- [ ] 7.4 在 Dashboard 添加 `<PluginSlot name="dashboard.widgets" layout="grid" />`（预留，无 extension 时不渲染）
- [ ] 7.5 删除旧的消费端过滤逻辑（`extensions.filter(ext => ext.type === ...)`）

## 8. MF2.0 多入口支持（可选，组件级注入用）
- [ ] 8.1 在 `@wordrhyme/plugin` 的 rsbuild config helper 中支持多 `exposes` 声明
- [ ] 8.2 更新 `plugin-loader.ts` 支持 `loadRemote('pluginName/ComponentName')` 加载独立组件
- [ ] 8.3 编写 MF 多入口加载集成测试

## 9. 文档更新
- [ ] 9.1 更新 PLUGIN_TUTORIAL.md — 新插件使用 `UIExtension` + `slots[]` + 辅助函数注册
- [ ] 9.2 更新 PLUGIN_DEVELOPMENT.md — 列出所有可用 slot name 及其用途
