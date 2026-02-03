# definePlugin 完整实现方案

## 核心设计：单一入口函数

```typescript
// @wordrhyme/plugin/src/define-plugin.ts

export interface PluginDefinition {
  pluginId: string;
  version: string;
  name: string;
  description?: string;

  // 权限定义（自动转换为数组 + 添加前缀）
  permissions?: Record<string, Record<string, string>>;

  capabilities?: {
    data?: { read?: boolean; write?: boolean };
    ui?: { adminPage?: boolean; settingsTab?: boolean };
  };

  server?: {
    entry: string;
  };

  admin?: {
    remoteEntry: string;
    menus?: Array<{
      id: string;
      label: string;
      icon?: string;
      path: string;
    }>;
  };

  dataRetention?: {
    onDisable: 'retain' | 'delete';
    onUninstall: 'archive' | 'delete';
    tables: string[];
  };

  dependencies?: {
    required?: string[];
    optional?: string[];
  };
}

export interface PluginResult<P extends PluginDefinition> {
  manifest: PluginManifest;
  PERMISSIONS: PermissionKeys<P['permissions']>;
}

export function definePlugin<P extends PluginDefinition>(
  config: P
): PluginResult<P> {
  const { pluginId, permissions, ...rest } = config;

  // 1. 转换权限定义（添加 pluginId 前缀）
  const permissionDefinitions: Array<{ key: string; description: string }> = [];
  const permissionKeys: any = {};

  if (permissions) {
    for (const [group, perms] of Object.entries(permissions)) {
      permissionKeys[group] = {};
      for (const [action, description] of Object.entries(perms)) {
        const fullKey = `${pluginId}.${group}.${action}`;
        permissionDefinitions.push({ key: fullKey, description });
        permissionKeys[group][action] = fullKey;
      }
    }
  }

  // 2. 构建 manifest
  const manifest: PluginManifest = {
    pluginId,
    ...rest,
    permissions: permissionDefinitions.length > 0 ? {
      definitions: permissionDefinitions,
    } : undefined,
  };

  // 3. 运行时验证
  pluginManifestSchema.parse(manifest);

  return {
    manifest,
    PERMISSIONS: permissionKeys as PermissionKeys<P['permissions']>,
  };
}

// ============= 类型工具 =============

type PermissionKeys<T> = T extends Record<string, Record<string, string>>
  ? {
      [Group in keyof T]: {
        [Action in keyof T[Group]]: string; // 完整 key: pluginId.group.action
      };
    }
  : {};

// ============= 示例 =============

const { manifest, PERMISSIONS } = definePlugin({
  pluginId: 'com.wordrhyme.dsuni',
  version: '1.0.0',

  permissions: {
    products: {
      view: '查看产品',
      create: '创建产品',
      update: '更新产品',
      delete: '删除产品',
    },
    orders: {
      view: '查看订单',
      fulfill: '履行订单',
    },
  },
});

// 结果：
// PERMISSIONS.products.view === 'com.wordrhyme.dsuni.products.view'
// PERMISSIONS.products.create === 'com.wordrhyme.dsuni.products.create'
// PERMISSIONS.orders.fulfill === 'com.wordrhyme.dsuni.orders.fulfill'

// manifest.permissions.definitions:
// [
//   { key: 'com.wordrhyme.dsuni.products.view', description: '查看产品' },
//   { key: 'com.wordrhyme.dsuni.products.create', description: '创建产品' },
//   { key: 'com.wordrhyme.dsuni.products.update', description: '更新产品' },
//   { key: 'com.wordrhyme.dsuni.products.delete', description: '删除产品' },
//   { key: 'com.wordrhyme.dsuni.orders.view', description: '查看订单' },
//   { key: 'com.wordrhyme.dsuni.orders.fulfill', description: '履行订单' },
// ]
```

---

## 使用示例

### manifest.ts (插件配置)

```typescript
import { definePlugin } from '@wordrhyme/plugin';

export const { manifest, PERMISSIONS } = definePlugin({
  pluginId: 'com.wordrhyme.dsuni',
  version: '1.0.0',
  name: 'DSUni E-commerce',
  description: 'Product and order management system',

  // ========== 权限定义 ==========
  permissions: {
    products: {
      view: '查看产品列表',
      create: '创建产品',
      update: '更新产品信息',
      delete: '删除产品',
      export: '导出产品数据',
    },
    variations: {
      view: '查看SKU变体',
      create: '创建SKU',
      update: '更新SKU',
      delete: '删除SKU',
    },
    orders: {
      view: '查看订单列表',
      create: '创建订单',
      update: '更新订单状态',
      fulfill: '标记订单为已发货',
      cancel: '取消订单',
      refund: '退款',
    },
    settings: {
      view: '查看插件配置',
      update: '修改插件配置',
    },
  },

  // ========== 能力声明 ==========
  capabilities: {
    data: {
      write: true, // 需要写数据库权限
    },
    ui: {
      adminPage: true, // 提供管理页面
      settingsTab: true, // 提供设置页面
    },
  },

  // ========== 服务端入口 ==========
  server: {
    entry: './dist/server/index.js',
  },

  // ========== 前端入口 ==========
  admin: {
    remoteEntry: './dist/admin/remoteEntry.js',
    menus: [
      {
        id: 'products',
        label: '产品管理',
        icon: 'Package',
        path: '/products',
      },
      {
        id: 'orders',
        label: '订单管理',
        icon: 'ShoppingCart',
        path: '/orders',
      },
    ],
  },

  // ========== 数据保留策略 ==========
  dataRetention: {
    onDisable: 'retain',
    onUninstall: 'archive',
    tables: [
      'plugin_dsuni_products',
      'plugin_dsuni_product_variations',
      'plugin_dsuni_product_media',
      'plugin_dsuni_orders',
      'plugin_dsuni_order_line_items',
      'plugin_dsuni_fulfillments',
    ],
  },

  // ========== 依赖项 ==========
  dependencies: {
    optional: [
      'com.wordrhyme.shopify',
      'com.wordrhyme.woocommerce',
      'com.wordrhyme.alibaba',
    ],
  },
});
```

### 在代码中使用权限

```typescript
// src/routers/products.ts
import { PERMISSIONS } from '../../manifest';

export const productsRouter = router({
  // ========== 查看产品列表 ==========
  list: pluginProcedure
    .meta({ permission: PERMISSIONS.products.view })
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^
    //                    'com.wordrhyme.dsuni.products.view'
    .input(listProductsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(products).limit(input.limit);
    }),

  // ========== 创建产品 ==========
  create: pluginProcedure
    .meta({ permission: PERMISSIONS.products.create })
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^^
    //                    'com.wordrhyme.dsuni.products.create'
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(products).values(input);
    }),

  // ========== 删除产品 ==========
  delete: pluginProcedure
    .meta({ permission: PERMISSIONS.products.delete })
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^^
    //                    'com.wordrhyme.dsuni.products.delete'
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.delete(products).where(eq(products.id, input.id));
    }),
});
```

### 在前端使用权限检查

```typescript
// src/admin/components/ProductList.tsx
import { PERMISSIONS } from '../../../manifest';
import { usePermission } from '@wordrhyme/ui';

export function ProductList() {
  const canCreate = usePermission(PERMISSIONS.products.create);
  const canDelete = usePermission(PERMISSIONS.products.delete);

  return (
    <div>
      {canCreate && <Button>创建产品</Button>}
      {canDelete && <Button variant="destructive">删除</Button>}
    </div>
  );
}
```

---

## 构建流程

### scripts/build.ts

```typescript
import { manifest } from '../manifest';
import fs from 'fs/promises';

async function build() {
  // 1. 生成 manifest.json
  await fs.writeFile(
    'manifest.json',
    JSON.stringify(manifest, null, 2)
  );

  console.log('✅ Generated manifest.json');
  console.log(`   Plugin ID: ${manifest.pluginId}`);
  console.log(`   Permissions: ${manifest.permissions?.definitions.length || 0}`);

  // 列出所有权限
  if (manifest.permissions) {
    console.log('\n   Defined permissions:');
    for (const perm of manifest.permissions.definitions) {
      console.log(`   - ${perm.key}: ${perm.description}`);
    }
  }
}

build();
```

### 输出示例

```bash
$ pnpm build:manifest

✅ Generated manifest.json
   Plugin ID: com.wordrhyme.dsuni
   Permissions: 12

   Defined permissions:
   - com.wordrhyme.dsuni.products.view: 查看产品列表
   - com.wordrhyme.dsuni.products.create: 创建产品
   - com.wordrhyme.dsuni.products.update: 更新产品信息
   - com.wordrhyme.dsuni.products.delete: 删除产品
   - com.wordrhyme.dsuni.products.export: 导出产品数据
   - com.wordrhyme.dsuni.orders.view: 查看订单列表
   - com.wordrhyme.dsuni.orders.fulfill: 标记订单为已发货
   ...
```

---

## 权限粒度最佳实践

### ✅ 推荐：细粒度原子权限

```typescript
permissions: {
  products: {
    view: '查看产品',       // 只读
    create: '创建产品',     // 增
    update: '更新产品',     // 改
    delete: '删除产品',     // 删
    export: '导出数据',     // 特殊操作
    import: '批量导入',     // 特殊操作
  },
}
```

### ❌ 不推荐：模糊的组合权限

```typescript
permissions: {
  products: {
    view: '查看产品',
    manage: '管理产品',  // ❌ 包含什么？create + update + delete?
  },
}
```

### 权限组合在角色层面处理

管理员在系统中创建角色时组合权限：

```
角色: 产品管理员
权限:
  ✅ com.wordrhyme.dsuni.products.view
  ✅ com.wordrhyme.dsuni.products.create
  ✅ com.wordrhyme.dsuni.products.update
  ✅ com.wordrhyme.dsuni.products.delete

角色: 产品审核员
权限:
  ✅ com.wordrhyme.dsuni.products.view
  ✅ com.wordrhyme.dsuni.products.update  (只能编辑，不能删除)
```

---

## 通配符权限（可选扩展）

如果系统支持通配符，可以这样用：

```typescript
// 检查是否有任意产品相关权限
ctx.permissions.hasAny('com.wordrhyme.dsuni.products.*')

// 检查是否有插件的所有权限（超级管理员）
ctx.permissions.hasAll('com.wordrhyme.dsuni.*')
```

但在代码中定义时，仍应使用具体的原子权限。

---

## 对比总结

| 方案 | 权限 Key 格式 | pluginId 重复 | 权限粒度 |
|------|-------------|--------------|---------|
| ❌ 旧方案 | `products.view` | 需要手动添加 | 模糊（manage） |
| ✅ 新方案 | `com.wordrhyme.dsuni.products.view` | 自动添加 | 细粒度（CRUD） |

**优势**:
1. ✅ pluginId 只写一次，自动添加到所有权限
2. ✅ 权限 key 清晰表明所属插件
3. ✅ 原子权限便于细粒度控制
4. ✅ 类型安全的权限常量
