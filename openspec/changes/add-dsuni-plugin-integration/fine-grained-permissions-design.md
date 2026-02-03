# DSUni 插件权限设计（细粒度 RBAC）

## 权限定义

```typescript
// manifest.ts
export const { manifest, PERMISSIONS } = definePlugin({
  pluginId: 'com.wordrhyme.dsuni',

  permissions: {
    // ========== 产品管理 ==========
    products: {
      view: '查看产品列表和详情',
      create: '创建新产品',
      update: '编辑产品信息（名称、描述、价格等）',
      delete: '删除产品',
      publish: '发布产品到在线商店',         // 细粒度：上架
      unpublish: '下架产品',                // 细粒度：下架
      export: '导出产品数据',                // 批量操作
      import: '批量导入产品',                // 批量操作
    },

    // ========== SKU/变体管理 ==========
    variations: {
      view: '查看产品变体',
      create: '创建SKU',
      update: '更新SKU（价格、库存）',
      delete: '删除SKU',
      adjustStock: '调整库存数量',           // 细粒度：库存管理
    },

    // ========== 订单管理 ==========
    orders: {
      view: '查看订单列表和详情',
      create: '创建订单（手动下单）',
      updateInfo: '修改订单信息（地址、备注）',  // 客服权限
      updateStatus: '手动更改订单状态',         // 管理员权限

      // ========== 业务操作（细粒度）==========
      fulfill: '标记订单为已发货',              // 仓库权限
      ship: '添加物流信息',                    // 仓库权限
      cancel: '取消订单',                      // 客服权限
      refund: '处理退款',                      // 财务权限

      delete: '删除订单（危险操作）',           // 超级管理员
      export: '导出订单数据',                  // 报表权限
    },

    // ========== 库存管理 ==========
    inventory: {
      view: '查看库存报表',
      adjust: '手动调整库存',                  // 仓库主管
      transfer: '库存调拨',                    // 仓库主管
      audit: '盘点库存',                       // 仓库主管
    },

    // ========== 外部平台同步 ==========
    sync: {
      view: '查看同步状态',
      trigger: '手动触发同步',                 // 运营人员
      configure: '配置同步规则',               // 管理员
    },

    // ========== 插件设置 ==========
    settings: {
      view: '查看插件配置',
      update: '修改插件配置',                  // 管理员
      resetAll: '重置所有配置（危险）',         // 超级管理员
    },

    // ========== 报表与分析 ==========
    reports: {
      view: '查看销售报表',
      export: '导出报表数据',
      financialView: '查看财务数据',           // 财务权限
    },
  },
});
```

---

## 典型角色配置

### 1. 产品管理员
**职责**: 管理产品目录，上架下架

```yaml
permissions:
  - com.wordrhyme.dsuni.products.view
  - com.wordrhyme.dsuni.products.create
  - com.wordrhyme.dsuni.products.update
  - com.wordrhyme.dsuni.products.publish    # ← 可以上架
  - com.wordrhyme.dsuni.products.unpublish  # ← 可以下架
  - com.wordrhyme.dsuni.variations.view
  - com.wordrhyme.dsuni.variations.create
  - com.wordrhyme.dsuni.variations.update
```

### 2. 仓库管理员
**职责**: 发货、更新物流、调整库存

```yaml
permissions:
  - com.wordrhyme.dsuni.orders.view
  - com.wordrhyme.dsuni.orders.fulfill      # ← 标记发货
  - com.wordrhyme.dsuni.orders.ship         # ← 更新物流
  - com.wordrhyme.dsuni.inventory.view
  - com.wordrhyme.dsuni.inventory.adjust    # ← 调整库存
  - com.wordrhyme.dsuni.variations.adjustStock
```

### 3. 客服人员
**职责**: 修改订单信息、取消订单、查看产品

```yaml
permissions:
  - com.wordrhyme.dsuni.products.view
  - com.wordrhyme.dsuni.orders.view
  - com.wordrhyme.dsuni.orders.updateInfo   # ← 修改地址
  - com.wordrhyme.dsuni.orders.cancel       # ← 取消订单
```

### 4. 财务人员
**职责**: 处理退款、查看财务报表

```yaml
permissions:
  - com.wordrhyme.dsuni.orders.view
  - com.wordrhyme.dsuni.orders.refund       # ← 处理退款
  - com.wordrhyme.dsuni.reports.financialView  # ← 财务数据
  - com.wordrhyme.dsuni.reports.export
```

### 5. 运营人员
**职责**: 同步外部平台、查看报表

```yaml
permissions:
  - com.wordrhyme.dsuni.products.view
  - com.wordrhyme.dsuni.orders.view
  - com.wordrhyme.dsuni.sync.view
  - com.wordrhyme.dsuni.sync.trigger        # ← 手动同步
  - com.wordrhyme.dsuni.reports.view
```

### 6. 超级管理员
**职责**: 所有权限

```yaml
permissions:
  - com.wordrhyme.dsuni.*                   # 通配符（所有权限）
```

---

## 权限检查示例

### 场景1: 订单发货流程

```typescript
// src/routers/orders.ts

// ========== 1. 标记为已发货（仓库） ==========
fulfill: pluginProcedure
  .meta({ permission: PERMISSIONS.orders.fulfill })
  .input(z.object({ orderId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.update(orders)
      .set({
        status: 'fulfilled',
        fulfilledAt: new Date(),
        fulfilledBy: ctx.userId,
      })
      .where(eq(orders.id, input.orderId));
  }),

// ========== 2. 添加物流信息（仓库） ==========
ship: pluginProcedure
  .meta({ permission: PERMISSIONS.orders.ship })
  .input(z.object({
    orderId: z.string(),
    carrier: z.string(),
    trackingNumber: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.insert(fulfillments).values({
      orderId: input.orderId,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      shippedAt: new Date(),
    });
  }),
```

### 场景2: 产品上下架（产品管理员）

```typescript
// ========== 上架产品 ==========
publish: pluginProcedure
  .meta({ permission: PERMISSIONS.products.publish })
  .input(z.object({ productId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.update(products)
      .set({
        status: 'published',
        publishedAt: new Date(),
      })
      .where(eq(products.id, input.productId));

    // 触发同步到外部平台
    await ctx.hooks.emit('dsuni.product.published', { productId: input.productId });
  }),

// ========== 下架产品 ==========
unpublish: pluginProcedure
  .meta({ permission: PERMISSIONS.products.unpublish })
  .input(z.object({ productId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.update(products)
      .set({ status: 'draft' })
      .where(eq(products.id, input.productId));
  }),
```

---

## 权限粒度决策树

```
是否是标准 CRUD？
├─ 是 → 使用 view/create/update/delete
└─ 否 → 是否涉及业务流程？
    ├─ 是 → 定义业务操作权限
    │       例如：fulfill, publish, refund
    └─ 否 → 是否涉及敏感数据？
        ├─ 是 → 定义独立权限
        │       例如：financialView, exportAll
        └─ 否 → 合并到父级权限
```

---

## 权限命名规范

### 动词选择

| 操作类型 | 推荐动词 | 示例 |
|---------|---------|------|
| 查看 | view, read, list | `products.view` |
| 创建 | create, add | `products.create` |
| 修改 | update, edit | `products.update` |
| 删除 | delete, remove | `products.delete` |
| 业务操作 | 具体动词 | `orders.fulfill`, `products.publish` |
| 批量操作 | export, import | `products.export` |
| 配置 | configure, manage | `settings.configure` |

### ✅ 好的命名

```typescript
permissions: {
  orders: {
    view: '...',
    fulfill: '...',      // ✅ 清晰的业务动作
    refund: '...',       // ✅ 财务操作
    cancel: '...',       // ✅ 客服操作
  },
}
```

### ❌ 不好的命名

```typescript
permissions: {
  orders: {
    view: '...',
    manage: '...',       // ❌ 太宽泛
    do: '...',           // ❌ 无意义
    action1: '...',      // ❌ 不语义化
  },
}
```

---

## 总结

**细粒度权限的好处**:
1. ✅ 职责分离（仓库、客服、财务各司其职）
2. ✅ 安全性更高（最小权限原则）
3. ✅ 灵活的角色配置（管理员可以自由组合）
4. ✅ 审计追踪（知道谁做了什么操作）

**关键原则**:
- 权限应该反映**真实的业务流程**
- 不要用 `manage` 这种模糊权限
- 宁可多定义几个细粒度权限，也不要合并成粗粒度
- 权限命名要清晰语义化
