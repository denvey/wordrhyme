# 权限定义方案对比分析

## 方案对比

| 维度 | 方案A: Manifest优先 | 方案B: 集中代码定义 | 方案C: 分散meta定义 |
|------|-------------------|-------------------|-------------------|
| **定义位置** | manifest.json | src/permissions.ts | 每个 procedure 的 meta |
| **开发流程** | 1. 编辑 manifest<br>2. 生成类型<br>3. 使用常量 | 1. 编辑 permissions.ts<br>2. 构建时生成 manifest | 1. 直接在 meta 写<br>2. 构建时扫描生成 manifest |
| **类型安全** | ✅ Union Type | ✅ const assertion | ⚠️ 对象字面量 |
| **重复风险** | ❌ 需手动同步 | ✅ 低（集中） | ⚠️ 高（分散） |
| **构建复杂度** | 简单（JSON → TS） | 简单（TS import → JSON） | 复杂（AST 扫描全部文件） |
| **可审查性** | ✅ manifest 可直接查看 | ✅ 单文件可查看 | ❌ 分散在多个文件 |
| **开发成本** | 高（需切换文件） | **低**（代码内完成） | 中（每处都写） |
| **推荐指数** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

## 推荐方案: 方案B (集中代码定义)

### 核心设计

```typescript
// ============= src/permissions.ts =============
export const PERMISSIONS = {
  products: {
    view: { key: 'products.view', description: '查看产品' },
    manage: { key: 'products.manage', description: '管理产品' },
    delete: { key: 'products.delete', description: '删除产品' },
  },
  orders: {
    view: { key: 'orders.view', description: '查看订单' },
    fulfill: { key: 'orders.fulfill', description: '履行订单' },
  },
} as const;

// 自动推导类型
export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS][keyof typeof PERMISSIONS[keyof typeof PERMISSIONS]]['key'];
// Result: 'products.view' | 'products.manage' | ... (Union Type)
```

### 构建时生成 manifest

```typescript
// scripts/build-manifest.ts
import { PERMISSIONS } from '../src/permissions';

function extractPermissions(perms: typeof PERMISSIONS) {
  const definitions: Array<{ key: string; description: string }> = [];

  for (const group of Object.values(perms)) {
    for (const perm of Object.values(group)) {
      definitions.push({
        key: perm.key,
        description: perm.description,
      });
    }
  }

  return definitions;
}

const manifest = {
  ...baseManifest,
  permissions: {
    definitions: extractPermissions(PERMISSIONS),
  },
};

fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
```

### 使用示例

```typescript
// ============= src/routers/products.ts =============
import { PERMISSIONS } from '../permissions';

export const productsRouter = router({
  list: pluginProcedure
    .meta({ permission: PERMISSIONS.products.view }) // ✅ 有智能提示
    .query(async ({ ctx }) => {
      // permission 已在 global middleware 自动检查
      return ctx.db.select().from(products);
    }),

  delete: pluginProcedure
    .meta({ permission: PERMISSIONS.products.delete })
    .mutation(async ({ ctx, input }) => {
      return ctx.db.delete(products).where(eq(products.id, input.id));
    }),
});
```

## 为什么不用分散定义 (方案C)?

### 问题1: 重复和不一致

```typescript
// 文件1
.meta({ permission: { key: 'products.manage', description: '管理产品' } })

// 文件2 - 同样的权限，但描述不同！
.meta({ permission: { key: 'products.manage', description: '产品管理' } })

// 构建时生成到 manifest 会出现哪个？
```

### 问题2: AST 扫描复杂度

需要：
1. 扫描所有 `.ts` 文件
2. 解析 AST 找到所有 `.meta()` 调用
3. 提取 `permission` 字段的对象字面量
4. 处理动态值（如 `const key = 'xxx'; .meta({ permission: { key } })`）

**成本远高于简单的 `import` 和遍历对象**。

## 实现路径

### 第1步: 定义 SDK 类型

```typescript
// packages/plugin/src/types.ts
export interface PermissionDefinition {
  key: string;
  description: string;
}

export type PermissionMap = Record<string, Record<string, PermissionDefinition>>;
```

### 第2步: 插件定义权限

```typescript
// plugins/dsuni/src/permissions.ts
import type { PermissionMap } from '@wordrhyme/plugin';

export const PERMISSIONS = {
  products: {
    view: { key: 'products.view', description: '查看产品' },
    manage: { key: 'products.manage', description: '管理产品' },
  },
} as const satisfies PermissionMap;
```

### 第3步: 构建脚本

```typescript
// packages/plugin/scripts/build-plugin.ts
export async function buildPlugin(pluginDir: string) {
  // 1. 读取基础 manifest
  const baseManifest = JSON.parse(
    await fs.readFile(path.join(pluginDir, 'manifest.base.json'), 'utf-8')
  );

  // 2. 动态 import permissions
  const { PERMISSIONS } = await import(
    path.join(pluginDir, 'src/permissions.ts')
  );

  // 3. 提取权限定义
  const definitions = extractPermissions(PERMISSIONS);

  // 4. 合并生成最终 manifest
  const manifest = {
    ...baseManifest,
    permissions: { definitions },
  };

  // 5. 写入
  await fs.writeFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`✅ Generated manifest with ${definitions.length} permissions`);
}
```

### 第4步: package.json 集成

```json
{
  "scripts": {
    "build": "pnpm build:manifest && tsup",
    "build:manifest": "wordrhyme-plugin build-manifest"
  }
}
```

## 最终效果

开发者体验：
1. ✅ 只在 `src/permissions.ts` 写一次
2. ✅ 使用时有完整类型提示
3. ✅ 构建时自动生成 manifest
4. ✅ Git 跟踪 manifest.json（可审查）
5. ✅ 不用手动同步
6. ✅ 集中管理，避免重复

系统契约：
1. ✅ manifest 包含完整权限列表（安装时可审查）
2. ✅ 构建时确定（无运行时扫描）
3. ✅ 符合 Contract-First（manifest 是构建产物，代码是源）
