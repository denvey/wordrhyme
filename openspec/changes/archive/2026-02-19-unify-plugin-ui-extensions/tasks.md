## 1. Foundation — 类型、Slot 白名单、辅助函数
- [x] 1.1 定义 `Target` discriminated union（`NavTarget | SettingsTarget | DashboardTarget | GenericTarget`）
- [x] 1.2 定义 `UIExtension` 接口（`targets: Target[]` + 身份/组件字段）、`SlotEntry`、`SlotContext`、`PluginRemoteModule`
- [x] 1.3 定义 `CORE_SLOTS` 常量 + `isValidSlot()` 校验函数
- [x] 1.4 实现辅助函数 `navExtension()`、`settingsExtension()`、`dashboardExtension()`、`multiSlotExtension()`，从 `@wordrhyme/plugin-api` 导出
- [x] 1.5 实现 `matchSlotPattern()` 通配符工具函数
- [x] 1.6 编写类型、辅助函数、slot 校验的单元测试

## 2. ExtensionRegistry 改造
- [x] 2.1 重写 `ExtensionRegistry`：双 Map（extensions + slotIndex）+ slotCache
- [x] 2.2 `register()` 时校验 slot 白名单（dev 抛错，prod warn + 跳过）
- [x] 2.3 `getBySlot()` 返回 `SlotEntry[]`（extension + matched target 对），按 `target.order` 排序
- [x] 2.4 `getBySlotPattern()` 通配符查询
- [x] 2.5 `unregisterPlugin()` 同时清理 `remoteComponentCache`
- [x] 2.6 `subscribe()` 签名适配 `useSyncExternalStore`
- [x] 2.7 删除 `ExtensionPoint` enum 和旧 discriminated union 类型
- [x] 2.8 编写 Registry 单元测试（slot 查询、通配符、缓存失效、引用稳定性、白名单拒绝）

## 3. `<PluginSlot>` 消费组件
- [x] 3.1 实现 `useSlotExtensions(slotName): SlotEntry[]`，使用 `useSyncExternalStore`
- [x] 3.2 实现 `<PluginSlot>` 组件（name、context、layout、renderItem、permissionFilter、fallback）
- [x] 3.3 实现 `RemoteComponent`：模块级 Map 缓存 React.lazy 实例
- [x] 3.4 实现两层 `PluginErrorBoundary`（slot 级 + per-extension 级，内层支持 retry）
- [x] 3.5 Suspense fallback 设 `min-height` 避免布局跳动
- [x] 3.6 编写 PluginSlot 测试（有 entry / 无 entry / 加载失败 / retry / 权限过滤 / renderItem）

## 4. plugin-loader 竞态保护
- [x] 4.1 `loadPlugins()` 接受 `AbortSignal`，每步操作前检查取消
- [x] 4.2 `PluginUILoader` cleanup：`controller.abort()` + 当前 manifests 引用清理
- [x] 4.3 编写竞态单元测试

## 5. Manifest Schema 更新
- [x] 5.1 定义 `targetSchema`（discriminatedUnion by slot）和 `adminExtensionSchema`
- [x] 5.2 在 `pluginManifestSchema` 中用 `admin.extensions[]` 替换 `admin.menus[]`
- [x] 5.3 更新 server 端安装逻辑：从 `extensions[].targets` 提取 nav 条目写入 `menus` 表
- [x] 5.4 编写 manifest 校验测试

## 6. 插件迁移（直接修改）
- [x] 6.1 迁移 storage-s3：`settingsExtension({ ... })`
- [x] 6.2 迁移 email-resend：`multiSlotExtension({ targets: [nav, settings] })`
- [x] 6.3 迁移 hello-world：`navExtension()` + `settingsExtension()`
- [x] 6.4 更新 3 个插件的 `manifest.json`

## 7. 消费端迁移
- [x] 7.1 `PluginSidebarExtensions.tsx`：`useSlotExtensions('nav.sidebar')` + `entry.target.path`
- [x] 7.2 `SystemSettings.tsx`：`useSlotExtensions('settings.plugin')` + `entry.extension.component`
- [x] 7.3 `PluginPage.tsx`：`useSlotExtensions('nav.sidebar')` 按 pluginId 过滤
- [x] 7.4 Dashboard 预留 `<PluginSlot name="dashboard.widgets" layout="grid" />`
- [x] 7.5 删除旧消费端过滤逻辑

## 8. MF2.0 多入口（可选）
- [ ] 8.1 rsbuild config helper 支持多 `exposes`
- [ ] 8.2 `plugin-loader.ts` 支持 `loadRemote('pluginName/ComponentName')`
- [ ] 8.3 编写集成测试

## 9. 文档更新
- [x] 9.1 更新 PLUGIN_TUTORIAL.md — 使用辅助函数注册 extensions
- [x] 9.2 更新 PLUGIN_DEVELOPMENT.md — 列出 CORE_SLOTS 及用途
