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

### Decision 2: Slot & Fill + Targets 模式

插件通过 `targets: Target[]` 声明要注入的位置及每个位置的配置。Host 在 UI 中放置 `<PluginSlot name="..." />`，自动渲染所有匹配的 extensions。

**关键区分**：
- **Extension** = 插件能力（id、label、icon、component）
- **Target** = 该能力被投放到某个 UI 位置时的配置（slot、order、path、colSpan 等）

**Rationale**: 这是行业标准 Slot & Fill 模式（Grafana、Medusa、Strapi、Open edX 均采用）+ targets 分层避免"Prop Soup"：
- 插件不需要知道 UI 布局（只需知道 slot name）
- Host 控制渲染方式（`layout` prop）
- 同一 extension 可以出现在多个 slot 中，每个 slot 有独立配置（如不同 order）
- 没有 extension 时 slot 自动隐藏
- slot-specific 字段（path、colSpan）通过 discriminated union 在编译时约束

**Alternatives considered**:
- `slots: string[]` + 可选字段平铺 → "Prop Soup"，同一 extension 在不同 slot 中无法有不同配置
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

### Decision 4: 层级式 Slot 命名 + 白名单校验

```
{surface}.{page}.{area}
```

| 级别 | 示例 | 说明 |
|------|------|------|
| surface | `nav`, `dashboard`, `settings`, `article`, `entity` | 顶级 UI 区域 |
| page | `editor`, `list`, `detail` | 具体页面 |
| area | `actions`, `sidebar`, `before`, `after`, `toolbar` | 页面内位置 |

**Slot 白名单**：Host 定义 `CORE_SLOTS` 常量，Registry 注册时校验。未知 slot 在 dev 模式抛错，prod 模式 warn 并跳过。

支持通配符查询：`settings.*` 匹配所有设置相关 slot。

**Rationale**: 借鉴 Medusa（`product.details.before`）和 Shopify（`admin.product-details.block.render`）的命名方式，层级清晰、可预测。白名单防止 slot 拼写错误和未授权注入（类似 Shopify 的 target 必须在 TOML 中声明）。

### Decision 5: 权限由后端菜单系统主导

slot 中的导航类 extension（`nav.sidebar`、`settings.*`）必须映射到后端 `menus` 表，权限过滤在 server 端完成。`<PluginSlot>` 不做权限判定。

**Rationale**: 遵循 PERMISSION_GOVERNANCE.md — 权限裁决由 Core 集中处理。前端隐藏可被绕过，真正安全边界在后端。

**非导航 slot 的权限扩展**：target 中声明 `requiredPermission`（可选），`<PluginSlot>` 接受可选 `permissionFilter` prop，由消费端注入权限检查逻辑。前端过滤仅优化 UI 体验。

```tsx
// 消费端示例
<PluginSlot
  name="settings.plugin"
  layout="tabs"
  permissionFilter={(entry) => {
    const perm = 'requiredPermission' in entry.target ? entry.target.requiredPermission : undefined;
    if (!perm) return true;
    return ability.can('read', perm);
  }}
/>
```

## Risks / Trade-offs

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Slot 命名爆炸（未来 slot 太多难以管理） | Medium | Medium | CORE_SLOTS 白名单 + 文档化；v0.x 限定 ~15 个核心 slot |
| 权限漂移（前端 slot 展示 vs 后端菜单权限不一致） | High | Medium | 导航类 slot 强制映射到 menus 表；PluginSlot 不判定权限 |
| 迁移破坏现有插件 | Medium-High | Low | 项目未上线，直接修改插件代码；无外部插件需兼容 |
| MF2.0 多入口增加构建配置复杂度 | Low | Medium | 提供 rsbuild config helper；组件级 expose 可选 |
| 组件级注入的类型安全（context prop 类型不确定） | Medium | Medium | slot 定义时声明 context 类型；运行时做 best-effort 校验 |
| React.lazy 在渲染路径中重复创建导致状态丢失 | High | High | 模块级 Map 缓存 lazy 组件实例（见 §3.5） |
| useSlotExtensions 在 concurrent mode 下 tearing | Medium | Medium | 使用 useSyncExternalStore + Registry 引用稳定性缓存（见 §3.3） |
| loadPlugins 竞态（卸载后继续注册、并发加载） | High | Medium | AbortSignal 取消 + cleanup 使用当前引用（见 §4.3） |
| 插件注册到不存在的 slot（拼写错误） | Medium | High | CORE_SLOTS 白名单 + 注册时校验（见 §1.2） |

## Migration Plan

### Phase 0: 基础设施（不影响现有功能）
1. 定义 `UIExtension`、`Target`、`SlotEntry` 类型和 `CORE_SLOTS` 常量
2. 实现 `<PluginSlot>` 组件（空渲染）
3. 重写 `ExtensionRegistry`（双 Map + slot 白名单校验）

### Phase 1: 插件迁移（直接修改）
4. 迁移 storage-s3 插件（最简单，只有 settings_tab）
5. 迁移 email-resend 插件（sidebar + settings_tab → targets）
6. 迁移 hello-world 插件（sidebar + settings_tab → targets）
7. 更新消费端组件替换为 `<PluginSlot>` 调用

### Phase 2: 清理
8. 删除 `ExtensionPoint` enum 和旧接口（无需保留）
9. 删除 `admin.menus[]` manifest 字段（统一为 `admin.extensions[]`）
10. 更新 PLUGIN_TUTORIAL.md 和 PLUGIN_DEVELOPMENT.md

### Rollback
- 项目未上线，可直接 git revert 回退

## Open Questions（已解决）

~~1. 是否需要在 manifest.json 中声明 slot 白名单？~~
→ **需要**。Host 定义 `CORE_SLOTS`，Registry 注册时校验。manifest 中 `extensions[].targets[].slot` 必须在白名单内。

~~2. 组件级注入的 `context` prop 是否需要 Zod schema 校验？~~
→ **不需要**（v0.x）。SlotContext 是 Host→Plugin 内部契约，TypeScript 类型约束即可。运行时 Zod 校验有额外性能开销，且 slot 列表在编译时确定。

~~3. 未来是否允许平台管理员通过 Admin UI 调整 slot → extension 的映射关系？~~
→ **v0.x 不做**。数据模型已支持（target.order 可被数据库 override），v1.x 可在 Registry 之上加 `SlotLayoutConfig`。

---

## Technical Details

### 1. UIExtension 类型设计

#### 1.1 核心类型（替代旧 discriminated union）

```typescript
// apps/admin/src/lib/extensions/extension-types.ts

import type { ComponentType } from 'react';

// ─── Slot 白名单 ───

export const CORE_SLOTS = [
  'nav.sidebar',
  'settings.plugin',
  'dashboard.widgets',
  'dashboard.overview',
  'article.editor.actions',
  'article.editor.sidebar',
  'entity.detail.sidebar',
  'entity.list.toolbar',
] as const;

export type CoreSlot = typeof CORE_SLOTS[number];

/** 运行时校验 slot 是否合法 */
export function isValidSlot(slot: string): slot is CoreSlot {
  return (CORE_SLOTS as readonly string[]).includes(slot);
}

// ─── Target（slot-specific 配置） ───

export type Target =
  | NavTarget
  | SettingsTarget
  | DashboardTarget
  | GenericTarget;

export interface NavTarget {
  slot: 'nav.sidebar';
  path: string;              // 必填：路由路径
  order?: number;
  requiredPermission?: string;
}

export interface SettingsTarget {
  slot: 'settings.plugin';
  order?: number;
}

export interface DashboardTarget {
  slot: 'dashboard.widgets' | 'dashboard.overview';
  order?: number;
  colSpan?: 1 | 2 | 3 | 4;
}

export interface GenericTarget {
  slot: string;              // 其他 CORE_SLOTS 中的 slot
  order?: number;
}

// ─── UIExtension（插件能力） ───

/**
 * 统一 UI 扩展接口
 * Extension = 插件能力（身份 + 组件）
 * Target = 该能力投放到某个 UI 位置的配置
 */
export interface UIExtension {
  /** 唯一 ID，格式：{shortPluginName}.{purpose}，如 'email-resend.settings' */
  id: string;
  /** 插件 ID（reverse-domain），如 'com.wordrhyme.email-resend'。由 loader 自动注入 */
  pluginId: string;
  /** 显示标签 */
  label: string;
  /** 图标名（lucide-react），如 'Mail', 'Cloud' */
  icon?: string;
  /** 语义分类，如 'storage', 'notification', 'general' */
  category?: string;

  // --- 组件引用（二选一） ---
  /** 直接组件引用（通过 MF admin 入口已加载） */
  component?: ComponentType<SlotContext>;
  /** MF2.0 远程组件路径，如 'email_resend/SyncButton'（按需加载） */
  remoteComponent?: string;

  // --- 投放目标 ---
  /** 目标 slot 列表，每个 target 携带该 slot 的专属配置 */
  targets: Target[];
}

/** PluginSlot 传递给 extension 组件的上下文 */
export interface SlotContext {
  [key: string]: unknown;
}

/** Registry 查询结果：extension + 匹配的 target 配置 */
export interface SlotEntry {
  extension: UIExtension;
  target: Target;
}

/**
 * 插件远程模块接口（MF2.0 admin 入口导出）
 */
export interface PluginRemoteModule {
  extensions?: Omit<UIExtension, 'pluginId'>[];
  init?: () => void | Promise<void>;
}
```

#### 1.2 Slot 白名单校验

Registry 在注册时校验每个 target 的 slot：

```typescript
register(ext: UIExtension): void {
  for (const target of ext.targets) {
    if (!isValidSlot(target.slot)) {
      if (process.env.NODE_ENV === 'development') {
        throw new Error(
          `Unknown slot "${target.slot}" in extension "${ext.id}". ` +
          `Valid slots: ${CORE_SLOTS.join(', ')}`
        );
      }
      console.warn(`[ExtensionRegistry] Skipping unknown slot "${target.slot}" for "${ext.id}"`);
      continue; // prod 模式跳过未知 slot
    }
    // ... 注册到 slotIndex
  }
}
```

#### 1.3 类型辅助函数（插件 DX）

为常用 slot 提供辅助函数，自动构建 target 并约束字段：

```typescript
// @wordrhyme/plugin-api 导出

/** 导航 extension 辅助 */
export function navExtension(ext: {
  id: string;
  label: string;
  icon?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
  path: string;
  order?: number;
  requiredPermission?: string;
}): Omit<UIExtension, 'pluginId'> {
  const { path, order, requiredPermission, ...rest } = ext;
  return { ...rest, targets: [{ slot: 'nav.sidebar', path, order, requiredPermission }] };
}

/** 设置 extension 辅助 */
export function settingsExtension(ext: {
  id: string;
  label: string;
  icon?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
  order?: number;
  category?: string;
}): Omit<UIExtension, 'pluginId'> {
  const { order, ...rest } = ext;
  return { ...rest, targets: [{ slot: 'settings.plugin', order }] };
}

/** Dashboard widget extension 辅助 */
export function dashboardExtension(ext: {
  id: string;
  label: string;
  icon?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
  order?: number;
  colSpan?: 1 | 2 | 3 | 4;
}): Omit<UIExtension, 'pluginId'> {
  const { order, colSpan, ...rest } = ext;
  return { ...rest, targets: [{ slot: 'dashboard.widgets', order, colSpan }] };
}

/** 多 slot extension 辅助（nav + settings 常见组合） */
export function multiSlotExtension(ext: {
  id: string;
  label: string;
  icon?: string;
  component?: ComponentType<SlotContext>;
  remoteComponent?: string;
  category?: string;
  targets: Target[];
}): Omit<UIExtension, 'pluginId'> {
  return ext;
}
```

#### 1.4 设计要点

- **`component` vs `remoteComponent` 互斥**：运行时校验，两者都没有则报错
- **Target 是 discriminated union**：`NavTarget.path` 必填，`DashboardTarget.colSpan` 只在 dashboard slot 可用 — 编译时强制
- **`SlotContext` 是弱类型**：v0.x 用 `Record<string, unknown>`，不做 Zod 校验。TypeScript 泛型提供开发时类型提示
- **`SlotEntry` 分离关注点**：消费端拿到 `{ extension, target }`，extension 读 label/icon/component，target 读 slot-specific 配置

#### 1.5 插件导出格式

```typescript
// 旧格式（hello-world/src/admin/index.tsx）：
export const extensions: Extension[] = [
  { id: 'hello-world.sidebar', type: 'sidebar', label: '...', path: '...', component: Page },
  { id: 'hello-world.settings', type: 'settings_tab', label: '...', component: Settings },
];

// 新格式（使用辅助函数）：
import { navExtension, settingsExtension } from '@wordrhyme/plugin-api';

export const extensions = [
  navExtension({
    id: 'hello-world.page',
    label: 'Hello World',
    icon: 'Sparkles',
    path: '/p/com.wordrhyme.hello-world',
    component: HelloWorldPage,
  }),
  settingsExtension({
    id: 'hello-world.settings',
    label: 'Hello World',
    component: HelloWorldSettings,
  }),
];
```

> **注意**：hello-world 的 sidebar 和 settings 用不同组件，所以需要两个 extension。
> email-resend 两者用同一个 `SettingsPage`，可以用 `multiSlotExtension` 合并为一个。

```typescript
// email-resend（同一组件，多 slot）：
export const extensions = [
  multiSlotExtension({
    id: 'email-resend.main',
    label: 'Email (Resend)',
    icon: 'Mail',
    component: SettingsPage,
    targets: [
      { slot: 'nav.sidebar', path: '/p/com.wordrhyme.email-resend' },
      { slot: 'settings.plugin', order: 50 },
    ],
  }),
];
```

---

### 2. ExtensionRegistry 内部设计

#### 2.1 数据结构

```typescript
class ExtensionRegistryImpl {
  /** 主存储：extensionKey → UIExtension */
  private extensions: Map<string, UIExtension> = new Map();

  /** 反向索引：slotName → Set<extensionKey>，加速 getBySlot 查询 */
  private slotIndex: Map<string, Set<string>> = new Map();

  /** slot 查询结果缓存（引用稳定性） */
  private slotCache: Map<string, SlotEntry[]> = new Map();

  private listeners: Set<() => void> = new Set();
}
```

- **主存储** key 格式：`{pluginId}:{extensionId}`，保证唯一
- **slotIndex** 在 `register()` 时维护，`unregister()` 时同步清理
- **slotCache** 保证 `useSyncExternalStore` 引用稳定性 — 变更时清除受影响 slot 的缓存
- 查询流程：`getBySlot('nav.sidebar')` → 检查 slotCache → miss 时从 slotIndex 取 key 集合 → 组装 `SlotEntry[]` → 按 target.order 排序 → 写入 cache

#### 2.2 核心 API

```typescript
interface ExtensionRegistry {
  /** 注册单个 extension，校验 slot 白名单，维护 slotIndex */
  register(ext: UIExtension): void;

  /** 批量注册 */
  registerAll(exts: UIExtension[]): void;

  /** 按 exact slot name 查询，返回 extension + matched target 对 */
  getBySlot(slotName: string): SlotEntry[];

  /** 按通配符查询，如 'settings.*' */
  getBySlotPattern(pattern: string): SlotEntry[];

  /** 注销插件的所有 extension，清理 remoteComponentCache */
  unregisterPlugin(pluginId: string): number;

  /** 订阅变更（适配 useSyncExternalStore 签名） */
  subscribe(onStoreChange: () => void): () => void;

  /** 获取所有 extension（调试用） */
  getAll(): UIExtension[];
}
```

#### 2.3 getBySlot 实现

```typescript
getBySlot(slotName: string): SlotEntry[] {
  // 引用稳定性：缓存命中直接返回
  const cached = this.slotCache.get(slotName);
  if (cached) return cached;

  const keys = this.slotIndex.get(slotName);
  if (!keys || keys.size === 0) {
    const empty: SlotEntry[] = [];
    this.slotCache.set(slotName, empty);
    return empty;
  }

  const entries: SlotEntry[] = [];
  for (const key of keys) {
    const ext = this.extensions.get(key);
    if (!ext) continue;
    // 找到匹配此 slot 的 target
    const target = ext.targets.find(t => t.slot === slotName);
    if (target) {
      entries.push({ extension: ext, target });
    }
  }

  // 按 target.order 排序
  entries.sort((a, b) => (a.target.order ?? 100) - (b.target.order ?? 100));
  this.slotCache.set(slotName, entries);
  return entries;
}
```

#### 2.4 通配符匹配实现

```typescript
getBySlotPattern(pattern: string): SlotEntry[] {
  const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.+') + '$');
  const result: SlotEntry[] = [];
  const seen = new Set<string>();

  for (const [slotName] of this.slotIndex) {
    if (regex.test(slotName)) {
      for (const entry of this.getBySlot(slotName)) {
        const key = `${entry.extension.pluginId}:${entry.extension.id}:${slotName}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(entry);
        }
      }
    }
  }

  return result.sort((a, b) => (a.target.order ?? 100) - (b.target.order ?? 100));
}
```

#### 2.5 缓存失效

```typescript
register(ext: UIExtension): void {
  const key = `${ext.pluginId}:${ext.id}`;
  this.extensions.set(key, ext);

  for (const target of ext.targets) {
    if (!isValidSlot(target.slot)) {
      // 校验逻辑（见 §1.2）
      continue;
    }
    let slotSet = this.slotIndex.get(target.slot);
    if (!slotSet) {
      slotSet = new Set();
      this.slotIndex.set(target.slot, slotSet);
    }
    slotSet.add(key);
    // 清除受影响 slot 的缓存
    this.slotCache.delete(target.slot);
  }

  this.notify();
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
  /** 自定义单个 entry 的渲染方式（覆盖默认组件渲染） */
  renderItem?: (entry: SlotEntry, index: number) => React.ReactNode;
  /** 前端权限过滤（仅 UI 优化，安全边界在后端） */
  permissionFilter?: (entry: SlotEntry) => boolean;
}
```

#### 3.2 渲染流程

```
<PluginSlot name="settings.plugin" layout="tabs">
  │
  ├─ 1. useSlotExtensions(name)  ← 自定义 Hook
  │     └─ ExtensionRegistry.getBySlot(name)
  │     └─ useSyncExternalStore 监听变更
  │
  ├─ 2. permissionFilter ? entries.filter(permissionFilter) : entries
  │
  ├─ 3. entries.length === 0 → return fallback ?? null
  │
  ├─ 4. 根据 layout 选择渲染策略：
  │     ├─ 'inline'  → <div style="display:flex; gap:8px"> 水平排列
  │     ├─ 'stack'   → <div style="display:flex; flex-direction:column"> 垂直堆叠
  │     ├─ 'tabs'    → <Tabs> + <TabsTrigger>/<TabsContent> per entry
  │     └─ 'grid'    → <div style="display:grid; ..."> 网格（读 target.colSpan）
  │
  └─ 5. 每个 entry 渲染：
        ├─ renderItem ? renderItem(entry, i)
        └─ 默认：
            └─ <PluginErrorBoundary pluginId={entry.extension.pluginId}>
                 └─ <Suspense fallback={<Skeleton min-h-[64px]/>}>
                      └─ entry.extension.component
                           ? <ext.component {...context} />
                           : <RemoteComponent remote={ext.remoteComponent} {...context} />
```

#### 3.3 useSlotExtensions Hook

使用 `useSyncExternalStore` 避免 React 18 concurrent mode 下的 tearing 风险：

```typescript
import { useSyncExternalStore, useCallback } from 'react';

function useSlotExtensions(slotName: string): SlotEntry[] {
  const getSnapshot = useCallback(
    () => ExtensionRegistry.getBySlot(slotName),
    [slotName],
  );

  return useSyncExternalStore(
    ExtensionRegistry.subscribe,
    getSnapshot,
    getSnapshot, // SSR snapshot
  );
}
```

> Registry 内部 `slotCache` 保证 `getBySlot()` 在数据未变时返回同一引用，避免 `useSyncExternalStore` 无限 re-render。

#### 3.4 `useSlotExtensions` 也独立导出

复杂消费场景（sidebar 需要自定义 SidebarMenu/Link 渲染）直接使用 Hook，不通过 `<PluginSlot>`：

```tsx
// PluginSidebarExtensions.tsx
function PluginSidebarExtensions() {
  const entries = useSlotExtensions('nav.sidebar');
  if (!entries.length) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Plugins</SidebarGroupLabel>
      <SidebarMenu>
        {entries.map(({ extension: ext, target }) => (
          <SidebarMenuItem key={ext.id}>
            <SidebarMenuButton
              tooltip={ext.label}
              isActive={target.slot === 'nav.sidebar' && isActive(target.path)}
              asChild
            >
              <Link to={target.slot === 'nav.sidebar' ? target.path : '#'}>
                {ext.icon && <Icon name={ext.icon} />}
                <span>{ext.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
```

#### 3.5 RemoteComponent 延迟加载器

**关键：React.lazy 必须在模块级缓存，不能在渲染路径中创建。**

```tsx
/** 模块级缓存：remote path → lazy component */
const remoteComponentCache = new Map<string, React.LazyExoticComponent<ComponentType<any>>>();

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

function RemoteComponent({ remote, ...props }: { remote: string } & Record<string, unknown>) {
  const Component = getOrCreateRemoteComponent(remote);
  return (
    <Suspense fallback={<Skeleton className="h-16 w-full min-h-[64px]" />}>
      <Component {...props} />
    </Suspense>
  );
}
```

> `unregisterPlugin()` 应同时清理该插件对应的 `remoteComponentCache` 条目。

#### 3.6 ErrorBoundary 增强

两层 ErrorBoundary 策略：
1. **外层**：`<PluginSlot>` 级别 — 捕获整个 slot 的致命错误
2. **内层**：per-extension 级别 — 单个 extension 失败不影响其他 extension

内层支持 retry：

```tsx
class PluginErrorBoundary extends React.Component<
  { pluginId: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

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

---

### 4. plugin-loader.ts 变更

#### 4.1 变更范围

核心逻辑不变：MF2.0 `loadRemote` → 获取模块 → 注册 extensions。变更：

1. `PluginRemoteModule.extensions` 类型从 `Extension[]` 改为 `Omit<UIExtension, 'pluginId'>[]`
2. loader 自动注入 `pluginId`
3. 移除对 `extension.type` 的任何依赖

#### 4.2 pluginId 自动注入

```typescript
if (module.extensions?.length) {
  const enriched: UIExtension[] = module.extensions.map(ext => ({
    ...ext,
    pluginId: manifest.pluginId, // 自动注入
  }));
  ExtensionRegistry.registerAll(enriched);
}
```

#### 4.3 加载竞态保护（P0）

`loadPlugins()` 接受 `AbortSignal`，每步操作前检查取消状态：

```typescript
async function loadPlugins(
  manifests: PluginManifest[],
  signal?: AbortSignal,
): Promise<void> {
  for (const manifest of manifests) {
    if (signal?.aborted) return;

    try {
      const module = await loadRemoteModule(manifest);
      if (signal?.aborted) return;

      if (module.extensions?.length) {
        const enriched: UIExtension[] = module.extensions.map(ext => ({
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
function PluginUILoader({ children }: { children: React.ReactNode }) {
  const { data: manifests } = trpc.plugin.list.useQuery();

  useEffect(() => {
    if (!manifests?.length) return;

    const controller = new AbortController();
    loadPlugins(manifests, controller.signal);

    return () => {
      controller.abort();
      for (const m of manifests) {
        ExtensionRegistry.unregisterPlugin(m.pluginId);
      }
    };
  }, [manifests]);

  return <>{children}</>;
}
```

---

### 5. 消费端迁移详情

#### 5.1 PluginSidebarExtensions.tsx

直接使用 `useSlotExtensions` Hook + 自定义渲染（见 §3.4）。核心变更：

```diff
- const sidebarExtensions = extensions.filter(
-     (ext): ext is SidebarExtension => ext.type === ExtensionPoint.SIDEBAR
- );
+ const entries = useSlotExtensions('nav.sidebar');
```

渲染中通过 `entry.target` 获取 `path`：

```diff
- <Link to={ext.path}>
+ <Link to={entry.target.slot === 'nav.sidebar' ? entry.target.path : '#'}>
```

#### 5.2 SystemSettings.tsx

```diff
- const settingsTabExtensions = allExtensions
-     .filter((e): e is SettingsTabExtension => e.type === ExtensionPoint.SETTINGS_TAB)
-     .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

+ const entries = useSlotExtensions('settings.plugin');
+ // 已按 target.order 排序
```

TabsList / TabsContent 渲染改为用 `entry.extension.label`、`entry.extension.component` 等。

#### 5.3 PluginPage.tsx

```diff
- const sidebarExtensions = extensions.filter(
-     (ext): ext is SidebarExtension =>
-         ext.type === ExtensionPoint.SIDEBAR && ext.pluginId === pluginId
- );
+ const allEntries = useSlotExtensions('nav.sidebar');
+ const pluginEntries = allEntries.filter(e => e.extension.pluginId === pluginId);
```

---

### 6. Manifest Schema 变更

#### 6.1 admin.extensions[] Zod Schema

```typescript
// packages/plugin/src/manifest.ts

const targetSchema = z.discriminatedUnion('slot', [
  z.object({
    slot: z.literal('nav.sidebar'),
    path: z.string().min(1),
    order: z.number().optional(),
    requiredPermission: z.string().optional(),
  }),
  z.object({
    slot: z.literal('settings.plugin'),
    order: z.number().optional(),
  }),
  z.object({
    slot: z.enum(['dashboard.widgets', 'dashboard.overview']),
    order: z.number().optional(),
    colSpan: z.number().int().min(1).max(4).optional(),
  }),
  // generic fallback for other CORE_SLOTS
  z.object({
    slot: z.string().min(1),
    order: z.number().optional(),
  }),
]);

const adminExtensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  category: z.string().optional(),
  component: z.string().optional(),
  remoteComponent: z.string().optional(),
  targets: z.array(targetSchema).min(1),
});

// admin 部分更新
admin: z.object({
  remoteEntry: z.string(),
  devRemoteEntry: z.string().optional(),
  moduleName: z.string().optional(),
  exposes: z.record(z.string(), z.string()).optional(),
  extensions: z.array(adminExtensionSchema).optional(),
}).optional(),
```

#### 6.2 与后端 menus 表的关系

`admin.extensions[]` 中 targets 含 `slot: 'nav.sidebar'` 的条目在插件安装时由 server 端提取 `path` + `requiredPermission` 并写入 `menus` 表。逻辑从读 `admin.menus[]` 改为：

```typescript
const navTargets = manifest.admin.extensions
  .flatMap(ext => ext.targets
    .filter(t => t.slot === 'nav.sidebar')
    .map(t => ({ extensionId: ext.id, label: ext.label, icon: ext.icon, ...t }))
  );
```

---

### 7. MF2.0 多入口（组件级注入用）

#### 7.1 rsbuild.config.ts 扩展

当前插件只 expose 一个入口：

```typescript
exposes: { './admin': './src/admin/index.tsx' }
```

组件级注入时，可选 expose 额外组件：

```typescript
exposes: {
  './admin': './src/admin/index.tsx',
  './SyncButton': './src/admin/components/SyncButton.tsx',
}
```

**v0.x 策略**：页面级插件不需要多入口。仅当插件需要注入到组件级 slot 时才添加额外 expose。

#### 7.2 loadRemote 路径约定

`remoteComponent` 格式：`{mfModuleName}/{exposeName}`
- `email_resend/SyncButton` → `loadRemote('email_resend/SyncButton')`
- `mfModuleName` 由 `getPluginMfName(pluginId)` 计算（已有逻辑）

---

### 8. 端到端数据流

```
┌─── 插件构建时 ───┐
│ plugin/src/admin/index.tsx                             │
│   export const extensions = [                           │
│     navExtension({ id, label, path, component }),       │
│     settingsExtension({ id, label, component }),        │
│   ]                                                     │
│   export default { extensions, init }                   │
│                                                         │
│ rsbuild → MF2.0 remoteEntry.js                         │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─── Host 运行时 ───┐
│ PluginUILoader                                          │
│   ├─ trpc.plugin.list.useQuery()                        │
│   ├─ loadPlugins(manifests, signal)                     │
│   │   ├─ MF2.0 registerRemotes + loadRemote             │
│   │   ├─ module.init?.()                                │
│   │   └─ ExtensionRegistry.registerAll(                 │
│   │       module.extensions.map(e => ({...e, pluginId}))│
│   │     )                                               │
│   │     ├─ validate slots against CORE_SLOTS            │
│   │     ├─ build slotIndex (slot → extensionKey)        │
│   │     └─ invalidate slotCache                         │
│   └─ children 渲染                                      │
│                                                         │
│ ExtensionRegistry                                       │
│   ├─ extensions: Map<key, UIExtension>                  │
│   ├─ slotIndex: Map<slotName, Set<key>>                 │
│   ├─ slotCache: Map<slotName, SlotEntry[]>              │
│   └─ notify listeners on change                         │
│                                                         │
│ <PluginSlot name="settings.plugin" layout="tabs">       │
│   ├─ useSlotExtensions('settings.plugin')               │
│   │   └─ useSyncExternalStore                           │
│   │       └─ Registry.getBySlot → SlotEntry[]           │
│   ├─ layout="tabs" → <Tabs>                            │
│   └─ per entry:                                         │
│       └─ <ErrorBoundary> → <Suspense>                   │
│           └─ entry.extension.component ?? RemoteComponent│
└─────────────────────────────────────────────────────────┘
```
