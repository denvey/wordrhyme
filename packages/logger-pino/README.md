# @wordrhyme/logger-pino

High-performance Pino logger adapter for WordRhyme observability system.

## Installation

```bash
pnpm add @wordrhyme/logger-pino
```

## Configuration

Set the environment variable to enable Pino adapter:

```bash
LOG_ADAPTER=pino
```

The adapter will be automatically loaded by WordRhyme Core.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_ADAPTER` | Logger adapter to use (`nestjs` or `pino`) | `nestjs` |
| `LOG_LEVEL` | Minimum log level (`debug`, `info`, `warn`, `error`) | `info` |
| `NODE_ENV` | Environment mode (affects pretty printing) | - |

## Features

- **High Performance**: Pino is one of the fastest Node.js loggers
- **Structured JSON**: All logs are formatted as JSON for easy parsing
- **Async Logging**: Non-blocking log writes
- **Pretty Printing**: Automatic pino-pretty integration in development
- **Child Loggers**: Efficient context binding via Pino child loggers
- **Zero Overhead Context**: Context is inherited without copying

## Performance

Target: < 0.5ms per log operation

Pino is designed for high-throughput logging scenarios and is significantly
faster than most other Node.js logging libraries.

## Comparison with NestJS Adapter

| Feature | NestJS Adapter | Pino Adapter |
|---------|----------------|--------------|
| Dependencies | None | pino, pino-pretty |
| Performance | Medium | Optimal |
| JSON Output | Manual formatting | Native |
| Best For | Development, Self-hosted | Production SaaS |

## Direct Usage (Advanced)

While Core typically handles adapter selection automatically, you can use
the adapter directly:

```typescript
import { PinoLoggerAdapter } from '@wordrhyme/logger-pino';

const logger = new PinoLoggerAdapter({
  level: 'debug',
  serviceName: 'my-service',
  pretty: true, // Force pretty printing
});

logger.info('User logged in', {
  userId: '123',
  tenantId: 'tenant-1',
});

// Child logger with bound context
const childLogger = logger.createChild({
  pluginId: 'my-plugin',
});
childLogger.info('Plugin initialized'); // Includes pluginId automatically

// Flush before exit
logger.flush();
```

## License

MIT
