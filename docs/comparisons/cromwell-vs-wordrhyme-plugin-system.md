# Cromwell vs WordRhyme 插件系统对比分析

> 对比日期：2026-02-11
> 对比对象：[Cromwell CMS](https://github.com/CromwellCMS/Cromwell) Plugin System vs WordRhyme Plugin System

---

## 一、Cromwell 插件架构概要

Cromwell 的插件系统是一个**面向 CMS 内容展示**的简单插件模型：

| 维度 | Cromwell |
|------|----------|
| **前端** | 3 个独立 bundle：`src/admin`（管理界面）、`src/frontend`（主题渲染）、`src/backend`（API 扩展）|
| **Admin 扩展** | `registerWidget()` 注册到固定槽位（Dashboard、PluginSettings、PostActions 等）|
| **后端扩展** | 导出 TypeGraphQL resolvers、NestJS controllers、TypeORM entities/migrations |
| **设置系统** | 两层：Plugin 全局设置（DB JSON）+ Instance 设置（每个放置实例独立配置）|
| **Hook 系统** | `registerAction()` 订阅预定义事件（`update_post`、`install_plugin` 等）|
| **前端集成** | `<CPlugin>` 组件 + Next.js SSG `getStaticProps`，支持多实例渲染 |
| **部署** | "Safe Reload" —— 新端口启动新实例，流量切换后杀掉旧进程 |
| **数据库迁移** | TypeORM migrations，需要为 SQLite/MySQL/Postgres 分别生成 |
| **构建工具** | Rollup（`cromwell.config.js` 配置）|

**Cromwell 的核心设计哲学**：插件是"可嵌入 CMS 页面的 React 组件"，后端是可选扩展。

---

## 二、WordRhyme 插件架构概要

WordRhyme 的插件系统是一个**面向企业级 SaaS**的能力驱动模型：

| 维度 | WordRhyme |
|------|-----------|
| **前端** | Module Federation 2.0，`admin.exposes` 暴露组件，Host 动态加载 |
| **Admin 扩展** | `extensions[]` 数组注册多种类型：`sidebar`、`settings_tab` 等 |
| **后端扩展** | 双模式：Simple（tRPC Router）+ Advanced（NestJS Module + DI）|
| **设置系统** | 4 层级联：`plugin_tenant → plugin_global → schema default → provided default` |
| **Hook 系统** | `ctx.hooks.addAction/addFilter`，支持优先级（0-100）和中止机制 |
| **能力系统** | 12+ 种能力（db、queue、notifications、files、assets、storage、metrics、trace、hooks...）|
| **隔离机制** | 命名空间 + 租户自动隔离 + 白名单权限 |
| **构建工具** | Rspack + Module Federation 2.0 |

---

## 三、关键差异对比

| 对比维度 | Cromwell | WordRhyme | 评价 |
|----------|----------|-----------|------|
| **插件定义** | `cromwell.config.js`（JS 配置） | `manifest.json`（Zod Schema 强校验） | WordRhyme 更严格，可静态检查 |
| **扩展点模型** | 固定槽位（`widgetName: 'Dashboard'`） | 类型化扩展（`type: 'sidebar'`） | WordRhyme 更灵活 |
| **前端加载** | 编译时 bundle，CMS 直接 require | Module Federation 运行时远程加载 | WordRhyme 更现代，支持独立开发/部署 |
| **后端扩展** | TypeGraphQL + NestJS Controller | tRPC Router（推荐）或 NestJS Module | WordRhyme 提供渐进式选择 |
| **多租户** | 无 | 内置，所有操作自动租户隔离 | WordRhyme 为 SaaS 设计 |
| **权限** | 仅 admin 权限检查 | 白名单能力模型 + Manifest 声明 | WordRhyme 企业级 |
| **数据隔离** | 插件表无自动隔离 | `plugin_{pluginId}_{table}` + 自动 tenant_id | WordRhyme 更安全 |
| **设置** | 全局 JSON blob | 分层 scope + 加密 + 特性标志 | WordRhyme 更强大 |
| **Hook** | `registerAction()` 简单事件 | Action + Filter 双模式 + 优先级 + 中止 | WordRhyme 更完整 |
| **DX 复杂度** | 低（入门简单） | 中高（功能强大但概念多） | Cromwell 入门更友好 |

---

## 四、Cromwell 中值得借鉴的设计

### 4.1 Instance Settings（实例级配置）

Cromwell 有一个 WordRhyme 目前缺少的概念：**同一个插件在同一页面上可以放置多次，每次有独立配置**。

```tsx
// Cromwell: 一个页面放两个 filter 插件，各自配置不同
<CPlugin id="filter-1" pluginName="@cromwell/plugin-filter"
  plugin={{ instanceSettings: { disableMobile: true } }} />
<CPlugin id="filter-2" pluginName="@cromwell/plugin-filter"
  plugin={{ instanceSettings: { disableMobile: false } }} />
```

这对于 CMS 的**前台页面构建**场景非常有用。但 WordRhyme 当前定位是 Admin Panel 管理系统，插件更偏向功能模块而非可拖拽组件，所以这个功能暂时不是刚需。

### 4.2 Theme Editor 集成

Cromwell 的 `registerThemeEditorPluginBlock()` 允许插件直接注册到可视化编辑器中，用户可以在编辑器里拖拽插件到页面。这是 WordRhyme 未来做可视化页面构建时可以参考的模式。

### 4.3 前端缓存清除（`purgeRendererEntireCache`）

Cromwell 有一个简洁的缓存失效 API，让插件在修改数据后主动清除 SSG 缓存。WordRhyme 目前的缓存策略更复杂（基于 CacheNamespace），但对插件开发者来说，一个简单的 `ctx.cache.invalidate()` 更友好。

### 4.4 侧边栏修改器模式

```ts
// Cromwell 的 modifier 模式
registerSidebarLinkModifier('my-plugin', (links) => {
  links.push({ id: 'xxx', title: 'My Page', route: 'my-page' });
});
```

对比 WordRhyme 的静态 `extensions[]` 声明，Cromwell 的 modifier 模式更灵活（可以修改/重排其他链接）。但 WordRhyme 的静态声明更安全、可预测。**这是一个安全性 vs 灵活性的权衡，WordRhyme 的选择是正确的。**

---

## 五、WordRhyme 的优化建议

### 5.1 降低入门门槛（DX 优化）

**问题**：WordRhyme 的 manifest.json 有 100+ 个可选字段，新插件开发者可能被吓到。

**建议**：提供 `create-plugin` 脚手架 + 最小化模板。

```bash
# 类似 Cromwell 的 CLI 创建命令
npx @wordrhyme/cli create-plugin my-plugin --type simple
```

最小 manifest 只需 5 个字段：
```json
{
  "pluginId": "com.vendor.my-plugin",
  "version": "1.0.0",
  "name": "My Plugin",
  "vendor": "Vendor",
  "runtime": "node"
}
```

### 5.2 插件 Settings UI 简化

**问题**：当前 hello-world 插件的设置页面需要手动用 `fetch()` 调用 tRPC API。

**借鉴 Cromwell**：提供一个类似 `PluginSettingsLayout` 的高阶组件：

```tsx
// 建议新增：@wordrhyme/plugin 导出
import { PluginSettingsForm } from '@wordrhyme/plugin/react';

function MySettings() {
  return (
    <PluginSettingsForm pluginId="com.vendor.my-plugin">
      {({ settings, updateSetting, saving }) => (
        <Input
          label="API Key"
          value={settings.apiKey ?? ''}
          onChange={(v) => updateSetting('apiKey', v, { encrypted: true })}
        />
      )}
    </PluginSettingsForm>
  );
}
```

这样可以省去手动处理 loading/saving/error 状态的样板代码。

### 5.3 `usePluginTrpc` 类型安全增强

**问题**：当前 `usePluginTrpc()` 返回 `any`，丢失了类型推导。

**建议**：让插件导出 Router 类型，Host 通过泛型注入：

```tsx
// 插件端导出类型
export type HelloWorldRouter = typeof router;

// 使用端（类型安全）
const api = usePluginTrpc<HelloWorldRouter>('hello-world');
// api.sayHello.useQuery({ name: 'test' })  <-- 完整类型提示
```

### 5.4 开发模式热更新

**问题**：当前插件开发需要重启服务器才能生效。

**借鉴 Cromwell 的 watch 模式**：前端已通过 Module Federation 的 `devRemoteEntry` 支持 HMR，但后端 tRPC Router 变更仍需重启。

**建议**：开发模式下，后端 router 使用 `import()` 动态加载 + `chokidar` 监听变更：

```ts
// 仅 dev 模式
if (isDev) {
  watchPluginDir(pluginPath, async () => {
    delete require.cache[require.resolve(pluginPath)];
    const newRouter = (await import(pluginPath)).router;
    pluginRouterMap.set(pluginId, newRouter);
    logger.info(`Plugin ${pluginId} router hot-reloaded`);
  });
}
```

---

## 六、总结

| 方面 | 结论 |
|------|------|
| **架构成熟度** | WordRhyme >> Cromwell。WordRhyme 的能力系统、隔离机制、权限模型都是企业级的 |
| **开发者体验** | Cromwell 入门更简单，WordRhyme 需要补充脚手架和简化模板 |
| **可借鉴的** | Instance Settings（未来页面构建用）、Settings UI 高阶组件、前端缓存清除 API |
| **不应借鉴的** | Cromwell 的 modifier 模式（牺牲安全性）、TypeORM（WordRhyme 用 Drizzle 更好）|
| **优先优化** | 1) CLI 脚手架 2) Settings UI 组件 3) usePluginTrpc 类型安全 4) Dev 热更新 |

WordRhyme 的插件系统在架构层面已经非常完整，当前最大的优化空间在**开发者体验（DX）**而非架构本身。
