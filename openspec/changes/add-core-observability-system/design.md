# Design: Core Observability System

## Context

### Background

WordRhyme CMS 是一个多租户、插件化的 Headless CMS 系统。当前系统已具备：
- 基础的 `RequestContext` 通过 AsyncLocalStorage 传播（含 `requestId`, `tenantId`, `traceId` 等）
- 简单的 `LoggerCapability` 供插件使用
- `OBSERVABILITY_GOVERNANCE.md` 定义的治理规范

但缺乏：
- 统一的结构化日志格式
- 完整的 Trace 传播（跨 Core/Plugin 边界）
- Prometheus 兼容的 Metrics 收集
- 集中式错误追踪

### Constraints

1. **插件隔离**: 插件只能访问自己的可观测性数据，不能访问其他插件或 Core 的数据
2. **多租户**: 所有数据必须绑定 `tenantId`，禁止跨租户数据泄露
3. **性能**: 日志和 Metrics 收集不能显著影响请求延迟（目标 < 1ms overhead）
4. **部署模式**: 需同时支持 SaaS（集中式）和 Self-Hosted（本地）部署
5. **现有架构**: 必须与 NestJS + Fastify + tRPC 技术栈无缝集成

### Stakeholders

- **平台运维**: 需要系统健康监控、告警、故障排查能力
- **插件开发者**: 需要调试工具和 Metrics API
- **租户管理员**: 需要查看自己租户的插件健康状态
- **计费系统**: 需要准确的 usage metrics 用于计量计费

---

## Goals / Non-Goals

### Goals

1. **G1**: 提供统一的结构化日志系统，JSON 格式，自动注入上下文
2. **G2**: 实现 TraceId/SpanId 传播，覆盖 HTTP → Core → Plugin → Core 全链路
3. **G3**: 暴露 Prometheus 兼容的 Metrics 端点，支持自动标签注入
4. **G4**: 提供可插拔的错误追踪集成（支持 Sentry、本地文件等后端）
5. **G5**: 实现插件健康监控，基于错误率/延迟自动降级

### Non-Goals

1. **NG1**: 不实现完整的 APM（Application Performance Monitoring）系统
2. **NG2**: 不实现日志存储/查询系统（使用外部系统如 Elasticsearch）
3. **NG3**: 不实现实时告警系统（由 Prometheus AlertManager 处理）
4. **NG4**: 不支持插件自定义 Metrics Exporter（只能通过 Core API）
5. **NG5**: 不实现 Distributed Tracing UI（使用 Jaeger/Zipkin）

---

## Technical Decisions

### Decision 1: Logging System - Pluggable Architecture with Adapter Pattern

**选择**: 采用**可插拔的日志适配器架构**，通过抽象接口支持多种日志后端

**设计原则**:
- **零强制依赖**: 默认使用 NestJS 内置 Logger，无需安装额外包
- **可选增强**: 需要高性能时安装 `@wordrhyme/logger-pino` 包
- **统一接口**: 插件和 Core 代码面向抽象接口编程，与具体实现解耦

**适配器层次**:
```
┌─────────────────────────────────────────────────────┐
│                  LoggerService                       │
│              (Core 统一日志服务)                      │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│               LoggerAdapter (Interface)              │
│  - log(level, message, context)                      │
│  - createChild(context): LoggerAdapter               │
└─────────────────────────────────────────────────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐      ┌─────────────────────────────┐
│ NestJS Adapter  │      │ @wordrhyme/logger-pino      │
│ (内置默认)       │      │ (独立包，含所有 pino 依赖)   │
└─────────────────┘      └─────────────────────────────┘
```

**Adapters 对比**:
| Adapter | 安装方式 | 性能 | 适用场景 |
|---------|----------|------|----------|
| **NestJS (默认)** | 无需安装 | 中等 | 开发环境、Self-hosted 轻量部署 |
| **@wordrhyme/logger-pino** | `pnpm add @wordrhyme/logger-pino` | 最优 | 生产 SaaS、高并发场景 |

**配置方式**:
```bash
# 环境变量选择 adapter
LOG_ADAPTER=nestjs    # 默认，无需额外依赖
LOG_ADAPTER=pino      # 需要安装: pnpm add @wordrhyme/logger-pino
```

**抽象接口定义**:
```typescript
// Core 日志适配器接口（内部使用，支持 debug）
interface LoggerAdapter {
  debug(message: string, context?: LogContext): void;  // Core only
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, trace?: string): void;

  // 创建带预设上下文的子 logger（用于插件隔离）
  createChild(baseContext: LogContext): LoggerAdapter;

  // 支持结构化日志的元数据
  setMetadata(key: string, value: unknown): void;
}

// 插件日志接口（受限，debug 需受控开启 - 遵循 OBSERVABILITY_GOVERNANCE §3.3）
interface PluginLogger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  // debug() - 默认禁用，租户管理员可临时启用（带过期时间）
  debug?(message: string, meta?: LogMeta): void;
}

// Debug 模式配置（租户管理员控制）
interface PluginDebugConfig {
  pluginId: string;
  tenantId: string;
  enabled: boolean;
  expiresAt: Date;        // 最长 24 小时
  enabledBy: string;      // 操作人 userId
  reason?: string;        // 开启原因（用于审计）
}

// 插件 Metrics 接口（受限，仅 counter - 遵循 OBSERVABILITY_GOVERNANCE §4.1）
interface PluginMetrics {
  // 仅支持离散事件计数器，用于计费
  increment(name: string, labels?: AllowedLabels): void;
  // ❌ 无 histogram/gauge/observe/set - 防止基数爆炸
}

// 允许的标签白名单
type AllowedLabels = {
  model?: string;    // AI 模型名称
  type?: string;     // 事件类型
  status?: 'success' | 'failure';  // 状态
};

interface LogContext {
  // 自动注入字段（不可覆盖）
  readonly requestId?: string;
  readonly traceId?: string;
  readonly tenantId?: string;
  readonly pluginId?: string;

  // 用户自定义字段
  [key: string]: unknown;
}
```

**NestJS 默认适配器实现**:
```typescript
@Injectable()
export class NestJSLoggerAdapter implements LoggerAdapter {
  private readonly logger = new Logger();
  private baseContext: LogContext = {};

  info(message: string, context?: LogContext): void {
    const merged = { ...this.baseContext, ...context };
    // NestJS Logger 不原生支持 JSON，我们格式化后输出
    this.logger.log(this.formatMessage(message, merged));
  }

  createChild(baseContext: LogContext): LoggerAdapter {
    const child = new NestJSLoggerAdapter();
    child.baseContext = { ...this.baseContext, ...baseContext };
    return child;
  }

  private formatMessage(message: string, context: LogContext): string {
    if (process.env.LOG_FORMAT === 'json') {
      return JSON.stringify({ msg: message, ...context });
    }
    return `[${context.requestId}] ${message}`;
  }
}
```

**@wordrhyme/logger-pino 包实现**:
```typescript
// packages/logger-pino/src/index.ts
// 该包内部依赖 pino, nestjs-pino, pino-pretty
import pino from 'pino';
import type { LoggerAdapter, LogContext } from '@wordrhyme/observability';

export class PinoLoggerAdapter implements LoggerAdapter {
  private logger: pino.Logger;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: { service: 'wordrhyme-core' },
      // 开发环境自动启用 pino-pretty
      transport: isDev ? { target: 'pino-pretty' } : undefined,
    });
  }

  createChild(baseContext: LogContext): LoggerAdapter {
    const adapter = new PinoLoggerAdapter();
    adapter.logger = this.logger.child(baseContext);
    return adapter;
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context, message);
  }

  // ... 其他方法
}
```

**动态加载机制**:
```typescript
// LoggerModule 根据配置动态选择适配器
@Module({})
export class LoggerModule {
  static forRoot(): DynamicModule {
    const adapterType = process.env.LOG_ADAPTER || 'nestjs';

    const providers: Provider[] = [
      {
        provide: 'LOGGER_ADAPTER',
        useFactory: () => {
          switch (adapterType) {
            case 'pino':
              // 动态导入 @wordrhyme/logger-pino 包
              try {
                const { PinoLoggerAdapter } = require('@wordrhyme/logger-pino');
                return new PinoLoggerAdapter();
              } catch {
                throw new Error(
                  'Pino adapter requires: pnpm add @wordrhyme/logger-pino'
                );
              }
            default:
              return new NestJSLoggerAdapter();
          }
        },
      },
      LoggerService, // 面向 LOGGER_ADAPTER 接口
    ];

    return { module: LoggerModule, providers, exports: [LoggerService] };
  }
}
```

**@wordrhyme/logger-pino 包结构**:
```
packages/logger-pino/
├── package.json          # 依赖: pino, nestjs-pino, pino-pretty
├── src/
│   ├── index.ts          # 导出 PinoLoggerAdapter
│   └── pino.adapter.ts   # 适配器实现
├── README.md             # 安装和使用说明
└── tsconfig.json
```

**迁移路径**:
1. **Phase 1 (MVP)**: 仅实现 NestJS 默认适配器，满足基本需求
2. **Phase 2**: 发布 `@wordrhyme/logger-pino` 包，供高性能需求用户选择

---

### Decision 2: Tracing Strategy - Lightweight TraceId + Optional OpenTelemetry

**选择**: 分阶段实现
- **Phase 1**: 轻量级 TraceId/SpanId 传播（本提案范围）
- **Phase 2**: 可选 OpenTelemetry 集成（未来增强）

**理由**:
- 完整 OpenTelemetry 集成复杂度高，对于 MVP 不必要
- TraceId 传播已能满足 90% 的调试需求
- 保持架构扩展性，未来可无缝升级到 OTEL

**TraceId 生成规则**:
```typescript
// TraceId: 128-bit hex string (W3C Trace Context 兼容)
// SpanId: 64-bit hex string
// 格式: traceparent = 00-{traceId}-{spanId}-{flags}

interface TraceContext {
  traceId: string;      // 32 hex chars
  spanId: string;       // 16 hex chars
  parentSpanId?: string;
  sampled: boolean;
}

// 从 HTTP Header 提取或生成（仅 W3C traceparent）
function extractOrCreateTrace(headers: Headers): TraceContext {
  // W3C traceparent 标准格式
  const traceparent = headers.get('traceparent');
  if (traceparent) {
    return parseTraceparent(traceparent);
  }

  // 无 traceparent 时生成新的 trace
  return {
    traceId: crypto.randomUUID().replace(/-/g, ''),
    spanId: crypto.randomBytes(8).toString('hex'),
    sampled: true,
  };
}
```

**Trace Header 规则**:
| Header | 格式 | 说明 |
|--------|------|------|
| `traceparent` | `00-{traceId}-{spanId}-{flags}` | W3C 标准，唯一支持的格式 |

> **设计决策**: 不支持 `X-Trace-Id` 等非标准 header。WordRhyme 是新项目，无遗留客户端兼容需求。所有调用方应使用 W3C traceparent 标准。

**Span 创建策略**:
- HTTP 请求入口: 创建 Root Span
- tRPC Procedure: 创建 Child Span
- Plugin 调用: **不创建 Span**（插件只能读取 traceId，不能创建 span - 遵循 OBSERVABILITY_GOVERNANCE §5）
- 数据库操作: 创建 Child Span（可选，通过 decorator）

---

### Decision 3: Metrics System - prom-client with Auto-labeling

**选择**: 使用 [prom-client](https://github.com/siimon/prom-client) + 自动标签注入

**理由**:
- Prometheus 是云原生监控的事实标准
- `prom-client` 是 Node.js 官方推荐的 Prometheus 客户端
- Pull 模式简化部署（无需 Push Gateway）

**Metrics 类型**:
```typescript
// 1. Counter - 累计计数
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status', 'tenantId'],
});

// 2. Histogram - 分布统计（延迟）
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'tenantId'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// 3. Gauge - 瞬时值
const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['tenantId'],
});
```

**Plugin Metrics API**:
```typescript
// Plugin 通过 ctx.metrics 访问，自动注入 pluginId/tenantId
interface PluginMetricsAPI {
  increment(name: string, labels?: Record<string, string>): void;
  observe(name: string, value: number, labels?: Record<string, string>): void;
  set(name: string, value: number, labels?: Record<string, string>): void;
}

// 内部实现自动添加前缀和标签
ctx.metrics.increment('content.generated', { model: 'gpt-4' });
// 实际 metric: plugin_content_generated_total{pluginId="ai-writer",tenantId="t1",model="gpt-4"}
```

**Metrics 端点安全**:
```typescript
// /metrics 端点需要认证
@Controller('metrics')
export class MetricsController {
  @Get()
  @UseGuards(MetricsAuthGuard) // 仅允许 Prometheus scraper 或 admin
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
```

---

### Decision 4: Error Tracking - Abstraction Layer + Pluggable Backends

**选择**: 创建抽象层，支持多种后端

**理由**:
- SaaS 部署可能使用 Sentry
- Self-Hosted 部署可能只需本地文件日志
- 抽象层允许未来切换或添加新后端

**接口设计**:
```typescript
interface ErrorTracker {
  captureException(error: Error, context?: ErrorContext): void;
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
  setUser(user: { id: string; email?: string }): void;
  setTag(key: string, value: string): void;
}

interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id: string; email?: string };
  level?: 'fatal' | 'error' | 'warning' | 'info';
}

// 自动上下文注入
class CoreErrorTracker implements ErrorTracker {
  captureException(error: Error, context?: ErrorContext): void {
    const requestCtx = getContext(); // 从 AsyncLocalStorage 获取
    const enrichedContext = {
      ...context,
      tags: {
        ...context?.tags,
        tenantId: requestCtx.tenantId,
        traceId: requestCtx.traceId,
        requestId: requestCtx.requestId,
      },
    };
    this.backend.capture(error, enrichedContext);
  }
}
```

**后端实现**:
```typescript
// 1. Local File Backend (默认)
class LocalFileErrorBackend implements ErrorBackend {
  capture(error: Error, context: ErrorContext): void {
    this.logger.error({ error, context }, 'Error captured');
  }
}

// 2. Sentry Backend (可选)
class SentryErrorBackend implements ErrorBackend {
  capture(error: Error, context: ErrorContext): void {
    Sentry.withScope((scope) => {
      scope.setTags(context.tags);
      scope.setExtras(context.extra);
      Sentry.captureException(error);
    });
  }
}
```

---

### Decision 5: Plugin Isolation - Scoped Services via DI

**选择**: 通过依赖注入提供 Scoped 服务，插件无法绕过

**实现机制**:
```typescript
// PluginContext 在每次调用时创建，注入 scoped 服务
class PluginContextFactory {
  create(pluginId: string, requestContext: RequestContext): PluginContext {
    return {
      logger: this.loggerService.createChildLogger({
        pluginId,
        tenantId: requestContext.tenantId,
        traceId: requestContext.traceId,
      }),
      metrics: this.metricsService.createPluginMetrics(pluginId, requestContext.tenantId),
      trace: {
        getTraceId: () => requestContext.traceId,
        getSpanId: () => requestContext.spanId,
      },
    };
  }
}
```

**隔离保证**:
1. **Logger**: Child logger 自动注入 `pluginId`，无法伪造
2. **Metrics**: 所有 metric 自动添加 `pluginId` 标签
3. **Trace**: 只读访问，无法修改 trace context
4. **日志查询 API**: 按 `pluginId` + `tenantId` 过滤

---

### Decision 6: Health Monitoring - State Machine with Configurable Thresholds

**选择**: 实现状态机模式，支持配置化阈值

**状态定义**:
```
┌──────────┐     error_rate > 10%     ┌──────────┐     errors > 5/min     ┌───────────┐
│ HEALTHY  │ ──────────────────────► │ DEGRADED │ ─────────────────────► │ SUSPENDED │
└──────────┘                          └──────────┘                        └───────────┘
     ▲                                      │                                   │
     │         error_rate < 5%              │                                   │
     └──────────────────────────────────────┘                                   │
     │                                                  manual_reset            │
     └──────────────────────────────────────────────────────────────────────────┘
```

**配置**:
```typescript
interface HealthConfig {
  // 降级阈值
  degradedErrorRateThreshold: number;  // default: 0.1 (10%)
  degradedWindowSeconds: number;       // default: 300 (5 min)

  // 暂停阈值
  suspendedErrorCount: number;         // default: 5
  suspendedWindowSeconds: number;      // default: 60 (1 min)

  // 恢复阈值
  recoveryErrorRateThreshold: number;  // default: 0.05 (5%)
  recoveryWindowSeconds: number;       // default: 300 (5 min)
}
```

**降级行为**:
- **DEGRADED**: 启用限流（50% 请求量），增加日志级别
- **SUSPENDED**: 阻止新请求，允许现有请求完成，发送告警

---

## Data Flow

### Logging Flow

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│ HTTP Request│─────►│ TraceMiddleware │─────►│ AsyncStorage │
└─────────────┘      └─────────────────┘      └──────────────┘
                                                     │
                     ┌───────────────────────────────┘
                     ▼
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│ Core/Plugin │─────►│ LoggerService   │─────►│ Pino Logger  │
│ Code        │      │ (inject context)│      │ (JSON output)│
└─────────────┘      └─────────────────┘      └──────────────┘
                                                     │
                     ┌───────────────────────────────┘
                     ▼
              ┌──────────────┐
              │ stdout/file  │───► External Log Aggregator
              └──────────────┘     (Elasticsearch, Loki, etc.)
```

### Metrics Flow

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│ HTTP Request│─────►│ MetricsInter-   │─────►│ prom-client  │
│ / Plugin Op │      │ ceptor/Wrapper  │      │ Registry     │
└─────────────┘      └─────────────────┘      └──────────────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
              Prometheus ◄────── scrape ──────│ /metrics     │
                                              │ endpoint     │
                                              └──────────────┘
```

### Trace Propagation Flow

```
┌──────────────┐   traceparent    ┌──────────────┐
│ External     │ ────────────────►│ HTTP Handler │
│ Client       │                  │ (extract)    │
└──────────────┘                  └──────────────┘
                                         │
                                         ▼ store in AsyncLocalStorage
                                  ┌──────────────┐
                                  │ RequestCtx   │
                                  │ {traceId,    │
                                  │  spanId}     │
                                  └──────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌──────────────┐                  ┌──────────────┐                 ┌──────────────┐
│ tRPC Handler │                  │ Plugin Call  │                 │ DB Query     │
│ (child span) │                  │ (child span) │                 │ (child span) │
└──────────────┘                  └──────────────┘                 └──────────────┘
```

---

## Risks / Trade-offs

### Risk 1: AsyncLocalStorage Performance Overhead

**风险**: AsyncLocalStorage 在高并发下可能有性能开销

**缓解措施**:
- Node.js 16+ 已显著优化 ALS 性能
- 仅存储必要字段，避免大对象
- 进行基准测试，设定 < 1ms overhead 目标
- 如果成为瓶颈，考虑使用 `cls-hooked` 替代方案

### Risk 2: Metrics Cardinality Explosion

**风险**: 高基数标签（如 userId）可能导致 Prometheus 内存爆炸

**缓解措施**:
- 禁止插件添加高基数标签
- 白名单机制：只允许预定义标签
- 监控 metric 数量，设置告警阈值
- 文档明确说明标签最佳实践

### Risk 3: Log Volume in Production

**风险**: Debug 级别日志在生产环境可能产生大量数据

**缓解措施**:
- 默认生产环境 LOG_LEVEL=info
- 支持动态日志级别调整（无需重启）
- 按租户/插件设置独立日志级别
- 实现日志采样（对于高频路径）

### Risk 4: Plugin Bypass Attempts

**风险**: 恶意插件可能尝试绕过 observability 隔离

**缓解措施**:
- 插件运行在受限 context，无法访问 global logger
- ESLint 规则禁止插件 import 'pino' 等库
- 代码审查 marketplace 插件
- 未来考虑 VM 隔离（v1.x）

---

## Migration Plan

### Phase 1: Core Infrastructure (Week 1-2)

1. 安装依赖: `pino`, `nestjs-pino`, `prom-client`
2. 创建 `ObservabilityModule`
3. 实现 `LoggerService` 和 `MetricsService`
4. 更新 `RequestContext` 添加 trace 字段（已完成）
5. 添加 HTTP middleware 初始化 trace context

### Phase 2: Plugin Integration (Week 2-3)

1. 更新 `@wordrhyme/plugin` 包的类型定义
2. 增强 `PluginContextFactory` 注入 observability 服务
3. 更新现有 `logger.capability.ts`
4. 创建示例插件演示用法

### Phase 3: Health Monitoring (Week 3-4)

1. 实现 `PluginHealthMonitor` 服务
2. 添加健康状态 API
3. 实现降级/暂停逻辑
4. 添加 Admin UI 展示健康状态

### Phase 4: Production Readiness (Week 4)

1. 添加配置文档
2. 创建 Grafana Dashboard 模板
3. 性能基准测试
4. 安全审计

### Rollback Plan

1. Feature flag `ENABLE_NEW_OBSERVABILITY=false` 回退到旧 logger
2. 所有新代码与旧 API 兼容
3. 数据库无 schema 变更，无需数据迁移

---

## Open Questions

1. **Q1**: 是否需要支持动态日志级别调整（运行时通过 API 修改）？
   - 建议: Phase 2 实现

2. **Q2**: Metrics 端点是否需要支持 Basic Auth？
   - 建议: 支持，配置化

3. **Q3**: 是否需要为每个租户提供独立的 Prometheus endpoint？
   - 建议: 不需要，使用标签过滤

4. **Q4**: Error tracking 是否需要支持 PII 脱敏？
   - 建议: Phase 2 实现，提供 hook 让租户配置脱敏规则

---

## Appendix

### A. Log Entry Schema

```typescript
interface LogEntry {
  // 标准字段
  level: 'debug' | 'info' | 'warn' | 'error';
  time: number;          // Unix timestamp ms
  msg: string;

  // 服务标识
  service: string;       // 'wordrhyme-core' | 'wordrhyme-worker'
  hostname: string;
  pid: number;

  // 请求上下文
  requestId: string;
  traceId?: string;
  spanId?: string;

  // 租户/用户上下文
  tenantId?: string;
  userId?: string;

  // 插件上下文
  pluginId?: string;
  pluginVersion?: string;

  // 自定义数据
  [key: string]: unknown;
}
```

### B. Metrics Naming Convention

```
# Core Metrics (无前缀)
http_requests_total
http_request_duration_seconds
db_query_duration_seconds

# Plugin Metrics (plugin_ 前缀)
plugin_capability_invocations_total
plugin_errors_total
plugin_custom_{metric_name}
```

### C. Configuration Environment Variables

```bash
# Logging
LOG_LEVEL=info              # debug|info|warn|error
LOG_FORMAT=json             # json|pretty
LOG_OUTPUT=stdout           # stdout|file

# Metrics
METRICS_ENABLED=true
METRICS_PATH=/metrics
METRICS_AUTH_TOKEN=xxx      # Optional: Basic auth token

# Error Tracking
ERROR_TRACKER=local         # local|sentry
SENTRY_DSN=                 # Required if ERROR_TRACKER=sentry

# Health Monitoring
HEALTH_DEGRADED_ERROR_RATE=0.1
HEALTH_SUSPENDED_ERROR_COUNT=5
```
