# 插件 API 规范 (Plugin API Specification)

## 新增要求

### 要求：插件 API 包 (Plugin API Package)

应创建一个单独的 npm 包 `@nebula/plugin-api`。该包必须为插件作者导出 TypeScript 类型和运行时助手。插件应仅从 `@nebula/plugin-api` 导入，绝不从 `@nebula/core` 导入。

#### 场景：插件导入 API 包
- **当** 插件执行 `import { definePlugin } from '@nebula/plugin-api'` 时
- **那么** 导入成功
- **并且** TypeScript 类型可用
- **并且** 插件可以使用运行时助手

---

### 要求：能力接口 (Capability Interface)

插件 API 应为所有能力定义接口：Logger (日志)、Permission (权限)、Data (数据)、Hook (钩子 - 未来计划)。每个能力接口必须带有完整的 TSDoc 文档。

#### 场景：Logger 能力接口
- **当** 插件访问 `ctx.logger` 时
- **那么** 日志器符合 `LoggerCapability` 接口
- **并且** 方法包括：`info()`, `warn()`, `error()`, `debug()`

#### 场景：权限能力接口
- **当** 插件访问 `ctx.permissions` 时
- **那么** 权限符合 `PermissionCapability` 接口
- **并且** 方法 `can(user, capability, scope)` 可用

---

### 要求：插件上下文类型 (Plugin Context Type)

插件 API 应导出一个包含所有可用能力的 `PluginContext` 类型。生命周期钩子应接收此上下文作为其次第 1 个参数。

#### 场景：生命周期钩子接收上下文
- **当** 插件的 `onEnable(ctx)` 钩子被调用时
- **那么** `ctx` 符合 `PluginContext` 类型
- **并且** `ctx.logger` 可用
- **并且** `ctx.permissions` 可用 (权限裁决始终可用)
- **并且** `ctx.data` 可用 (仅当在清单中声明 Data 能力时)

---

### 要求：插件清单模式 (Plugin Manifest Schema)

插件 API 应为 `manifest.json` 导出一个 TypeScript 类型。该模式必须符合 `PLUGIN_CONTRACT.md` 中的验证规则。应提供一个 Zod 模式用于运行时验证。

#### 场景：清单类型验证结构
- **当** 插件作者使用 `PluginManifest` 类型编写清单时
- **那么** TypeScript 验证必填字段：`pluginId`, `version`, `vendor`, `type`, `runtime`, `engines.nebula`
- **并且** 可选字段被正确输入类型：`capabilities`, `permissions`, `server`, `admin`

#### 场景：Zod 模式在运行时进行验证
- **当** 解析 `manifest.json` 文件时
- **那么** Zod 模式验证结构
- **并且** 捕获带有描述性消息的类型错误
- **并且** 推断出的 TypeScript 类型匹配 `PluginManifest` 类型
