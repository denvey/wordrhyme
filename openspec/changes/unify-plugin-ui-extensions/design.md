## Context

WordRhyme 的插件 UI 扩展需要支持两个粒度：

1. **页面级**：插件注册整个页面（设置页、独立页面），由平台决定以 Tab / 子菜单 / 独立路由呈现
2. **组件级**：插件注入小组件到指定位置（按钮、面板、卡片、表单区块等），任何 React 组件均可

当前系统仅有页面级（`ExtensionPoint` enum），Cromwell 提案新增了组件级（`PluginSlot`），但两者独立设计。

## Goals / Non-Goals

**Goals**:
- 插件一次注册，多处消费（消除重复注册）
- 支持页面级和组件级两种粒度，统一注册模型
- 平台（Host）控制渲染位置和方式，插件不耦合布局
- 利用 MF2.0 按需加载，组件级注入不增加初始 bundle 体积
- 直接迁移现有 3 个插件（项目未上线，无需兼容层）

**Non-Goals**:
- 不支持运行时动态创建 slot（slot 列表在 Host 编译时确定）
- 不支持插件间直接通过 slot 通信（遵循 SYSTEM_INVARIANTS：无插件间直接通信）
- 不支持插件覆盖 Core UI 组件（插件只能"填坑"，不能"换坑"）
- 不构建可视化 slot 编辑器（v0.x 不需要）

## Decisions

### Decision 1: 三层架构（传输层 / 注册层 / 消费层）

```
Layer 3: <PluginSlot>（消费层）— Host 声明插槽，按 slot name 查询 Registry 并渲染
Layer 2: ExtensionRegistry（注册层）— 统一存储所有 UIExtension，支持按 slot / pattern 查询
Layer 1: MF2.0 Runtime（传输层）— loadRemote() 加载插件模块和组件
```

**Rationale**: 关注点分离。MF2.0 只负责传输，Registry 只负责查询，PluginSlot 只负责渲染。每层可独立演进。

**Alternatives considered**:
- 全部在 MF2.0 层解决（MF runtime plugin 直接渲染）→ 耦合传输和渲染逻辑，MF2.0 没有 slot 原语
- 全部在 Registry 层解决（Registry 直接输出 React 组件）→ Registry 承担过多职责

### Decision 2: Slot & Fill 模式（Host 挖坑，Plugin 填坑）

插件通过 `slots: string[]` 声明要注入的位置。Host 在 UI 中放置 `<PluginSlot name="..." />`，自动渲染所有匹配的 extensions。

**Rationale**: 这是行业标准模式（Grafana、Medusa、Strapi、Open edX 均采用）。关键优势：
- 插件不需要知道 UI 布局（只需知道 slot name）
- Host 控制渲染方式（`layout` prop）
- 同一 extension 可以出现在多个 slot 中
- 没有 extension 时 slot 自动隐藏

**Alternatives considered**:
- 纯 Category 驱动（无 slot name）→ 太模糊，无法支持组件级精确注入
- 纯 Type 驱动（保留 discriminated union）→ 无法统一页面级和组件级

### Decision 3: 组件引用支持直接引用 + 延迟加载两种模式

```typescript
// 直接引用：组件已通过 MF admin 入口加载
component: SettingsPage

// 延迟加载：通过 MF2.0 loadRemote 按需加载
remoteComponent: 'email_resend/SyncButton'
```

**Rationale**: 页面级组件（设置页）通常在插件 admin 入口加载时就获取了；组件级注入（按钮、面板）应按需加载以避免初始 bundle 膨胀。

**Alternatives considered**:
- 全部延迟加载 → 页面级组件也要额外请求，增加首屏延迟
- 全部直接引用 → 组件级注入导致插件 admin bundle 膨胀

### Decision 4: 层级式 Slot 命名规范

```
{surface}.{page}.{area}
```

| 级别 | 示例 | 说明 |
|------|------|------|
| surface | `nav`, `dashboard`, `settings`, `article`, `entity` | 顶级 UI 区域 |
| page | `editor`, `list`, `detail` | 具体页面 |
| area | `actions`, `sidebar`, `before`, `after`, `toolbar` | 页面内位置 |

支持通配符查询：`settings.*` 匹配所有设置相关 slot。
支持参数化：`entity.{type}.detail.sidebar` 中 `{type}` 为实体类型。

**Rationale**: 借鉴 Medusa（`product.details.before`）和 Shopify（`admin.product-details.block.render`）的命名方式，层级清晰、可预测。

### Decision 5: 权限由后端菜单系统主导

slot 中的导航类 extension（`nav.sidebar`、`settings.*`）必须映射到后端 `menus` 表，权限过滤在 server 端完成。`<PluginSlot>` 不做权限判定。

**Rationale**: 遵循 PERMISSION_GOVERNANCE.md — 权限裁决由 Core 集中处理。前端隐藏可被绕过，真正安全边界在后端。

**非导航 slot 的权限扩展**：`settings.plugin` 等 slot 的 extensions 也需要权限过滤。方案：

1. extension 声明 `requiredPermission` 字段（可选）
2. `<PluginSlot>` 接受可选 `permissionFilter` prop，由消费端注入权限检查逻辑
3. 真正的安全边界仍在后端 — 前端过滤仅优化 UI 体验

```tsx
// 消费端示例
<PluginSlot
  name="settings.plugin"
  layout="tabs"
  permissionFilter={(ext) => {
    if (!ext.requiredPermission) return true;
    return ability.can('read', ext.requiredPermission);
  }}
/>
```

## Risks / Trade-offs

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Slot 命名爆炸（未来 slot 太多难以管理） | Medium | Medium | 文档化所有可用 slot；v0.x 限定 ~15 个核心 slot |
| 权限漂移（前端 slot 展示 vs 后端菜单权限不一致） | High | Medium | 导航类 slot 强制映射到 menus 表；PluginSlot 不判定权限 |
| 迁移破坏现有插件 | Medium-High | Low | 项目未上线，直接修改插件代码；无外部插件需兼容 |
| MF2.0 多入口增加构建配置复杂度 | Low | Medium | 提供 rsbuild config helper；组件级 expose 可选 |
| 组件级注入的类型安全（context prop 类型不确定） | Medium | Medium | slot 定义时声明 context 类型；运行时做 best-effort 校验 |
| React.lazy 在渲染路径中重复创建导致状态丢失 | High | High | 模块级 Map 缓存 lazy 组件实例（见 §3.5） |
| useSlotExtensions 在 concurrent mode 下 tearing | Medium | Medium | 使用 useSyncExternalStore + Registry 引用稳定性缓存（见 §3.3） |
| loadPlugins 竞态（卸载后继续注册、并发加载） | High | Medium | AbortSignal 取消 + cleanup 使用当前引用（见 §4.3） |

## Migration Plan

### Phase 0: 基础设施（不影响现有功能）
1. 定义 `UIExtension` 接口和 slot 命名常量
2. 实现 `<PluginSlot>` 组件（空渲染）
3. 扩展 `ExtensionRegistry` 增加 `getBySlot()` / `getBySlotPattern()`

### Phase 1: 插件迁移（直接修改）
4. 迁移 storage-s3 插件（最简单，只有 settings_tab）
5. 迁移 email-resend 插件（sidebar + settings_tab → 统一注册）
6. 迁移 hello-world 插件（sidebar + settings_tab → 统一注册）
7. 更新消费端组件替换为 `<PluginSlot>` 调用

### Phase 2: 清理
8. 删除 `ExtensionPoint` enum 和旧接口（无需保留）
9. 删除 `admin.menus[]` manifest 字段（统一为 `admin.extensions[]`）
10. 更新 PLUGIN_TUTORIAL.md 和 PLUGIN_DEVELOPMENT.md

### Rollback
- 项目未上线，可直接 git revert 回退

## Open Questions

1. 是否需要在 manifest.json 中声明 slot 白名单（类似 Shopify 的 target 必须在 TOML 中声明）？还是允许插件在运行时动态注册到任意 slot？
2. 组件级注入的 `context` prop 是否需要 Zod schema 校验？还是 TypeScript 类型约束即可？
3. 未来是否允许平台管理员通过 Admin UI 调整 slot → extension 的映射关系（类似 Shopify 商家可以拖拽 block 位置）？

---

## Technical Details

### 1. UIExtension 类型设计

#### 1.1 新接口（替代旧 discriminated union）

```typescript
// apps/admin/src/lib/extensions/extension-types.ts

import type { ComponentType } from 'react';

/**
 * 统一 UI 扩展接口
 * 替代旧的 SidebarExtension | SettingsTabExtension | DashboardWidgetExtension | HeaderActionExtension
 */
export interface UIExtension {
  /** 唯一 ID，格式：{shortPluginName}.{purpose}，如 'email-resend.settings' */
  id: string;
  /** 插件 ID（reverse-domain），如 'com.wordrhyme.email-resend' */
  pluginId: string;
  /** 目标 slot 列表，如 ['nav.sidebar', 'settings.plugin'] */
  slots: string[];
  /** 显示标签 */
  label: string;
  /** 图标名（lucide-react），如 'Mail', 'Cloud' */
  icon?: string;
  /** slot 内排序权重，越小越靠前，默认 100 */
  order?: number;
  /** 语义分类，如 'storage', 'notification', 'general' */
  category?: string;

  // --- 组件引用（二选一） ---
  /** 直接组件引用（通过 MF admin 入口已加载） */
  component?: ComponentType<SlotContext>;
  /** MF2.0 远程组件路径，如 'email_resend/SyncButton'（按需加载） */
  remoteComponent?: string;

  // --- 导航专用（仅 nav.sidebar slot 使用） ---
  /** 路由路径，如 '/p/com.wordrhyme.email-resend' */
  path?: string;
  /** 所需权限，如 'plugin:email-resend:settings.read' */
  requiredPermission?: string;

  // --- Dashboard 专用 ---
  /** Grid 列宽（1-4），仅 dashboard.widgets slot 使用 */
  colSpan?: 1 | 2 | 3 | 4;
}

/** PluginSlot 传递给 extension 组件的上下文 */
export interface SlotContext {
  [key: string]: unknown;
}

/**
 * 插件远程模块接口（MF2.0 admin 入口导出）
 */
export interface PluginRemoteModule {
  /** 新格式：UIExtension 列表 */
  extensions?: UIExtension[];
  /** 可选初始化函数 */
  init?: () => void | Promise<void>;
}
```

#### 1.2 Slot-specific 字段约束（类型辅助函数）

UIExtension 统一接口中的 `path`、`colSpan`、`requiredPermission` 等字段仅特定 slot 使用，存在"Prop Soup"问题。通过类型辅助函数在编译时收窄：

```typescript
/** 导航类 extension 输入（nav.sidebar slot） */
interface NavExtensionInput {
  id: string;
  label: string;
  icon?: string;
  order?: number;
  path: string;                    // 必填
  requiredPermission?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
}

/** 设置类 extension 输入（settings.* slot） */
interface SettingsExtensionInput {
  id: string;
  label: string;
  icon?: string;
  order?: number;
  category?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
}

/** Dashboard widget extension 输入 */
interface DashboardExtensionInput {
  id: string;
  label: string;
  icon?: string;
  order?: number;
  colSpan?: 1 | 2 | 3 | 4;        // 仅此处可用
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
}

/** 辅助函数：编译时类型约束 + 运行时注入 slots */
function navExtension(ext: NavExtensionInput): Omit<UIExtension, 'pluginId'> {
  return { ...ext, slots: ['nav.sidebar'] };
}

function settingsExtension(ext: SettingsExtensionInput): Omit<UIExtension, 'pluginId'> {
  return { ...ext, slots: ['settings.plugin'] };
}

function dashboardExtension(ext: DashboardExtensionInput): Omit<UIExtension, 'pluginId'> {
  return { ...ext, slots: ['dashboard.widgets'] };
}
```

插件端使用：
```typescript
export const extensions = [
  navExtension({ id: 'page', label: 'Hello World', icon: 'Sparkles', path: '/p/...', component: Page }),
  settingsExtension({ id: 'settings', label: 'Hello World', component: Settings }),
];
```

> 运行时仍存储为统一 `UIExtension`，辅助函数只是开发体验优化。插件也可直接声明原始 `UIExtension` 对象（advanced use case）。

#### 1.3 设计要点

- **`component` vs `remoteComponent` 互斥**：运行时校验，两者都没有则报错
- **`path` 仅 `nav.sidebar` slot 使用**：其他 slot 不需要路由。PluginSlot 消费时，若 slot 是 `nav.sidebar` 且 extension 有 `path`，则渲染为 `<Link>`
- **`SlotContext` 是弱类型**：v0.x 用 `Record<string, unknown>`，不做 Zod 校验。TypeScript 泛型提供开发时类型提示，运行时不强制

#### 1.4 插件导出格式变更

```typescript
// 旧格式（hello-world/src/admin/index.tsx）：
export const extensions: Extension[] = [
  { id: 'hello-world.sidebar', type: 'sidebar', label: '...', path: '...', component: Page },
  { id: 'hello-world.settings', type: 'settings_tab', label: '...', component: Settings },
];

// 新格式：两个注册合并为一个（或保留两个，按需）
export const extensions: UIExtension[] = [
  {
    id: 'hello-world.page',
    pluginId: 'com.wordrhyme.hello-world',
    slots: ['nav.sidebar'],
    label: 'Hello World',
    icon: 'Sparkles',
    path: '/p/com.wordrhyme.hello-world',
    order: 100,
    component: HelloWorldPage,
  },
  {
    id: 'hello-world.settings',
    pluginId: 'com.wordrhyme.hello-world',
    slots: ['settings.plugin'],
    label: 'Hello World',
    order: 100,
    component: HelloWorldSettings,
  },
];
```

> **注意**：hello-world 的 sidebar 和 settings 用不同组件（`HelloWorldPage` vs `HelloWorldSettings`），所以需要两个 UIExtension。
> email-resend 的两者用同一个 `SettingsPage`，可以合并为一个 `UIExtension { slots: ['nav.sidebar', 'settings.plugin'] }`。

---

### 2. ExtensionRegistry 内部设计

#### 2.1 数据结构

```typescript
class ExtensionRegistryImpl {
  /** 主存储：extensionKey → UIExtension */
  private extensions: Map<string, UIExtension> = new Map();

  /** 反向索引：slotName → Set<extensionKey>，加速 getBySlot 查询 */
  private slotIndex: Map<string, Set<string>> = new Map();

  private listeners: Set<() => void> = new Set();
}
```

- **主存储** key 格式：`{pluginId}:{extensionId}`，保证唯一
- **slotIndex** 在 `register()` 时维护，`unregister()` 时同步清理
- 查询流程：`getBySlot('nav.sidebar')` → 从 slotIndex 取 key 集合 → 从 extensions 取实例 → 按 order 排序

#### 2.2 核心 API

```typescript
interface ExtensionRegistry {
  /** 注册单个 extension，自动维护 slotIndex */
  register(ext: UIExtension): void;

  /** 批量注册 */
  registerAll(exts: UIExtension[]): void;

  /** 按 exact slot name 查询 */
  getBySlot(slotName: string): UIExtension[];

  /** 按通配符查询，如 'settings.*' */
  getBySlotPattern(pattern: string): UIExtension[];

  /** 注销插件的所有 extension */
  unregisterPlugin(pluginId: string): number;

  /** 订阅变更（适配 useSyncExternalStore 签名） */
  subscribe(onStoreChange: () => void): () => void;

  /** 获取所有 extension（调试用） */
  getAll(): UIExtension[];
}
```

#### 2.3 通配符匹配实现

```typescript
getBySlotPattern(pattern: string): UIExtension[] {
  // 'settings.*' → 正则 /^settings\..+$/
  const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.+') + '$');
  const result: UIExtension[] = [];
  for (const [slotName, keys] of this.slotIndex) {
    if (regex.test(slotName)) {
      for (const key of keys) {
        const ext = this.extensions.get(key);
        if (ext) result.push(ext);
      }
    }
  }
  // 去重（同一 extension 可能出现在多个匹配 slot 中）
  return [...new Map(result.map(e => [`${e.pluginId}:${e.id}`, e])).values()]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
```

---

### 3. `<PluginSlot>` 组件架构

#### 3.1 组件签名

```tsx
interface PluginSlotProps {
  /** slot 名称，如 'nav.sidebar' */
  name: string;
  /** 传递给 extension 组件的上下文 */
  context?: Record<string, unknown>;
  /** 布局模式 */
  layout?: 'inline' | 'stack' | 'tabs' | 'grid';
  /** 自定义 className */
  className?: string;
  /** 空 slot 时的 fallback（默认 null） */
  fallback?: React.ReactNode;
}
```

#### 3.2 渲染流程

```
<PluginSlot name="settings.plugin" layout="tabs">
  │
  ├─ 1. useSlotExtensions(name)  ← 自定义 Hook
  │     └─ ExtensionRegistry.getBySlot(name)
  │     └─ subscribe() 监听变更 → re-render
  │
  ├─ 2. extensions.length === 0 → return fallback ?? null
  │
  ├─ 3. 根据 layout 选择渲染策略：
  │     ├─ 'inline'  → <div style="display:flex; gap:8px"> 水平排列
  │     ├─ 'stack'   → <div style="display:flex; flex-direction:column"> 垂直堆叠
  │     ├─ 'tabs'    → <Tabs> + <TabsTrigger>/<TabsContent> per extension
  │     └─ 'grid'    → <div style="display:grid; grid-template-columns:..."> 网格
  │
  └─ 4. 每个 extension 渲染：
        └─ <PluginErrorBoundary pluginId={ext.pluginId}>
             └─ <Suspense fallback={<Skeleton/>}>
                  └─ ext.component
                       ? <ext.component {...context} />
                       : <RemoteComponent remote={ext.remoteComponent} {...context} />
```

#### 3.3 useSlotExtensions Hook

使用 `useSyncExternalStore` 替代 `useState + useEffect` 订阅模式，避免 React 18 concurrent features 下的 tearing 风险：

```typescript
import { useSyncExternalStore } from 'react';

function useSlotExtensions(slotName: string): UIExtension[] {
  const getSnapshot = useCallback(
    () => ExtensionRegistry.getBySlot(slotName),
    [slotName],
  );

  return useSyncExternalStore(
    ExtensionRegistry.subscribe,
    getSnapshot,
    getSnapshot, // SSR snapshot（同步）
  );
}
```

> **注意**：`getBySlot()` 每次返回新数组引用。为避免无限 re-render，Registry 内部需要做引用稳定性优化 — 当 slot 内容未变时返回同一引用（通过缓存上次 getBySlot 结果的 JSON.stringify 比较或版本号标记）。

**Registry 引用稳定性实现**：

```typescript
class ExtensionRegistryImpl {
  /** slot 查询结果缓存，变更时清除 */
  private slotCache: Map<string, UIExtension[]> = new Map();

  register(ext: UIExtension): void {
    // ... 注册逻辑 ...
    // 清除受影响 slot 的缓存
    for (const slot of ext.slots) {
      this.slotCache.delete(slot);
    }
    this.notify();
  }

  getBySlot(slotName: string): UIExtension[] {
    const cached = this.slotCache.get(slotName);
    if (cached) return cached;

    const result = /* ... 查询逻辑 ... */;
    this.slotCache.set(slotName, result);
    return result;
  }
}
```

#### 3.5 RemoteComponent 延迟加载器

**关键：React.lazy 必须在模块级缓存，不能在渲染路径中创建**。每次渲染创建新 `React.lazy` 实例会导致组件状态丢失和反复卸载/重建。

```tsx
/** 模块级缓存：remote path → lazy component */
const remoteComponentCache = new Map<string, React.LazyExoticComponent<ComponentType<any>>>();

/** 获取或创建缓存的 lazy 组件 */
function getOrCreateRemoteComponent(remote: string) {
  let cached = remoteComponentCache.get(remote);
  if (!cached) {
    cached = React.lazy(async () => {
      const mfRuntime = await import('@module-federation/enhanced/runtime');
      const mod = await mfRuntime.loadRemote<{ default: ComponentType }>(remote);
      if (!mod?.default) throw new Error(`Remote ${remote} has no default export`);
      return mod;
    });
    remoteComponentCache.set(remote, cached);
  }
  return cached;
}

/** 加载 MF2.0 远程组件（使用缓存） */
function RemoteComponent({
  remote,
  ...props
}: { remote: string } & Record<string, unknown>) {
  const Component = getOrCreateRemoteComponent(remote);

  return (
    <Suspense fallback={<Skeleton className="h-16 w-full" />}>
      <Component {...props} />
    </Suspense>
  );
}
```

> 当插件卸载时，`unregisterPlugin()` 应清理对应的 remoteComponentCache 条目以释放内存。
```

#### 3.6 ErrorBoundary 增强

采用两层 ErrorBoundary 策略：

1. **外层**：`<PluginSlot>` 级别 — 捕获整个 slot 的致命错误（如 Registry 查询异常）
2. **内层**：per-extension 级别 — 单个 extension 失败不影响其他 extension

内层 ErrorBoundary 支持 retry：

```tsx
class PluginErrorBoundary extends React.Component<{
  pluginId: string;
  children: React.ReactNode;
}, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  resetError = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 border border-destructive/20 rounded-md text-sm">
          <p className="text-muted-foreground">
            Extension unavailable ({this.props.pluginId})
          </p>
          <Button variant="ghost" size="sm" onClick={this.resetError}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

PluginSlot 为加载态设置 `min-height` 避免布局跳动：

```tsx
// Suspense fallback 匹配实际组件大小
<Suspense fallback={<Skeleton className="h-16 w-full min-h-[64px]" />}>
```

---

#### 4.1 变更范围

`plugin-loader.ts` 的核心逻辑不变：MF2.0 `loadRemote` → 获取模块 → 注册 extensions。变更点：

1. `PluginRemoteModule.extensions` 类型从 `Extension[]` 改为 `UIExtension[]`
2. `ExtensionRegistry.registerAll()` 直接接受 `UIExtension[]`
3. 移除对 `extension.type` 的任何依赖

```diff
// plugin-loader.ts
- import type { PluginRemoteModule } from './extension-types';
+ import type { PluginRemoteModule, UIExtension } from './extension-types';

// loadRemoteModule 返回类型不变，但内部 extensions 是 UIExtension[]
// registerAll 直接传入
if (module.extensions && module.extensions.length > 0) {
    ExtensionRegistry.registerAll(module.extensions);
}
```

#### 4.2 pluginId 自动注入

当前插件手动在每个 extension 中写 `pluginId`。改进：`plugin-loader.ts` 在注册时自动注入 `pluginId`，插件不需要写。

```typescript
// plugin-loader.ts loadPluginModule()
if (module.extensions && module.extensions.length > 0) {
    const enriched = module.extensions.map(ext => ({
        ...ext,
        pluginId: pluginId, // 自动注入，覆盖插件可能写的值
    }));
    ExtensionRegistry.registerAll(enriched);
}
```

这样插件端可以省略 `pluginId` 字段：

```typescript
// 插件端简化
export const extensions: Omit<UIExtension, 'pluginId'>[] = [
  { id: 'settings', slots: ['settings.plugin'], label: 'S3 Storage', component: SettingsPage },
];
```

#### 4.3 加载竞态保护（P0）

`loadPlugins()` 存在以下竞态风险：
1. 组件卸载后 loadPlugins 继续执行，注册到已清理的 Registry
2. 快速切换路由/重新挂载导致并发 loadPlugins 竞争
3. cleanup 函数中的 stale closure 引用旧 manifest 列表

**解决方案**：`loadPlugins` 接受 `AbortSignal`，每步操作前检查取消状态。

```typescript
// plugin-loader.ts
async function loadPlugins(
  manifests: PluginManifest[],
  signal?: AbortSignal,
): Promise<void> {
  for (const manifest of manifests) {
    // 每个插件加载前检查取消
    if (signal?.aborted) return;

    try {
      const module = await loadRemoteModule(manifest);
      if (signal?.aborted) return; // 加载完成后再检查

      if (module.extensions?.length) {
        const enriched = module.extensions.map(ext => ({
          ...ext,
          pluginId: manifest.pluginId,
        }));
        ExtensionRegistry.registerAll(enriched);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error(`Failed to load plugin ${manifest.pluginId}:`, err);
    }
  }
}

// PluginUILoader.tsx
function PluginUILoader({ children }) {
  const { data: manifests } = trpc.plugin.list.useQuery();

  useEffect(() => {
    if (!manifests?.length) return;

    const controller = new AbortController();
    loadPlugins(manifests, controller.signal);

    return () => {
      controller.abort();
      // 使用当前 manifests 引用（非 stale closure）清理
      for (const m of manifests) {
        ExtensionRegistry.unregisterPlugin(m.pluginId);
      }
    };
  }, [manifests]);

  return children;
}
```

---

### 5. 消费端迁移详情

#### 5.1 PluginSidebarExtensions.tsx

```diff
- const sidebarExtensions = extensions.filter(
-     (ext): ext is SidebarExtension => ext.type === ExtensionPoint.SIDEBAR
- );
+ // 直接替换整个组件体为：
+ <PluginSlot name="nav.sidebar" layout="stack" />
```

但 sidebar 有特殊渲染需求（`SidebarMenu`、`SidebarMenuItem`、active 状态检测），不能用通用 `<PluginSlot>` 直接渲染。

**方案**：`<PluginSlot>` 支持 **render prop**，让消费端控制单个 extension 的渲染方式：

```tsx
<PluginSlot
  name="nav.sidebar"
  renderItem={(ext, index) => (
    <SidebarMenuItem key={ext.id}>
      <SidebarMenuButton tooltip={ext.label} isActive={isActive(ext.path)} asChild>
        <Link to={ext.path!}>
          {ext.icon && <Icon name={ext.icon} />}
          <span>{ext.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )}
/>
```

这让 `<PluginSlot>` 既支持默认渲染（直接渲染 `ext.component`），也支持自定义渲染（render prop）。

更新 PluginSlotProps：

```typescript
interface PluginSlotProps {
  name: string;
  context?: Record<string, unknown>;
  layout?: 'inline' | 'stack' | 'tabs' | 'grid';
  className?: string;
  fallback?: React.ReactNode;
  /** 自定义单个 extension 的渲染方式（覆盖默认组件渲染） */
  renderItem?: (ext: UIExtension, index: number) => React.ReactNode;
  /** 前端权限过滤（仅 UI 优化，安全边界在后端） */
  permissionFilter?: (ext: UIExtension) => boolean;
}
```

渲染优先级：`renderItem` > `ext.component` / `ext.remoteComponent` > 报错

#### 5.2 SystemSettings.tsx

```diff
- const settingsTabExtensions = allExtensions
-     .filter((e): e is SettingsTabExtension => e.type === ExtensionPoint.SETTINGS_TAB)
-     .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

+ // 改用 useSlotExtensions
+ const settingsTabExtensions = useSlotExtensions('settings.plugin');
```

TabsList 和 TabsContent 渲染逻辑基本不变，只需把 `ext.type` 判断去掉。

#### 5.3 PluginPage.tsx

```diff
- const sidebarExtensions = extensions.filter(
-     (ext): ext is SidebarExtension =>
-         ext.type === ExtensionPoint.SIDEBAR && ext.pluginId === pluginId
- );
+ // 从 nav.sidebar slot 查询并按 pluginId 过滤
+ const allSidebarExts = useSlotExtensions('nav.sidebar');
+ const pluginExtensions = allSidebarExts.filter(ext => ext.pluginId === pluginId);
```

---

### 6. Manifest Schema 变更

#### 6.1 admin.extensions[] Zod Schema

```typescript
// packages/plugin/src/manifest.ts

const adminExtensionSchema = z.object({
  id: z.string().min(1),
  slots: z.array(z.string().min(1)).min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  order: z.number().optional(),
  category: z.string().optional(),
  component: z.string().optional(),        // export name, e.g., 'SettingsPage'
  remoteComponent: z.string().optional(),  // MF2.0 path, e.g., 'email_resend/SyncButton'
  path: z.string().optional(),             // route path for nav slots
  requiredPermission: z.string().optional(),
  colSpan: z.number().int().min(1).max(4).optional(),
});

// admin 部分更新
admin: z.object({
    remoteEntry: z.string(),
    devRemoteEntry: z.string().optional(),
    moduleName: z.string().optional(),
    exposes: z.record(z.string(), z.string()).optional(),
    extensions: z.array(adminExtensionSchema).optional(), // ← 新增，替代 menus[]
}).optional(),
```

#### 6.2 与后端 menus 表的关系

`admin.extensions[]` 中带 `path` 的条目（通常 slot 为 `nav.sidebar`）在插件安装时由 server 端提取并写入 `menus` 表。逻辑从读 `admin.menus[]` 改为读 `admin.extensions[].filter(e => e.path)`。

---

### 7. MF2.0 多入口（组件级注入用）

#### 7.1 rsbuild.config.ts 扩展

当前插件只 expose 一个入口：

```typescript
// 现有
exposes: { './admin': './src/admin/index.tsx' }
```

组件级注入时，可选 expose 额外组件：

```typescript
// 扩展后
exposes: {
  './admin': './src/admin/index.tsx',
  './SyncButton': './src/admin/components/SyncButton.tsx',  // 独立 expose
}
```

**v0.x 策略**：页面级插件不需要多入口（`component` 直接引用即可）。仅当插件需要注入到组件级 slot（如 `article.editor.actions`）时才添加额外 expose。

#### 7.2 loadRemote 路径约定

`remoteComponent` 格式：`{mfModuleName}/{exposeName}`

- `email_resend/SyncButton` → `loadRemote('email_resend/SyncButton')`
- `mfModuleName` 由 `getPluginMfName(pluginId)` 计算（已有逻辑）

---

### 8. 端到端数据流

```
┌─── 插件构建时 ───┐
│ plugin/src/admin/index.tsx                       │
│   export const extensions: UIExtension[] = [...]  │
│   export default { extensions, init }             │
│                                                   │
│ rsbuild → MF2.0 remoteEntry.js                   │
└──────────┬────────────────────────────────────────┘
           │
           ▼
┌─── Host 运行时 ───┐
│ PluginUILoader                                    │
│   ├─ trpc.plugin.list.useQuery()                  │
│   ├─ loadPlugins(manifests)                       │
│   │   ├─ MF2.0 registerRemotes + loadRemote       │
│   │   ├─ module.init?.()                          │
│   │   └─ ExtensionRegistry.registerAll(           │
│   │       module.extensions.map(e => ({...e, pluginId}))  │
│   │     )                                         │
│   └─ children 渲染                                │
│                                                   │
│ ExtensionRegistry                                 │
│   ├─ extensions: Map<key, UIExtension>            │
│   ├─ slotIndex: Map<slotName, Set<key>>           │
│   └─ notify listeners on change                   │
│                                                   │
│ <PluginSlot name="settings.plugin" layout="tabs"> │
│   ├─ useSlotExtensions('settings.plugin')         │
│   │   └─ Registry.getBySlot → [ext1, ext2, ...]  │
│   ├─ layout="tabs" → <Tabs>                      │
│   └─ per ext:                                     │
│       └─ <ErrorBoundary> → <Suspense>             │
│           └─ ext.component ?? RemoteComponent     │
└───────────────────────────────────────────────────┘
```
