# Observability System 快速入门指南

## 5分钟快速上手

本指南将帮助您快速了解并使用 WordRhyme 的可观测性系统。

## 目录

1. [核心概念](#核心概念)
2. [日志系统](#日志系统)
3. [分布式追踪](#分布式追踪)
4. [指标收集](#指标收集)
5. [插件开发](#插件开发)
6. [监控配置](#监控配置)

---

## 核心概念

WordRhyme 提供了完整的可观测性栈：

```
┌─────────────────────────────────────────┐
│         Observability Stack             │
├─────────────────────────────────────────┤
│ 📝 Logging:   结构化日志 + 插件化      │
│ 🔍 Tracing:   W3C Trace Context         │
│ 📊 Metrics:   Prometheus 格式           │
│ ⚠️  Errors:    统一错误追踪             │
│ 💚 Health:    插件健康监控              │
│ 🆔 Request:   唯一请求标识              │
└─────────────────────────────────────────┘
```

**关键特性：**
- ✅ 零配置开箱即用
- ✅ 插件化日志系统（可选 Pino 高性能日志）
- ✅ 自动上下文注入（traceId、requestId、tenantId）
- ✅ 符合可观测性治理规范

---

## 日志系统

### 基础使用

在 Core 服务中：

```typescript
import { LoggerService } from '../observability/logger.service';

@Injectable()
export class UserService {
    private readonly logger = new LoggerService();

    async createUser(data: UserInput) {
        // 自动包含 traceId、requestId、tenantId
        this.logger.info('Creating user', {
            email: data.email,
            role: data.role,
        });

        try {
            // ... 创建用户逻辑
            this.logger.info('User created successfully', {
                userId: user.id,
            });
        } catch (error) {
            this.logger.error('Failed to create user', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
```

### 安装 Pino 高性能日志插件

**步骤 1：** 确保 `logger-pino` 插件在 `plugins/` 目录

**步骤 2：** 重启服务器

```bash
pnpm --filter @wordrhyme/server dev
```

**步骤 3：** 验证插件加载

查看启动日志，确认看到：

```
[PluginManager] 🔄 Logger adapter switched to: com.wordrhyme.logger-pino
[2026-01-13 10:38:02.740 +0800] INFO: Logger adapter switched
```

日志格式自动从 NestJS 格式切换到 Pino JSON 格式：

```json
{
  "level": 30,
  "time": 1768271636468,
  "msg": "User created successfully",
  "userId": "user-123",
  "traceId": "1234567890abcdef",
  "requestId": "uuid-here"
}
```

### 日志级别

通过环境变量配置：

```bash
# .env
LOG_LEVEL=info    # debug | info | warn | error
```

**级别说明：**
- `debug`: 详细的调试信息（生产环境默认禁用）
- `info`: 常规操作信息
- `warn`: 警告信息（潜在问题）
- `error`: 错误信息（需要关注）

---

## 分布式追踪

### 自动追踪

所有 HTTP 请求自动包含 W3C Trace Context：

```
请求头：
traceparent: 00-1234567890abcdef1234567890abcdef-1234567890abcdef-01
            ││  └─ traceId (32位)         └─ spanId (16位) └─ flags

响应头：
traceparent: 00-1234567890abcdef1234567890abcdef-9876543210fedcba-01
x-request-id: uuid-here
```

### Core 服务中使用 @Traced 装饰器

```typescript
import { Traced } from '../observability';

@Injectable()
export class OrderService {
    @Traced('processOrder')
    async processOrder(orderId: string) {
        // 自动创建新的 span
        // traceId 保持不变，spanId 为新值
        // 日志自动包含 traceId 和 spanId
    }

    @Traced('calculateTotal')
    async calculateTotal(items: Item[]) {
        // 每个被追踪的方法都有独立的 spanId
    }
}
```

### 插件中使用追踪

插件只能读取 trace 信息，不能创建 span：

```typescript
export async function onEnable(ctx: PluginContext) {
    const traceId = ctx.trace.getTraceId();
    const spanId = ctx.trace.getSpanId();

    ctx.logger.info('Processing request', {
        traceId,
        spanId,
    });

    // 在调用外部 API 时传递 trace context
    const headers = {
        'traceparent': `00-${traceId}-${spanId}-01`,
    };
}
```

### 追踪可视化

配置 Jaeger 或 Zipkin 查看追踪数据：

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "14268:14268"  # Collector
```

---

## 指标收集

### Core 自动收集的指标

```
# HTTP 请求时长
http_request_duration_seconds{method="GET",route="/api/users",status="200"} 0.123

# HTTP 请求总数
http_requests_total{method="GET",route="/api/users",status="200"} 42

# 插件能力调用次数
plugin_capability_invocations_total{tenantId="default",pluginId="hello-world"} 100
```

### 插件中使用指标

**重要：** 插件只能使用 `increment()` 方法（符合治理规范）

```typescript
export async function onEnable(ctx: PluginContext) {
    // ✅ 正确：计数事件
    ctx.metrics.increment('user_registrations', {
        type: 'email',
        status: 'success',
    });

    // ✅ 正确：计数错误
    ctx.metrics.increment('api_errors', {
        type: 'validation',
        status: 'failed',
    });

    // ❌ 错误：这些方法不允许使用
    // ctx.metrics.observe(...);  // histogram 被禁止
    // ctx.metrics.gauge(...);    // gauge 被禁止
}
```

**标签白名单：** 插件只能使用以下标签：
- `model` - 模型/资源类型
- `type` - 操作类型
- `status` - 状态（success, failed, error 等）

### 访问 Metrics 端点

```bash
curl http://localhost:3000/metrics

# 输出 Prometheus 格式的指标
```

### 配置 Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'wordrhyme'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

---

## 插件开发

### 最佳实践示例

参考 `plugins/example-observability/src/index.ts`：

```typescript
import type { PluginContext } from '@wordrhyme/plugin';

export async function onEnable(ctx: PluginContext) {
    // 1. 日志：使用结构化日志
    ctx.logger.info('Processing user request', {
        action: 'user.create',
        userId: 'user-123',
    });

    // 2. 指标：计数事件
    ctx.metrics.increment('user_operations', {
        type: 'create',
        status: 'success',
    });

    // 3. 追踪：读取 trace 信息
    const traceId = ctx.trace.getTraceId();
    ctx.logger.info('Operation with trace', { traceId });
}
```

### 完整示例：用户注册流程

```typescript
async function registerUser(ctx: PluginContext, data: UserInput) {
    const traceId = ctx.trace.getTraceId();

    try {
        // 1. 记录开始
        ctx.logger.info('Starting user registration', {
            traceId,
            email: data.email,
        });

        ctx.metrics.increment('user_registrations', {
            type: 'email',
            status: 'started',
        });

        // 2. 执行业务逻辑
        const user = await createUser(data);

        // 3. 记录成功
        ctx.logger.info('User registered successfully', {
            traceId,
            userId: user.id,
        });

        ctx.metrics.increment('user_registrations', {
            type: 'email',
            status: 'success',
        });

        return user;

    } catch (error) {
        // 4. 记录错误
        ctx.logger.error('Registration failed', {
            traceId,
            error: error instanceof Error ? error.message : String(error),
        });

        ctx.metrics.increment('user_registrations', {
            type: 'email',
            status: 'error',
        });

        throw error;
    }
}
```

### 治理规范

**必须遵守：**

- ✅ 使用 `ctx.logger` 记录日志
- ✅ 使用 `ctx.metrics.increment()` 计数
- ✅ 使用 `ctx.trace.getTraceId()` 读取追踪信息
- ❌ 不要直接导入 `prom-client` 或其他日志库
- ❌ 不要尝试创建 span 或修改 trace context
- ❌ 不要使用 histogram 或 gauge 指标

---

## 监控配置

### Grafana 仪表板

**步骤 1：** 启动 Prometheus + Grafana

```bash
docker-compose up -d
```

**步骤 2：** 访问 Grafana

```
http://localhost:3000
用户名: admin
密码: admin
```

**步骤 3：** 添加 Prometheus 数据源

**步骤 4：** 导入仪表板模板

推荐的可视化面板：

1. **HTTP 请求监控**
   - 请求速率（QPS）
   - 请求时长（P50, P95, P99）
   - 错误率

2. **插件健康监控**
   - 插件状态分布
   - 插件错误率趋势
   - 插件调用次数

3. **系统资源**
   - Node.js 内存使用
   - CPU 使用率
   - 事件循环延迟

### 告警配置

**Prometheus Alertmanager 规则：**

```yaml
# alerts.yml
groups:
  - name: plugin_health
    rules:
      - alert: PluginErrorRateHigh
        expr: |
          sum(rate(plugin_capability_invocations_total{status="error"}[5m]))
          /
          sum(rate(plugin_capability_invocations_total[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Plugin {{ $labels.pluginId }} error rate > 10%"

      - alert: PluginSuspended
        expr: plugin_health_status{status="suspended"} == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Plugin {{ $labels.pluginId }} is suspended"
```

---

## 环境变量配置

```bash
# .env

# 日志配置
LOG_LEVEL=info              # debug | info | warn | error
LOG_FORMAT=json             # json | pretty

# 可观测性配置
ENABLE_METRICS=true         # 启用 Prometheus metrics
ENABLE_TRACING=true         # 启用分布式追踪

# 开发模式
NODE_ENV=development        # development | production
```

---

## 故障排查

### 问题：日志没有输出

**检查：**
1. 确认 `LOG_LEVEL` 配置正确
2. 检查是否安装了 logger 插件
3. 查看服务器启动日志

### 问题：Metrics 端点返回 404

**检查：**
1. 确认 `/metrics` 路由已注册
2. 检查 `ENABLE_METRICS` 环境变量
3. 验证 MetricsController 是否正常加载

### 问题：TraceId 为空

**检查：**
1. 确认请求经过 Fastify 中间件
2. 检查 AsyncLocalStorage context 是否正确
3. 验证 TraceService 是否正常初始化

### 问题：插件日志没有 pluginId

**检查：**
1. 确认使用 `ctx.logger` 而不是直接导入 logger
2. 检查插件是否正确加载
3. 验证 PluginContext 是否正确传递

---

## 更多资源

- [完整 API 文档](./LOGGER_ADAPTER_PLUGIN.md)
- [可观测性治理规范](../openspec/changes/add-core-observability-system/OBSERVABILITY_GOVERNANCE.md)
- [实施总结](../openspec/changes/add-core-observability-system/IMPLEMENTATION_SUMMARY.md)
- [示例插件代码](../plugins/example-observability/)

---

## 下一步

- ✅ [安装 Pino 日志插件](#安装-pino-高性能日志插件)
- ✅ [配置 Prometheus 监控](#配置-prometheus)
- ✅ [设置 Grafana 仪表板](#grafana-仪表板)
- ✅ [配置告警规则](#告警配置)
- ✅ [阅读示例插件](../plugins/example-observability/)

---

**需要帮助？**

- 查看 [FAQ](./LOGGER_ADAPTER_PLUGIN.md#faq)
- 提交 Issue: https://github.com/wordrhyme/wordrhyme/issues
- 加入社区讨论
