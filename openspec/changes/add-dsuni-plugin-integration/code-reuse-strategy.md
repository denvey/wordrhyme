# DSUni 代码复用策略

## 1. 业务逻辑提取 (90% 复用)

### 方案A: 创建共享库
```bash
# 项目结构
wordrhyme/
├── example/dsuni/              # 原始 dsuni 项目（保留）
├── packages/
│   └── dsuni-core/             # 提取的业务逻辑（新建）
│       ├── src/
│       │   ├── products/       # 产品管理逻辑
│       │   ├── orders/         # 订单逻辑
│       │   ├── inventory/      # 库存逻辑
│       │   ├── schemas/        # Zod schemas
│       │   └── utils/          # 工具函数
│       └── package.json
└── plugins/dsuni/              # wordrhyme 插件（新建）
    ├── src/
    │   ├── server/
    │   │   └── routers/        # 使用 @dsuni/core
    │   └── admin/
    └── manifest.ts
```

### 提取示例

```typescript
// ============= packages/dsuni-core/src/products/product.service.ts =============
// 从 dsuni 提取的纯业务逻辑（无框架依赖）

export interface ProductInput {
  spuId: string;
  name: string;
  category: string;
  price: number;
  // ... 其他字段
}

export interface ProductService {
  create(input: ProductInput): Promise<Product>;
  calculatePrice(variations: Variation[]): PriceRange;
  validateSPU(spuId: string): ValidationResult;
}

export class ProductServiceImpl implements ProductService {
  // ✅ 纯业务逻辑，从 dsuni 直接复制
  async create(input: ProductInput): Promise<Product> {
    // 业务验证
    this.validateSPU(input.spuId);

    // 价格计算
    const priceRange = this.calculatePrice(input.variations);

    return {
      ...input,
      priceRange,
      createdAt: new Date(),
    };
  }

  calculatePrice(variations: Variation[]): PriceRange {
    // ✅ 从 dsuni 复制的逻辑
    const prices = variations.map(v => v.price);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }

  validateSPU(spuId: string): ValidationResult {
    // ✅ 从 dsuni 复制的验证逻辑
    const regex = /^[A-Z0-9]{3,20}$/;
    return { valid: regex.test(spuId) };
  }
}
```

```typescript
// ============= plugins/dsuni/src/server/routers/products.ts =============
// wordrhyme 插件中使用提取的逻辑

import { ProductServiceImpl } from '@dsuni/core/products';
import { PERMISSIONS } from '../../../manifest';

const productService = new ProductServiceImpl();

export const productsRouter = router({
  create: pluginProcedure
    .meta({ permission: PERMISSIONS.products.create })
    .input(productInputSchema)  // ✅ 从 @dsuni/core 导入
    .mutation(async ({ ctx, input }) => {
      // ✅ 复用业务逻辑
      const product = await productService.create(input);

      // wordrhyme 特定：存储到数据库
      return ctx.db.insert(products).values({
        ...product,
        organization_id: ctx.organizationId,  // 适配层
        acl_tags: [`org:${ctx.organizationId}`],
        created_by: ctx.userId,
      });
    }),
});
```

---

## 2. 数据层适配 (80% 复用)

### Schema 字段映射

```typescript
// ============= packages/dsuni-core/src/schemas/product.schema.ts =============
// 从 dsuni 提取的通用 schema（框架无关）

import { z } from 'zod';

export const productBaseSchema = z.object({
  spuId: z.string().regex(/^[A-Z0-9]{3,20}$/),
  name: z.string().min(1).max(200),
  category: z.string(),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().nonnegative(),
  // ... 其他业务字段
});

export type ProductBase = z.infer<typeof productBaseSchema>;
```

```typescript
// ============= plugins/dsuni/src/server/db/schema.ts =============
// wordrhyme 插件 schema（添加系统字段）

import { pgTable, text, integer, decimal, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { productBaseSchema } from '@dsuni/core/schemas';
import { lbacFields } from '@wordrhyme/db';

export const products = pgTable('plugin_dsuni_products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // ============ 业务字段（从 dsuni 复用）============
  spuId: text('spu_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  stock: integer('stock').notNull().default(0),

  // ============ wordrhyme 系统字段 ============
  organization_id: text('organization_id').notNull(),  // 多租户
  ...lbacFields,  // acl_tags, deny_tags
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// Zod schema for tRPC (复用 + 扩展)
export const createProductSchema = productBaseSchema.extend({
  // wordrhyme 自动添加的字段不需要客户端传入
  // organization_id, created_by 等由 context 提供
});
```

### 数据迁移工具

```typescript
// ============= packages/dsuni-core/src/migrations/adapter.ts =============
// 从 dsuni 数据迁移到 wordrhyme

export function adaptDsuniProduct(dsuniProduct: any): WordrhymeProduct {
  return {
    ...dsuniProduct,
    // 字段重命名
    organization_id: dsuniProduct.teamId,  // teamId → organization_id

    // 添加 LBAC 字段
    acl_tags: [`org:${dsuniProduct.teamId}`],
    deny_tags: [],

    // 保留原有字段
    spuId: dsuniProduct.spuId,
    name: dsuniProduct.name,
    // ...
  };
}
```

---

## 3. UI 组件提取 (60% 复用)

### 去除 Next.js 依赖

```typescript
// ============= dsuni 原始组件 (Next.js) =============
// example/dsuni/apps/web/app/products/ProductForm.tsx

'use client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export function ProductForm() {
  const router = useRouter();
  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => router.push('/products'),
  });

  // ... 表单逻辑
}
```

```typescript
// ============= 提取后的组件 (框架无关) =============
// packages/dsuni-core/src/components/ProductForm.tsx

import { useState } from 'react';
import { productBaseSchema } from '@dsuni/core/schemas';
import type { ProductBase } from '@dsuni/core/schemas';

export interface ProductFormProps {
  onSubmit: (data: ProductBase) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({ onSubmit, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState<ProductBase>({});

  const handleSubmit = async () => {
    const validated = productBaseSchema.parse(formData);  // ✅ 复用验证
    await onSubmit(validated);
  };

  // ✅ 纯 UI 逻辑，无框架依赖
  return (
    <form onSubmit={handleSubmit}>
      {/* shadcn/ui 组件 - 直接复用 */}
      <Input label="SPU ID" {...} />
      <Input label="Product Name" {...} />
      {/* ... */}
    </form>
  );
}
```

```typescript
// ============= wordrhyme 插件中使用 =============
// plugins/dsuni/src/admin/pages/Products.tsx

import { ProductForm } from '@dsuni/core/components';
import { trpc } from '@wordrhyme/trpc';
import { useNavigate } from 'react-router-dom';

export function ProductsPage() {
  const navigate = useNavigate();
  const createMutation = trpc.pluginApis.dsuni.products.create.useMutation({
    onSuccess: () => navigate('/p/com.wordrhyme.dsuni/products'),
  });

  return (
    <ProductForm
      onSubmit={createMutation.mutateAsync}  // ✅ 适配层
      onCancel={() => navigate(-1)}
    />
  );
}
```

---

## 4. 测试用例复用 (90% 复用)

```typescript
// ============= packages/dsuni-core/src/products/__tests__/product.service.test.ts =============
// 从 dsuni 复制的测试用例

import { ProductServiceImpl } from '../product.service';

describe('ProductService', () => {
  let service: ProductServiceImpl;

  beforeEach(() => {
    service = new ProductServiceImpl();
  });

  // ✅ 业务逻辑测试 - 直接复用
  it('should calculate correct price range', () => {
    const variations = [
      { skuId: 'SKU1', price: 10 },
      { skuId: 'SKU2', price: 20 },
      { skuId: 'SKU3', price: 15 },
    ];

    const result = service.calculatePrice(variations);

    expect(result).toEqual({ min: 10, max: 20 });
  });

  // ✅ 验证逻辑测试 - 直接复用
  it('should validate SPU format', () => {
    expect(service.validateSPU('ABC123').valid).toBe(true);
    expect(service.validateSPU('abc123').valid).toBe(false);
    expect(service.validateSPU('AB').valid).toBe(false);
  });
});
```

```typescript
// ============= plugins/dsuni/src/server/__tests__/products.test.ts =============
// wordrhyme 插件集成测试（复用业务测试逻辑）

import { createTestContext } from '@wordrhyme/testing';
import { productsRouter } from '../routers/products';

describe('Products Router (wordrhyme)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  // ✅ 复用业务逻辑验证
  it('should create product with valid data', async () => {
    const input = {
      spuId: 'TEST123',
      name: 'Test Product',
      category: 'electronics',
      price: 99.99,
      stock: 100,
    };

    const result = await productsRouter.createCaller(ctx).create(input);

    expect(result.spuId).toBe('TEST123');
    expect(result.organization_id).toBe(ctx.organizationId);  // wordrhyme 特定
    expect(result.acl_tags).toContain(`org:${ctx.organizationId}`);  // LBAC
  });

  // ✅ 复用验证逻辑测试
  it('should reject invalid SPU format', async () => {
    const input = { spuId: 'abc', name: 'Test' };

    await expect(
      productsRouter.createCaller(ctx).create(input)
    ).rejects.toThrow('Invalid SPU format');
  });
});
```

---

## 5. 实施路径

### Phase 1: 提取业务逻辑 (1-2 周)
```bash
# 1. 创建 @dsuni/core 包
pnpm create -w @dsuni/core

# 2. 从 dsuni 提取纯业务逻辑
# - 产品管理
# - 订单状态机
# - 库存计算
# - Zod schemas
# - 工具函数

# 3. 提取 UI 组件（去除 Next.js 依赖）
# - ProductForm
# - OrderList
# - InventoryTable

# 4. 提取测试用例
```

### Phase 2: 适配层开发 (1 周)
```typescript
// 创建 wordrhyme context 适配器
export function adaptContext(ctx: PluginContext): DsuniContext {
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,  // teamId → organizationId
    db: wrapDB(ctx.db),  // 包装 scoped-db
  };
}
```

### Phase 3: 插件集成 (2-3 周)
```bash
# 1. 创建插件脚手架
# 2. 集成 @dsuni/core
# 3. 实现 wordrhyme 特定功能
#    - CASL 权限
#    - LBAC 集成
#    - Module Federation
# 4. 编写集成测试
```

---

## 6. 优势总结

### 复用现有代码的好处
- ✅ **开发速度**: 减少 50-70% 开发时间
- ✅ **质量保证**: 业务逻辑已在生产验证
- ✅ **测试覆盖**: 直接复用测试用例
- ✅ **一致性**: 保持业务逻辑与原 dsuni 一致
- ✅ **维护性**: 共享代码库，bug 修复同步

### 风险控制
- ⚠️ **依赖管理**: 避免引入 dsuni 的 Next.js 依赖
- ⚠️ **版本同步**: @dsuni/core 需要独立版本管理
- ⚠️ **过度抽象**: 不要为了复用而过度设计

---

## 7. 决策清单

- [ ] 是否创建 `@dsuni/core` 共享库？
- [ ] 哪些组件需要提取？
- [ ] 测试用例如何迁移？
- [ ] 数据迁移脚本是否需要？
