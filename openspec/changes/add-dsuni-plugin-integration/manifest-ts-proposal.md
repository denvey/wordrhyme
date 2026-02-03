# Manifest.ts 方案对比分析

## 方案演进

### ❌ 方案1: Manifest.json (初始)
```
manifest.json (手动编辑)
  ↓
代码使用 magic strings
  ↓
无类型安全
```
**问题**: 需要在 manifest 和代码两处写权限

---

### ⚠️ 方案2: src/permissions.ts → manifest.json (我之前推荐)
```
src/permissions.ts (单一来源)
  ↓ 构建时
manifest.json (生成)
  ↓ 导入
代码使用 PERMISSIONS 常量
```
**改进**: 单一来源 + 类型安全
**问题**: 文件分散（permissions.ts 和 manifest.json）

---

### ✅ 方案3: manifest.ts → manifest.json (用户提出)
```
manifest.ts (真正的单一来源)
  ├─ 导出 manifest 对象 → 构建时生成 manifest.json
  └─ 导出 PERMISSIONS 常量 → 代码直接 import
```
**优势**:
1. ✅ 真正的单一文件
2. ✅ 整个 manifest 都有类型校验（不只是权限）
3. ✅ 减少文件数量
4. ✅ 权限和 manifest 配置在一起（语义关联）
5. ✅ TypeScript-First 理念

---

## 详细对比

| 维度 | 方案1: manifest.json | 方案2: permissions.ts | 方案3: manifest.ts ⭐ |
|------|---------------------|---------------------|---------------------|
| **权限定义位置** | manifest.json | src/permissions.ts | manifest.ts |
| **类型校验范围** | ❌ 无 | ⚠️ 仅权限 | ✅ 整个 manifest |
| **文件数量** | 1 (但无类型) | 2 (manifest.json + permissions.ts) | 1 (manifest.ts) |
| **重复定义** | ❌ 两处（manifest + 代码） | ✅ 一处 | ✅ 一处 |
| **IDE 支持** | ❌ JSON | ✅ TS | ✅ TS (更全面) |
| **构建复杂度** | 无需构建 | 中等（动态 import） | 简单（直接序列化） |
| **可扩展性** | ❌ 静态 JSON | ✅ 可计算 | ✅ 可计算 + 可组合 |
| **学习曲线** | 低（纯配置） | 中（需理解分离原因） | 低（符合 TS 直觉） |
| **推荐指数** | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 示例对比

### 方案1: manifest.json (弃用)
```json
{
  "permissions": {
    "definitions": [
      { "key": "products.view", "description": "查看产品" }
    ]
  }
}
```
```typescript
// 代码中使用 magic string
.meta({ permission: 'dsuni.products.view' }) // ❌ 无类型检查
```

---

### 方案2: permissions.ts (之前推荐)
```typescript
// src/permissions.ts
export const PERMISSIONS = {
  products: {
    view: { key: 'products.view', description: '查看产品' },
  },
} as const;
```
```json
// manifest.json (构建生成)
{
  "permissions": {
    "definitions": [
      { "key": "dsuni.products.view", "description": "查看产品" }
    ]
  }
}
```
```typescript
// 使用
import { PERMISSIONS } from './permissions';
.meta({ permission: PERMISSIONS.products.view.key }) // ✅ 类型安全
```

**缺点**: 权限定义和 manifest 配置分离

---

### 方案3: manifest.ts (最终推荐) ⭐

```typescript
// manifest.ts - 单一文件包含所有配置
import { defineManifest, definePermissions } from '@wordrhyme/plugin';

// 1. 定义权限（内聚在 manifest 中）
const permissions = definePermissions({
  products: {
    view: '查看产品',
    manage: '管理产品',
  },
});

// 2. Manifest 定义（类型校验覆盖所有字段）
export const manifest = defineManifest({
  pluginId: 'com.wordrhyme.dsuni',
  version: '1.0.0',
  name: 'DSUni E-commerce',
  description: 'E-commerce product and order management',

  permissions: {
    definitions: permissions._definitions,
  },

  capabilities: {
    data: { write: true },      // ← 类型检查
    ui: { adminPage: true },    // ← 类型检查
  },

  server: {
    entry: './dist/server/index.js',
  },

  admin: {
    remoteEntry: './dist/admin/remoteEntry.js',
    menus: [{
      id: 'dsuni',
      label: 'DSUni',
      icon: 'ShoppingCart',
      path: '/products',
    }],
  },

  dataRetention: {
    onDisable: 'retain',
    onUninstall: 'archive',
    tables: ['plugin_dsuni_products', 'plugin_dsuni_orders'],
  },

  dependencies: {
    optional: ['com.wordrhyme.shopify', 'com.wordrhyme.woocommerce'],
  },
});

// 3. 导出供代码使用
export const PERMISSIONS = permissions.keys;
// Result: { products: { view: 'dsuni.products.view', ... } }
```

**构建时**:
```typescript
// scripts/build.ts
import { manifest } from '../manifest';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
```

**使用**:
```typescript
// src/routers/products.ts
import { PERMISSIONS } from '../../manifest'; // ← 单一来源

export const productsRouter = router({
  list: pluginProcedure
    .meta({ permission: PERMISSIONS.products.view }) // ✅ 类型安全
    .query(...),
});
```

**优势总结**:
1. ✅ 所有配置在一个文件（manifest.ts）
2. ✅ 整个 manifest 都有 TypeScript 类型校验
3. ✅ 权限定义和使用都在 TypeScript 生态内
4. ✅ 构建时自动生成 manifest.json（安装时使用）
5. ✅ 符合 "Configuration as Code" 最佳实践

---

## defineManifest 类型定义

```typescript
// @wordrhyme/plugin/src/define-manifest.ts
import { z } from 'zod';

export const pluginManifestSchema = z.object({
  pluginId: z.string().regex(/^com\.wordrhyme\.[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string(),
  description: z.string().optional(),

  permissions: z.object({
    definitions: z.array(z.object({
      key: z.string(),
      description: z.string(),
    })),
  }).optional(),

  capabilities: z.object({
    data: z.object({
      read: z.boolean().optional(),
      write: z.boolean().optional(),
    }).optional(),
    ui: z.object({
      adminPage: z.boolean().optional(),
      settingsTab: z.boolean().optional(),
    }).optional(),
  }).optional(),

  // ... 其他字段
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function defineManifest<T extends PluginManifest>(manifest: T): T {
  // 运行时验证
  pluginManifestSchema.parse(manifest);
  return manifest;
}
```

**类型安全好处**:
```typescript
export const manifest = defineManifest({
  pluginId: 'com.wordrhyme.dsuni',
  capabilities: {
    data: {
      wrte: true, // ❌ TypeScript 报错: 'wrte' 不存在，应该是 'write'
    },
  },
});
```

---

## 构建流程详解

### package.json
```json
{
  "scripts": {
    "build": "pnpm build:manifest && tsup",
    "build:manifest": "tsx scripts/build-manifest.ts"
  }
}
```

### scripts/build-manifest.ts
```typescript
import { manifest } from '../manifest';
import { pluginManifestSchema } from '@wordrhyme/plugin';
import fs from 'fs/promises';
import path from 'path';

async function buildManifest() {
  // 1. 验证 manifest（Zod schema）
  const validated = pluginManifestSchema.parse(manifest);

  // 2. 自动添加权限前缀（避免开发者重复写 pluginId）
  const processed = {
    ...validated,
    permissions: validated.permissions ? {
      definitions: validated.permissions.definitions.map(p => ({
        ...p,
        key: p.key.startsWith(`${validated.pluginId}.`)
          ? p.key
          : `${validated.pluginId}.${p.key}`, // 自动添加前缀
      })),
    } : undefined,
  };

  // 3. 写入 manifest.json
  await fs.writeFile(
    path.join(__dirname, '../manifest.json'),
    JSON.stringify(processed, null, 2),
    'utf-8'
  );

  console.log('✅ Generated manifest.json');
  console.log(`   Plugin ID: ${processed.pluginId}`);
  console.log(`   Permissions: ${processed.permissions?.definitions.length || 0}`);
}

buildManifest().catch(console.error);
```

---

## 迁移路径

### 从 manifest.json 迁移
```bash
# 1. 重命名
mv manifest.json manifest.json.bak

# 2. 创建 manifest.ts
cat > manifest.ts << 'EOF'
import { defineManifest } from '@wordrhyme/plugin';

export const manifest = defineManifest({
  // 粘贴原 manifest.json 内容（转为 TS 对象）
});
EOF

# 3. 构建测试
pnpm build:manifest

# 4. 对比验证
diff manifest.json.bak manifest.json

# 5. 删除备份
rm manifest.json.bak
```

---

## 常见问题

### Q1: manifest.ts 会导致循环依赖吗？
**A**: 不会。
- manifest.ts 只导出常量，不导入业务代码
- 业务代码导入 manifest.ts 的常量
- 单向依赖: 业务代码 → manifest.ts

### Q2: 构建顺序如何保证？
**A**:
```json
{
  "scripts": {
    "build": "pnpm build:manifest && tsup",
    "build:manifest": "tsx manifest.ts > manifest.json"
  }
}
```
先生成 manifest.json，再编译代码。

### Q3: JSON Schema 验证怎么办？
**A**:
- 运行时: `defineManifest` 函数使用 Zod 验证
- 构建时: 输出的 manifest.json 可以再用 JSON Schema 验证（可选）

### Q4: 能否支持环境变量/动态配置？
**A**: 可以！
```typescript
export const manifest = defineManifest({
  pluginId: 'com.wordrhyme.dsuni',
  version: process.env.PLUGIN_VERSION || '1.0.0', // ← 动态
  // ...
});
```

---

## 最终推荐

**采用 manifest.ts 方案！**

**理由**:
1. ✅ 真正的单一文件源头
2. ✅ 完整的 TypeScript 类型支持
3. ✅ 减少配置文件数量（简化项目结构）
4. ✅ 更符合现代 TypeScript 项目惯例
5. ✅ 易于维护和重构

**实施步骤**:
1. 在 `@wordrhyme/plugin` 实现 `defineManifest` 和 `definePermissions`
2. 更新插件模板，使用 manifest.ts
3. 提供构建脚本示例
4. 文档化最佳实践

---

## 附录: definePermissions 完整实现

```typescript
// @wordrhyme/plugin/src/define-permissions.ts

export type PermissionDefinition = {
  key: string;
  description: string;
};

export type PermissionGroup<T extends Record<string, string>> = {
  [K in keyof T]: T[K];
};

export type PermissionKeys<T extends Record<string, Record<string, string>>> = {
  [Group in keyof T]: {
    [Key in keyof T[Group]]: `${Group & string}.${Key & string}`;
  };
};

export type PermissionUnion<T extends Record<string, Record<string, string>>> = {
  [Group in keyof T]: {
    [Key in keyof T[Group]]: `${Group & string}.${Key & string}`;
  }[keyof T[Group]];
}[keyof T];

export interface PermissionResult<T extends Record<string, Record<string, string>>> {
  _definitions: PermissionDefinition[];
  keys: PermissionKeys<T>;
  unionType: PermissionUnion<T>;
}

export function definePermissions<T extends Record<string, Record<string, string>>>(
  groups: T
): PermissionResult<T> {
  const definitions: PermissionDefinition[] = [];
  const keys: any = {};

  for (const [groupName, permissions] of Object.entries(groups)) {
    keys[groupName] = {};
    for (const [permName, description] of Object.entries(permissions)) {
      const fullKey = `${groupName}.${permName}`;
      definitions.push({ key: fullKey, description });
      keys[groupName][permName] = fullKey;
    }
  }

  return {
    _definitions: definitions,
    keys: keys as PermissionKeys<T>,
    unionType: null as any as PermissionUnion<T>,
  };
}
```

**使用示例**:
```typescript
const permissions = definePermissions({
  products: {
    view: '查看产品',
    manage: '管理产品',
  },
  orders: {
    view: '查看订单',
    fulfill: '履行订单',
  },
});

// permissions._definitions:
// [
//   { key: 'products.view', description: '查看产品' },
//   { key: 'products.manage', description: '管理产品' },
//   { key: 'orders.view', description: '查看订单' },
//   { key: 'orders.fulfill', description: '履行订单' },
// ]

// permissions.keys:
// {
//   products: { view: 'products.view', manage: 'products.manage' },
//   orders: { view: 'orders.view', fulfill: 'orders.fulfill' },
// }

// permissions.unionType 类型:
// 'products.view' | 'products.manage' | 'orders.view' | 'orders.fulfill'
```
