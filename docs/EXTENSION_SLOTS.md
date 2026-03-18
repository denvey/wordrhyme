# Extension Slots 扩展插槽

Extension Slots 是 WordRhyme 平台的 UI 扩展机制——插件可以在其他插件的页面中注入 UI 组件，类似于 Shopify Admin Extensions 的 `target` 或 VS Code 的 `contributes`。

## 核心概念

| 概念 | 说明 |
|------|------|
| **Slot** | 页面中预定义的注入点，如 `shop.product.detail.actions` |
| **Extension** | 插件注入到 slot 中的 UI 组件 |
| **PluginSlot** | React 组件，渲染注册到指定 slot 的所有扩展 |

## 可用 Slots

### 平台级 Slots

| Slot | 说明 |
|------|------|
| `nav.sidebar` | 侧边栏导航项 |
| `settings.plugin` | 插件设置页 tab |
| `dashboard.widgets` | 仪表盘小组件 |

### Shop 插件 Slots

#### 商品模块

| Slot | 位置 | 布局 | Context |
|------|------|------|---------|
| `shop.product.list.toolbar` | 商品列表标题栏右侧 | inline | — |
| `shop.product.list.bulk-actions` | 批量操作区 | inline | `{ selectedIds }` |
| `shop.product.detail.actions` | 商品详情 header 操作区 | inline | `{ productId, product }` |
| `shop.product.detail.block` | 商品详情主内容下方 | stack | `{ productId, product }` |
| `shop.product.detail.sidebar` | 商品详情侧边栏 | stack | `{ productId, product }` |
| `shop.product.edit.before` | 编辑表单前置 | stack | `{ productId, product }` |
| `shop.product.edit.after` | 编辑表单后置（Save 按钮前） | stack | `{ productId, product }` |

#### 订单模块

| Slot | 位置 | 布局 | Context |
|------|------|------|---------|
| `shop.order.list.toolbar` | 订单列表标题栏右侧 | inline | — |
| `shop.order.list.bulk-actions` | 批量操作区 | inline | `{ selectedIds }` |
| `shop.order.detail.actions` | 订单详情操作按钮区 | inline | `{ orderId, order }` |
| `shop.order.detail.block` | 订单详情主内容下方 | stack | `{ orderId, order }` |
| `shop.order.detail.sidebar` | 订单详情侧边栏 | stack | `{ orderId, order }` |

#### 全局

| Slot | 位置 |
|------|------|
| `shop.global.navigation` | Shop 导航区域 |

## 使用方式

### 方式 1：JSON 声明式（manifest.json）

适合静态、固定的扩展注册，类似 Shopify TOML / VS Code contributes：

```json
// manifest.json
{
    "admin": {
        "extensions": [
            {
                "id": "dsuni.sync-to-stores",
                "label": "同步到店铺",
                "targets": [
                    { "slot": "shop.product.detail.actions", "order": 10 },
                    { "slot": "shop.product.list.bulk-actions", "order": 10 },
                    { "slot": "shop.order.list.toolbar", "order": 20 }
                ]
            }
        ]
    }
}
```

### 方式 2：代码注册式（admin/index.tsx）

适合动态、条件注册，类似 WooCommerce `add_action()`：

```tsx
import { multiSlotExtension } from '@wordrhyme/plugin';

function SyncToStoresButton({ productId }: { productId: string }) {
    return <button onClick={() => syncProduct(productId)}>同步到店铺</button>;
}

export const extensions = [
    multiSlotExtension({
        id: 'dsuni.sync-to-stores',
        label: '同步到店铺',
        component: SyncToStoresButton,
        targets: [
            { slot: 'shop.product.detail.actions', order: 10 },
            { slot: 'shop.product.list.bulk-actions', order: 10 },
        ],
    }),
];
```

## 宿主端：放置 PluginSlot

如果你开发的插件需要**允许其他插件注入 UI**，在页面中放置 `<PluginSlot>`：

```tsx
import { PluginSlot } from '@wordrhyme/plugin/react';

function ProductDetailPage({ productId, product }) {
    return (
        <div>
            <h1>{product.name}</h1>

            {/* 其他插件可以在这里注入操作按钮 */}
            <PluginSlot
                name="shop.product.detail.actions"
                layout="inline"
                context={{ productId, product }}
            />

            {/* ... 页面内容 ... */}

            {/* 其他插件可以在这里注入内容块 */}
            <PluginSlot
                name="shop.product.detail.block"
                context={{ productId, product }}
            />
        </div>
    );
}
```

### PluginSlot Props

| Prop | 类型 | 默认 | 说明 |
|------|------|------|------|
| `name` | `string` | — | Slot 名称（必填） |
| `context` | `Record<string, unknown>` | — | 传递给所有注入组件的上下文数据 |
| `layout` | `'inline' \| 'stack' \| 'tabs' \| 'grid'` | `'stack'` | 布局模式 |
| `className` | `string` | — | CSS 类名 |
| `fallback` | `ReactNode` | `null` | 无注册扩展时的占位内容 |

### 注册新 Slot

1. 在 `apps/admin/src/lib/extensions/extension-types.ts` 的 `CORE_SLOTS` 中添加 slot 名称
2. 在插件的 `manifest.json` 的 `extensionSlots` 中声明（可选，供文档）
3. 在页面中放置 `<PluginSlot name="your.new.slot" />`

## Slot 命名规范

```
{plugin}.{entity}.{page}.{position}
```

- `plugin`: 插件短名（如 `shop`）
- `entity`: 业务实体（如 `product`、`order`）
- `page`: 页面（如 `list`、`detail`、`edit`）
- `position`: 位置（如 `toolbar`、`actions`、`block`、`sidebar`、`before`、`after`）

## 运行时原理

```
admin host 启动
  └→ bootstrap.tsx: __setPluginSlot(PluginSlot)
      └→ 注入到 @wordrhyme/plugin/react 的全局变量

插件页面渲染
  └→ import { PluginSlot } from '@wordrhyme/plugin/react'
      └→ PluginSlot 代理组件 → 转发到 admin host 注入的真实实现
          └→ useSlotExtensions(name) → 从 ExtensionRegistry 获取该 slot 的所有扩展
              └→ 按 order 排序渲染每个扩展组件
```
