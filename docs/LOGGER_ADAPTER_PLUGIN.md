# Logger Adapter Plugin System

## 概述

WordRhyme 现在支持通过插件机制动态切换日志适配器。Core 默认使用 NestJS logger（零依赖），用户可以选择安装高性能的 Pino logger 插件。

## 架构设计

### 两阶段日志系统

```
启动阶段：
  Core 使用 NestJS Logger → 零外部依赖，快速启动

插件加载后：
  自动切换到 Pino Logger → 高性能异步日志
```

### 设计原则

1. **零依赖 Core**：Core 不依赖任何第三方日志库
2. **插件化扩展**：日志增强功能通过插件提供
3. **动态切换**：插件加载时自动切换 logger adapter
4. **向后兼容**：符合 LoggerAdapter 接口即可无缝切换

## 使用方式

### 1. 默认使用（无需配置）

Core 默认使用 NestJS logger，无需安装任何插件：

```typescript
// 自动使用 NestJS logger
const logger = new LoggerService();
logger.info('Hello World');
```

输出格式：
```
[Nest] 12345  - 2026/01/13 10:00:00    LOG [App] Hello World
```

### 2. 安装 Pino Logger 插件

将 `logger-pino` 插件放置在 `plugins/` 目录：

```bash
plugins/
└── logger-pino/
    ├── manifest.json
    ├── package.json
    └── dist/
        └── index.js
```

重启服务器，系统会自动检测并加载插件：

```
[PluginManager] 📦 Loading plugin: com.wordrhyme.logger-pino v0.1.0
[PluginManager] 🔄 Logger adapter switched to: com.wordrhyme.logger-pino
[2026-01-13 10:00:00.123 +0800] INFO: Logger adapter switched
```

输出格式（Pino JSON）：
```json
{
  "level": 30,
  "time": 1768271636468,
  "msg": "Hello World",
  "pid": 12345,
  "hostname": "server.local"
}
```

## 插件开发指南

### 创建 Logger Adapter 插件

#### 1. Manifest 声明

在 `manifest.json` 中声明 `logger-adapter` capability：

```json
{
  "pluginId": "com.example.logger-custom",
  "version": "1.0.0",
  "capabilities": {
    "provides": ["logger-adapter"]
  },
  "exports": {
    "loggerAdapter": "./dist/adapter.js"
  }
}
```

#### 2. 实现 LoggerAdapter 接口

```typescript
import type { LoggerAdapter, LogContext } from '@wordrhyme/plugin';

export class CustomLoggerAdapter implements LoggerAdapter {
    debug(message: string, context?: LogContext): void {
        // 实现 debug 日志
    }

    info(message: string, context?: LogContext): void {
        // 实现 info 日志
    }

    warn(message: string, context?: LogContext): void {
        // 实现 warn 日志
    }

    error(message: string, context?: LogContext, trace?: string): void {
        // 实现 error 日志
    }

    createChild(baseContext: LogContext): LoggerAdapter {
        // 创建子 logger（带有默认上下文）
        return new CustomLoggerAdapter(baseContext);
    }

    setMetadata(key: string, value: unknown): void {
        // 设置持久化元数据
    }
}
```

#### 3. 导出工厂函数

```typescript
// adapter.ts 或 index.ts
export function createLoggerAdapter() {
    return new CustomLoggerAdapter();
}

export default createLoggerAdapter;
```

#### 4. 构建和部署

```bash
# 构建插件
pnpm build

# 部署到 plugins 目录
cp -r dist plugins/logger-custom/
```

## 技术实现

### PluginManager 加载流程

```typescript
// 1. 扫描插件并加载 manifest
const manifest = await loadManifest(pluginDir);

// 2. 检测 logger-adapter capability
if (manifest.capabilities?.provides?.includes('logger-adapter')) {
    // 3. 动态导入 adapter 模块
    const adapterPath = path.join(pluginDir, manifest.exports.loggerAdapter);
    const adapterModule = await import(adapterPath);

    // 4. 调用工厂函数创建 adapter 实例
    const factory = adapterModule.default || adapterModule.createLoggerAdapter;
    const adapter = factory();

    // 5. 切换 LoggerService 的 adapter
    this.loggerService.switchAdapter(adapter);
}
```

### LoggerService 适配器切换

```typescript
export class LoggerService implements LoggerAdapter {
    private adapter: LoggerAdapter;

    constructor(@Optional() @Inject('LOGGER_ADAPTER') adapter?: LoggerAdapter) {
        // 默认使用 NestJS adapter
        this.adapter = adapter ?? createLoggerAdapter();
    }

    switchAdapter(newAdapter: LoggerAdapter): void {
        this.adapter = newAdapter;
        this.info('Logger adapter switched', {
            from: this.adapter.constructor.name,
            to: newAdapter.constructor.name,
        });
    }

    // 代理所有日志方法到当前 adapter
    info(message: string, context?: LogContext): void {
        this.adapter.info(message, context);
    }
}
```

## Pino Logger Plugin

### 特性

- ✅ 异步非阻塞日志（< 0.5ms per log）
- ✅ 结构化 JSON 输出
- ✅ 开发模式 pretty printing
- ✅ 自动注入请求上下文（traceId, requestId）
- ✅ 子 logger 支持（context binding）

### 配置

通过环境变量配置：

```bash
LOG_LEVEL=info          # 日志级别：debug, info, warn, error
NODE_ENV=production     # 生产模式使用 JSON 格式
NODE_ENV=development    # 开发模式使用 pretty 格式
```

### 性能优势

相比 NestJS logger：

- **更快**：异步写入，不阻塞主线程
- **更小**：JSON 格式紧凑，节省存储空间
- **更强**：支持日志轮转、压缩、多目标输出

## FAQ

### Q: 为什么不直接在 Core 中集成 Pino？

**A:** 遵循"零依赖 Core"原则。Pino 是可选增强功能，不应成为 Core 的强制依赖。这样可以：
- 保持 Core 轻量
- 降低安全风险
- 用户可以选择任何 logger（Pino, Winston, Bunyan 等）

### Q: 如何回退到 NestJS logger？

**A:** 删除或禁用 `logger-pino` 插件，重启服务器即可自动回退。

### Q: 可以同时使用多个 logger adapter 吗？

**A:** 不可以。系统同时只能使用一个 logger adapter。如果多个插件都提供 logger-adapter，最后加载的插件会覆盖之前的。

### Q: 如何在插件中使用日志？

**A:** 通过 PluginContext 使用受限的 logger API：

```typescript
export async function onEnable(ctx: PluginContext) {
    ctx.logger.info('Plugin enabled');
    // 插件默认没有 debug 权限，需要管理员开启
}
```

## 相关文档

- [CORE_OBSERVABILITY_SYSTEM.md](./CORE_OBSERVABILITY_SYSTEM.md) - 完整的可观测性系统文档
- [PLUGIN_CONTRACT.md](../docs/architecture/PLUGIN_CONTRACT.md) - 插件开发规范
- [plugins/logger-pino/README.md](../plugins/logger-pino/README.md) - Pino 插件使用文档

## 贡献指南

欢迎贡献新的 logger adapter 插件！

要求：
1. 实现 `LoggerAdapter` 接口的所有方法
2. 在 manifest.json 中声明 `logger-adapter` capability
3. 提供清晰的使用文档和配置说明
4. 通过性能测试（< 1ms per log in production）
5. 支持异步日志写入（推荐）

示例项目：
- [@wordrhyme/logger-pino](../plugins/logger-pino) - 官方 Pino adapter
- [@wordrhyme/logger-winston](https://github.com/wordrhyme/plugins) - 社区 Winston adapter（示例）
