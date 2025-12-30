# Plugin Compatibility Roadmap

插件系统兼容性架构规划，确保在平台持续演进的同时，保持对现有插件的长期支持。

## 核心挑战

当 Host (Core) 持续更新时，如何确保插件市场中的各种插件（包括不再维护的老插件）继续正常工作。

| 层面 | 挑战 |
|------|------|
| **前端** | React/UI 库版本不匹配 |
| **后端** | NestJS/Node.js 版本 breaking changes |
| **数据层** | 数据库 schema 变更 |

---

## 兼容性策略

### 前端 (Admin UI)

#### Module Federation 共享模块
```typescript
// 插件 rsbuild.config.ts
shared: {
    react: { singleton: true, import: false },
    'react-dom': { singleton: true, import: false },
}
```

**关键原则**:
- 插件**不打包** React，使用 `import: false`
- 使用 `peerDependencies` 声明兼容版本范围
- Host 使用 `eager: true` 优先提供共享模块

#### 降级方案
- 对于完全不兼容的老插件，可使用 **iframe 沙盒** 隔离
- 未来版本预留 `manifest.admin.sandbox: true` 字段

---

### 后端 (Server)

#### SDK 抽象层 (简单模式) ⭐推荐

插件通过 `@wordrhyme/plugin` SDK 开发，不直接依赖 NestJS：

```typescript
import { definePlugin } from '@wordrhyme/plugin';

export default definePlugin({
    id: 'com.example.my-plugin',
    
    router: createRouter({
        greet: t.procedure.query(() => 'Hello'),
    }),
    
    onEnable(ctx) {
        ctx.data.query('users', { limit: 10 });
        ctx.scheduler.register('task', '0 * * * *', () => {});
    },
});
```

**SDK 能力覆盖**:
- `ctx.data` - 数据访问
- `ctx.permissions` - 权限检查
- `ctx.scheduler` - 定时任务
- `ctx.logger` - 日志
- `ctx.config` - 插件配置
- `ctx.events` - 事件发布/订阅
- `router` - tRPC 路由

#### 高级模式 (直接 NestJS)

对于复杂场景，提供 opt-in 的 NestJS 访问：

```typescript
import { defineAdvancedPlugin } from '@wordrhyme/plugin/advanced';
import { MyNestModule } from './my.module';

export default defineAdvancedPlugin({
    id: 'com.example.advanced',
    nestModule: MyNestModule,
});
```

> ⚠️ 使用高级模式需要在 manifest 中声明 NestJS 版本

#### 容器隔离模式 (未来)

当 NestJS 有 breaking change 且老插件无法更新时：

```json
{
    "runtime": "container",
    "engines": {
        "nestjs": "^10.0.0"
    }
}
```

- 插件运行在独立 Docker 容器中
- 通过 gRPC/HTTP 与 Core 通信
- 可运行任意版本的 NestJS/Node

---

## Manifest 版本声明

```json
{
    "pluginId": "com.example.my-plugin",
    "version": "1.0.0",
    
    "runtime": "node",
    
    "engines": {
        "wordrhyme": "^0.1.0",
        "node": ">=20.0.0",
        "nestjs": "^10.0.0"
    }
}
```

| 字段 | 说明 |
|------|------|
| `runtime` | 执行模式: `node` (默认), `container` (未来) |
| `engines.wordrhyme` | 兼容的 Core 版本 |
| `engines.node` | 要求的 Node.js 版本 |
| `engines.nestjs` | 使用的 NestJS 版本 (高级模式) |

---

## 版本演进路线

### Phase 1: MVP (当前)

- [x] SDK 抽象层基础能力
- [x] `manifest.engines.wordrhyme` 版本声明
- [x] Module Federation 前端共享
- [x] 预留 `runtime` 字段
- [ ] 兼容性检查警告提示

### Phase 2: V1.x

- [ ] 完善 SDK 能力覆盖 (scheduler, events, etc.)
- [ ] 高级模式: 可选 NestJS 直接访问
- [ ] 插件市场兼容性标签
- [ ] 自动化兼容性测试

### Phase 3: V2.x+

- [ ] 容器隔离执行模式
- [ ] gRPC 通信协议
- [ ] 多版本 NestJS 并行支持
- [ ] 前端 iframe 沙盒选项

---

## 业界参考

| 产品 | 后端隔离 | 前端隔离 | 特点 |
|------|----------|----------|------|
| VS Code | 进程隔离 | 共享渲染 | Host API |
| Strapi | 共享进程 | N/A | 声明式配置 |
| Shopify | 完全分离 | 完全分离 | GraphQL API |
| Grafana | gRPC 进程 | iframe | 语言无关 |

WordRhyme 采用**渐进式隔离**策略：
1. 默认共享进程 (性能优先)
2. 按需容器隔离 (兼容性优先)

---

## 插件开发者指南

### 推荐实践

1. **使用 SDK API**，避免直接依赖 Core 内部实现
2. **声明 engines**，明确兼容版本
3. **使用 peerDependencies**，避免打包重复依赖
4. **遵循语义化版本**，正确处理 breaking changes

### 示例 package.json

```json
{
    "name": "my-plugin",
    "peerDependencies": {
        "react": "^18.0.0 || ^19.0.0",
        "react-dom": "^18.0.0 || ^19.0.0",
        "@wordrhyme/plugin": "^0.1.0"
    },
    "devDependencies": {
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "@wordrhyme/plugin": "^0.1.0"
    }
}
```

---

## 总结

```
简单插件 ──→ SDK 抽象层 ──→ 平滑升级
                              ↓
复杂插件 ──→ 直接 NestJS ──→ 版本锁定 ──→ 容器隔离 (未来)
```

这套架构确保：
- **90% 插件** 通过 SDK 自动兼容新版本
- **高级插件** 通过版本声明管理兼容性
- **遗留插件** 未来可通过容器继续运行
