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

### 分发与升级模式

WordRhyme 在架构上**同时支持两类插件生命周期模型**，分别对应 Shopify 式 SaaS 平台和 WordPress 式实例自主管理。

#### 模式 A：Shopify-style Platform Managed

适用于：
- 多租户 SaaS
- 官方内置插件
- 平台托管的官方市场插件

特征：
- 插件代码和版本由平台统一发布
- 数据库迁移由平台自动执行，租户无感
- 租户安装/卸载决定的是 capability、菜单、权限、配置是否生效
- 租户**不负责**手动升级插件版本或数据库结构

典型触发方式：
- 平台启动时统一检查插件迁移
- 发布流水线中统一执行 migration
- Host 升级后，已安装租户自动进入新版本能力

#### 模式 B：WordPress-style Instance Managed

适用于：
- 私有部署 / 单租户独立实例
- 本地插件目录
- 需要按实例、按租户显式安装插件的场景

特征：
- 插件安装动作本身可以触发初始化和迁移
- 插件升级可由实例管理员显式控制
- 数据结构生命周期与插件安装状态绑定更紧
- 更适合“当前实例是否安装了该插件”决定是否需要建表的环境

典型触发方式：
- `onInstall` / `onEnable` 时执行迁移
- 插件首次安装时创建 namespaced tables
- 卸载时按 retention 策略保留、归档或删除数据

#### WordRhyme 的定位：Hybrid, Shopify-first

WordRhyme 不是纯 Shopify，也不是纯 WordPress，而是**混合模型**：

- 对于官方插件、平台托管插件、多租户 SaaS，默认采用 **Shopify-style**
- 对于私有部署、实验插件、单实例场景，保留 **WordPress-style** 的安装时迁移能力
- 同一套插件契约允许不同部署形态选择不同触发策略，但插件包结构保持一致：
  - `manifest.json`
  - `schema.ts`
  - `migrations/`
  - lifecycle hooks

#### 两种模式的职责边界

| 维度 | Shopify-style | WordPress-style |
|------|---------------|-----------------|
| 版本发布者 | 平台 | 实例管理员 / 部署方 |
| 迁移触发者 | 平台启动 / CI-CD | 插件安装 / 启用 |
| 租户是否感知升级 | 通常无感 | 通常可感知 |
| 是否要求预装全部插件 | 不要求 | 不要求 |
| 是否适合插件市场 | 适合官方托管市场 | 适合自托管 / 私有插件库 |
| 默认推荐级别 | ⭐ 默认 | 可选兼容模式 |

#### 当前推荐

当前阶段建议采用：

1. **平台主路径**：Shopify-style Platform Managed
2. **兼容保留**：WordPress-style Instance Managed
3. **文档和实现都应明确**：这是两种受支持模式，而不是历史遗留冲突

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
| WordPress | 共享 PHP Runtime / 每站点独立实例 | 共享 Admin | 插件安装/更新驱动实例内升级 |
| Grafana | gRPC 进程 | iframe | 语言无关 |

WordRhyme 采用**渐进式隔离**策略：
1. 默认共享进程 (性能优先)
2. 按需容器隔离 (兼容性优先)

在插件生命周期和数据迁移层面，WordRhyme 同时吸收两类生态：
- **Shopify**：平台托管、租户无感升级
- **WordPress**：实例级插件安装/启用触发初始化和迁移

因此 WordRhyme 的长期目标不是二选一，而是：
- 用统一 Plugin Contract 支撑两种部署模式
- 在 SaaS 默认走 Shopify-style
- 在私有部署/实验环境兼容 WordPress-style

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
