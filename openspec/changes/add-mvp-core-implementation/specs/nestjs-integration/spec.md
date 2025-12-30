# NestJS Integration Specification

## Overview

This specification defines the integration strategy between NestJS (as an application framework) and tRPC (as the API layer) for the WordRhyme server.

---

## Requirements

### Requirement: NestJS Shell Architecture

NestJS SHALL serve as a "thin shell" providing infrastructure (DI, module lifecycle, middleware) while tRPC handles all API logic. NestJS Controllers SHALL NOT be used (tRPC replaces REST endpoints).

#### Scenario: Module initialization order
- **WHEN** the server starts
- **THEN** NestJS modules initialize in order: DatabaseModule → ContextModule → AuthModule → PluginModule → TrpcModule

#### Scenario: No NestJS Controllers
- **WHEN** API requests arrive at `/trpc/*`
- **THEN** they are handled by the tRPC router, NOT NestJS controllers

---

### Requirement: Fastify Instance Sharing

The Fastify instance created by NestJS SHALL be shared with modules that need direct Fastify access (e.g., TrpcModule for route registration, Fastify plugins for multipart/static).

#### Scenario: tRPC registration on Fastify
- **WHEN** TrpcModule initializes
- **THEN** it receives the Fastify instance via DI
- **AND** registers the tRPC plugin on the Fastify instance

---

## Implementation Details

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────┐
│                       NestJS Application                    │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                      AppModule                        │   │
│  │  ├── DatabaseModule (Drizzle 连接池)                  │   │
│  │  ├── AuthModule (better-auth 初始化)                  │   │
│  │  ├── ContextModule (AsyncLocalStorage 中间件)         │   │
│  │  ├── PluginModule (插件生命周期管理)                   │   │
│  │  └── TrpcModule (tRPC 路由注册)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│              ┌─────────────┴─────────────┐                  │
│              ▼                           ▼                  │
│     Fastify Plugins              tRPC AppRouter             │
│     ├── @fastify/multipart       ├── core routes            │
│     ├── @fastify/static          │   ├── user.*             │
│     └── @fastify/cors            │   ├── plugin.*           │
│                                  │   └── content.*          │
│                                  └── plugin routes          │
│                                      └── {pluginId}.*       │
└────────────────────────────────────────────────────────────┘
```

### File Structure

```
apps/server/src/
├── main.ts              # 入口点
├── app.module.ts        # NestJS 根模块
├── database/
│   └── database.module.ts
├── auth/
│   └── auth.module.ts
├── context/
│   └── context.module.ts
├── plugins/
│   └── plugin.module.ts
└── trpc/
    ├── trpc.module.ts
    ├── trpc.ts
    ├── context.ts
    ├── router.ts
    └── routers/
```

### AppModule

```typescript
// apps/server/src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ContextModule } from './context/context.module';
import { PluginModule } from './plugins/plugin.module';
import { TrpcModule } from './trpc/trpc.module';

@Module({
  imports: [
    DatabaseModule,     // 1. 数据库连接 (最先)
    ContextModule,      // 2. ALS 上下文中间件
    AuthModule,         // 3. better-auth 初始化
    PluginModule,       // 4. 插件管理器
    TrpcModule,         // 5. tRPC 路由 (最后)
  ],
})
export class AppModule {}
```

### Main Entry Point

```typescript
// apps/server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { env } from './config/env';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: env.NODE_ENV === 'development' }),
  );

  const fastify = app.getHttpAdapter().getInstance();

  // 注册 Fastify 插件
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), env.PLUGIN_DIR),
    prefix: '/plugins/',
    decorateReply: false,
  });

  // 启用 CORS
  app.enableCors({
    origin: env.NODE_ENV === 'development' ? true : env.CORS_ORIGINS?.split(','),
    credentials: true,
  });

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
}

bootstrap();
```

### TrpcModule

```typescript
// apps/server/src/trpc/trpc.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { getAppRouter } from './router';
import { createContext } from './context';

@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async onModuleInit() {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance() as FastifyInstance;

    await fastify.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router: getAppRouter(),
        createContext,
        onError: ({ error, path }) => {
          console.error(`[tRPC] Error in ${path}:`, error);
        },
      },
    });
  }
}
```

### Module Responsibilities

| Module | 职责 | 使用 Controller |
|--------|------|-----------------|
| `DatabaseModule` | Drizzle 连接池 | ❌ |
| `AuthModule` | better-auth 初始化 | ❌ |
| `ContextModule` | ALS 中间件 | ❌ |
| `PluginModule` | 插件生命周期 | ❌ |
| `TrpcModule` | tRPC 路由注册 | ❌ |

---

### Requirement: PluginManager ALS Pattern

PluginManager 是 Singleton 服务。它必须在每次调用时从 AsyncLocalStorage 获取当前请求上下文，而不是在构造函数中缓存。

#### Scenario: Request-scoped context in Singleton
- **WHEN** PluginManager.install() is called
- **THEN** it reads tenantId from AsyncLocalStorage.getStore()
- **AND** it does NOT cache tenantId as an instance property

#### Scenario: Concurrent requests handled correctly
- **WHEN** two concurrent requests call PluginManager methods
- **THEN** each request sees its own tenantId from ALS
- **AND** there is no cross-tenant data leakage

### Implementation Pattern

```typescript
// ✅ CORRECT: Read from ALS on each call
@Injectable()
export class PluginManager {
  async install(uploadId: string): Promise<string> {
    const ctx = getContext(); // Read from ALS
    const tenantId = ctx.tenantId;
    
    // Use tenantId for this operation
    return this.doInstall(uploadId, tenantId);
  }
}

// ❌ WRONG: Cache context in constructor
@Injectable()
export class PluginManager {
  private tenantId: string; // Never do this!
  
  constructor() {
    this.tenantId = getContext().tenantId; // Wrong: captures first request's context
  }
}
```

> [!WARNING]
> NestJS 中的 Singleton 服务不能在构造函数中缓存请求特定的数据。必须在每个方法调用时从 ALS 读取。
