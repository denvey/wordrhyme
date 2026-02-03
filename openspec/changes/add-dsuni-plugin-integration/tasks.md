# Shop Plugin Integration - 实施任务清单

**Change ID**: `add-shop-plugin-integration`
**创建时间**: 2026-01-30
**状态**: 待开始

---

## 任务优先级说明

- **P0**: 阻塞性任务，必须先完成
- **P1**: 核心功能，影响插件可用性
- **P2**: 重要优化，提升质量和性能
- **P3**: 增强功能，可后续迭代

---

## Phase 0: 基础设施准备 (P0)

### Task 0.1: 实现 @wordrhyme/plugin SDK 核心功能

**优先级**: P0
**预计工时**: 2-3 天
**依赖**: 无

**目标**: 提供插件开发所需的核心 SDK

**子任务**:
1. 实现 `definePlugin` API
   ```typescript
   // packages/plugin/src/definePlugin.ts
   export function definePlugin<P extends PluginDefinition>(config: P): PluginResult<P> {
     // 1. 自动添加 pluginId 前缀到所有权限
     // 2. 生成类型安全的 PERMISSIONS 对象
     // 3. 返回 manifest 和 PERMISSIONS
   }
   ```

2. 实现 `buildManifest` 构建工具
   ```typescript
   // packages/plugin/src/buildManifest.ts
   export async function buildManifest(pluginDir: string): Promise<void> {
     // 1. 读取 src/manifest.ts
     // 2. 执行 definePlugin
     // 3. 生成 manifest.json
     // 4. 写入到 pluginDir/manifest.json
   }
   ```

3. 添加 TypeScript 类型定义
   - `PermissionKeys<T>` 类型
   - `PluginManifest` 接口
   - `PluginContext` 接口

**验收标准**:
- ✅ `definePlugin` 可正确生成权限 key（带 pluginId 前缀）
- ✅ `buildManifest` 可从 manifest.ts 生成 manifest.json
- ✅ TypeScript 类型提示正常工作
- ✅ 单元测试覆盖率 > 80%

---

### Task 0.2: auto-crud-server 集成 scoped-db + LBAC

**优先级**: P0
**预计工时**: 2-3 天
**依赖**: 无

**目标**: 自动 CRUD 支持租户隔离和 LBAC

**子任务**:
1. 修改 `auto-crud-server` 使用 scoped-db
   ```typescript
   // packages/auto-crud-server/src/createCrudRouter.ts
   export function createCrudRouter(table, schema) {
     return {
       list: procedure.query(async ({ ctx }) => {
         // ✅ 使用 scoped-db，自动注入 organization_id 过滤
         return ctx.db.select().from(table);
       }),
     };
   }
   ```

2. 实现 LBAC 字段自动注入
   ```typescript
   create: procedure.mutation(async ({ ctx, input }) => {
     return ctx.db.insert(table).values({
       ...input,
       // ✅ 自动注入 LBAC 字段
       organization_id: ctx.organizationId,  // scoped-db 自动
       acl_tags: [`org:${ctx.organizationId}`],  // 新增
       deny_tags: [],  // 新增
       created_by: ctx.userId,
     });
   }),
   ```

3. 添加 LBAC 字段 schema 验证

**验收标准**:
- ✅ auto-crud 生成的路由自动使用 scoped-db
- ✅ 创建操作自动注入 `acl_tags: ['org:{organizationId}']`
- ✅ 空 `acl_tags` 导致无查询结果（security-first 验证）
- ✅ 集成测试通过

---

### Task 0.3: 创建外部平台插件 Stubs

**优先级**: P0
**预计工时**: 1 天
**依赖**: Task 0.1

**目标**: 创建 shop 依赖的外部平台插件占位符

**子任务**:
1. 创建插件脚手架
   ```bash
   plugins/
   ├── shopify/
   │   ├── manifest.ts
   │   └── src/
   ├── woocommerce/
   │   ├── manifest.ts
   │   └── src/
   ├── alibaba-1688/
   │   ├── manifest.ts
   │   └── src/
   └── aliexpress/
       ├── manifest.ts
       └── src/
   ```

2. 每个插件提供基础 manifest
   ```typescript
   export const { manifest } = definePlugin({
     pluginId: 'com.wordrhyme.shopify',
     name: 'Shopify Integration',
     version: '0.1.0',
     capabilities: [],
     // 暂时为空，后续实现
   });
   ```

**验收标准**:
- ✅ 所有 4 个外部平台插件可被 shop 声明为 dependencies
- ✅ manifest.json 验证通过
- ✅ 插件可被 PluginManager 加载（即使无功能）

---

## Phase 1: 业务逻辑提取 (P1)

### Task 1.1: 创建 @wordrhyme/shop-core 共享库

**优先级**: P1
**预计工时**: 3-5 天
**依赖**: 无

**目标**: 提取纯业务逻辑到独立包

**子任务**:
1. 初始化 monorepo 包
   ```bash
   mkdir -p packages/shop-core/src
   cd packages/shop-core
   pnpm init
   ```

2. 提取产品业务逻辑
   - 从 `example/dsuni/apps/web/src/server/api/routers/product.ts` 提取
   - 去除 Next.js 和 tRPC 依赖
   - 创建 `ProductService` 类
   ```typescript
   // packages/shop-core/src/products/product.service.ts
   export class ProductService {
     calculatePriceRange(variations: Variation[]): PriceRange {
       // ✅ 纯业务逻辑
       const prices = variations.map(v => v.price);
       return { min: Math.min(...prices), max: Math.max(...prices) };
     }

     validateSPU(spuId: string): ValidationResult {
       const regex = /^[A-Z0-9]{3,20}$/;
       return { valid: regex.test(spuId) };
     }
   }
   ```

3. 提取订单业务逻辑
   - 状态机逻辑
   - 发货流程
   - 退款规则

4. 提取库存计算逻辑

5. 提取 Zod schemas
   ```typescript
   // packages/shop-core/src/schemas/product.schema.ts
   export const productBaseSchema = z.object({
     spuId: z.string().regex(/^[A-Z0-9]{3,20}$/),
     name: z.string().min(1).max(200),
     // ...
   });
   ```

**验收标准**:
- ✅ `@wordrhyme/shop-core` 包可独立编译
- ✅ 无 Next.js / tRPC / Drizzle 依赖
- ✅ 所有业务逻辑有单元测试
- ✅ 测试覆盖率 > 80%

---

### Task 1.2: 提取 UI 组件（去除 Next.js 依赖）

**优先级**: P1
**预计工时**: 2-3 天
**依赖**: Task 1.1

**目标**: 提取可复用的 React 组件

**子任务**:
1. 提取表单组件
   ```typescript
   // packages/shop-core/src/components/ProductForm.tsx
   export interface ProductFormProps {
     onSubmit: (data: ProductBase) => Promise<void>;
     onCancel: () => void;
   }

   export function ProductForm({ onSubmit, onCancel }: ProductFormProps) {
     // ✅ 无 Next.js 依赖
     // ✅ 无 useRouter()
     // ✅ 回调模式
   }
   ```

2. 提取数据展示组件
   - ProductCard
   - OrderList
   - InventoryTable

3. 去除所有 Next.js 特性
   - `'use client'` 指令 → 删除
   - `next/link` → 改为回调 prop
   - `next/image` → 改为普通 `<img>`
   - `useRouter()` → 改为回调 prop

**验收标准**:
- ✅ 所有组件无 Next.js 依赖
- ✅ 使用标准 React 18+ 特性
- ✅ Props 接口清晰，支持回调模式
- ✅ Storybook 可正常展示所有组件

---

### Task 1.3: 迁移测试用例

**优先级**: P1
**预计工时**: 1-2 天
**依赖**: Task 1.1, Task 1.2

**目标**: 复用 dsuni 的测试用例

**子任务**:
1. 复制业务逻辑测试
   ```typescript
   // packages/shop-core/src/products/__tests__/product.service.test.ts
   describe('ProductService', () => {
     it('should calculate correct price range', () => {
       // ✅ 直接从 dsuni 复制
     });
   });
   ```

2. 复制组件测试
   - 改为 React Testing Library
   - 去除 Next.js 测试工具

**验收标准**:
- ✅ 所有业务逻辑测试通过
- ✅ 所有组件测试通过
- ✅ 无 Next.js 测试依赖

---

## Phase 2: Shop 插件开发 (P1)

### Task 2.1: 修复 dsuni 原始代码的 Critical 问题

**优先级**: P1（可选，建议在提取后修复）
**预计工时**: 2-3 天
**依赖**: 无

**目标**: 修复代码审查发现的严重安全问题

**Critical 问题清单**:

1. **权限绕过问题**
   - 文件: `apps/web/src/server/api/routers/product.ts`
   - 修复: 所有查询添加 `teamId` 过滤
   ```typescript
   // ❌ 修复前
   const product = await ctx.db.query.product.findFirst({
     where: eq(product.spuId, input.spuId)
   });

   // ✅ 修复后
   const product = await ctx.db.query.product.findFirst({
     where: and(
       eq(product.spuId, input.spuId),
       eq(product.teamId, ctx.session.user.teamId)
     )
   });
   ```

2. **数据模型字段修复**
   - 添加 `teamMember.role` 字段
   - 修正 `product.id` → `product.spuId`

3. **敏感凭据加密**
   - 实现 `EncryptionService`
   - 加密 `shop.appSecret` 和 `shop.accessToken`

**验收标准**:
- ✅ 所有 Critical 问题修复
- ✅ 跨租户查询测试失败（验证隔离）
- ✅ 权限测试通过

---

### Task 2.2: 创建插件脚手架

**优先级**: P1
**预计工时**: 1 天
**依赖**: Task 0.1

**目标**: 初始化 shop 插件结构

**子任务**:
1. 创建目录结构
   ```
   plugins/shop/
   ├── manifest.ts
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   ├── server/
   │   │   ├── db/
   │   │   │   └── schema.ts
   │   │   ├── routers/
   │   │   │   ├── products.ts
   │   │   │   └── orders.ts
   │   │   └── services/
   │   └── admin/
   │       ├── pages/
   │       └── components/
   └── migrations/
       └── 001_initial_schema.sql
   ```

2. 配置 manifest.ts
   ```typescript
   export const { manifest, PERMISSIONS } = definePlugin({
     pluginId: 'com.wordrhyme.shop',
     name: 'Shop E-commerce',
     version: '0.1.0',

     permissions: {
       products: {
         view: '查看产品',
         create: '创建产品',
         update: '更新产品',
         delete: '删除产品',
         publish: '发布产品',
         unpublish: '下架产品',
       },
       orders: {
         view: '查看订单',
         updateInfo: '修改订单信息',
         fulfill: '标记为已发货',
         cancel: '取消订单',
         refund: '处理退款',
       },
       settings: {
         view: '查看插件配置',
         update: '修改插件配置',
       },
     },

     capabilities: {
       data: { write: true },
       ui: { adminPage: true, settingsTab: true },
     },

     dependencies: [
       'com.wordrhyme.shopify',
       'com.wordrhyme.woocommerce',
     ],
   });
   ```

**验收标准**:
- ✅ `pnpm build` 可生成 manifest.json
- ✅ manifest.json 通过 schema 验证
- ✅ `PERMISSIONS.products.view` 类型提示正常

---

### Task 2.3: 实现数据库 Schema（带 LBAC）

**优先级**: P1
**预计工时**: 2-3 天
**依赖**: Task 2.2

**目标**: 定义插件数据表，强制 LBAC

**子任务**:
1. 定义 products 表
   ```typescript
   // plugins/shop/src/server/db/schema.ts
   import { lbacFields } from '@wordrhyme/db';

   export const products = pgTable('plugin_shop_products', {
     id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

     // ========== 业务字段 ==========
     spuId: text('spu_id').notNull(),
     name: text('name').notNull(),
     category: text('category').notNull(),
     price: decimal('price', { precision: 10, scale: 2 }).notNull(),

     // ========== wordrhyme 系统字段 ==========
     organization_id: text('organization_id').notNull(),
     ...lbacFields,  // acl_tags, deny_tags
     created_by: text('created_by').notNull(),
     created_at: timestamp('created_at').notNull().defaultNow(),
   }, (table) => ({
     // 复合唯一索引
     orgSpuIdx: uniqueIndex().on(table.organization_id, table.spuId),
     // 查询优化索引
     orgCreatedIdx: index().on(table.organization_id, table.created_at),
   }));
   ```

2. 定义其他业务表
   - `plugin_shop_product_variations`
   - `plugin_shop_orders`
   - `plugin_shop_order_line_items`
   - `plugin_shop_fulfillments`

3. 所有表强制包含：
   - `organization_id` (NOT NULL)
   - `acl_tags` (TEXT[], NOT NULL, DEFAULT '{}')
   - `deny_tags` (TEXT[], NOT NULL, DEFAULT '{}')

**验收标准**:
- ✅ 所有表都有 `organization_id` + LBAC 字段
- ✅ 外键约束正确
- ✅ 复合索引包含 `organization_id`
- ✅ Drizzle migrations 可成功执行

---

### Task 2.4: 实现 tRPC Routers（集成 auto-crud）

**优先级**: P1
**预计工时**: 3-4 天
**依赖**: Task 2.3, Task 0.2, Task 1.1

**目标**: 创建后端 API，使用 @wordrhyme/shop-core 业务逻辑

**子任务**:
1. 实现 products router
   ```typescript
   // plugins/shop/src/server/routers/products.ts
   import { ProductService } from '@wordrhyme/shop-core/products';
   import { PERMISSIONS } from '../../manifest';

   const productService = new ProductService();

   export const productsRouter = router({
     list: pluginProcedure
       .meta({ permission: PERMISSIONS.products.view })
       .query(async ({ ctx }) => {
         // ✅ scoped-db 自动过滤 organization_id + LBAC
         return ctx.db.select().from(products);
       }),

     create: pluginProcedure
       .meta({ permission: PERMISSIONS.products.create })
       .input(productBaseSchema)
       .mutation(async ({ ctx, input }) => {
         // ✅ 复用业务逻辑
         const priceRange = productService.calculatePriceRange(input.variations);

         return ctx.db.insert(products).values({
           ...input,
           priceRange,
           // ✅ auto-crud-server 自动注入
           organization_id: ctx.organizationId,
           acl_tags: [`org:${ctx.organizationId}`],
           deny_tags: [],
           created_by: ctx.userId,
         });
       }),
   });
   ```

2. 实现 orders router（细粒度权限）
   ```typescript
   fulfill: pluginProcedure
     .meta({ permission: PERMISSIONS.orders.fulfill })  // 仓库专用
     .mutation(async ({ ctx, input }) => { /* ... */ }),

   refund: pluginProcedure
     .meta({ permission: PERMISSIONS.orders.refund })  // 财务专用
     .mutation(async ({ ctx, input }) => { /* ... */ }),
   ```

3. 导出 plugin API
   ```typescript
   // plugins/shop/src/server/index.ts
   export const shopRouter = router({
     products: productsRouter,
     orders: ordersRouter,
   });
   ```

**验收标准**:
- ✅ 所有 router 使用 `.meta({ permission })`
- ✅ CASL 权限检查正常工作
- ✅ scoped-db 自动过滤验证通过
- ✅ LBAC 字段自动注入验证通过
- ✅ 空 `acl_tags` 返回空结果

---

### Task 2.5: 实现 Admin UI（Module Federation）

**优先级**: P1
**预计工时**: 4-5 天
**依赖**: Task 2.4, Task 1.2

**目标**: 构建插件前端界面

**子任务**:
1. 配置 Module Federation 2.0
   ```javascript
   // plugins/shop/rspack.config.js
   module.exports = {
     plugins: [
       new ModuleFederationPlugin({
         name: 'shop',
         filename: 'remoteEntry.js',
         exposes: {
           './AdminPages': './src/admin/pages/index.tsx',
         },
         shared: {
           react: { singleton: true },
           'react-dom': { singleton: true },
           '@wordrhyme/ui': { singleton: true },
         },
       }),
     ],
   };
   ```

2. 创建产品管理页面
   ```typescript
   // plugins/shop/src/admin/pages/Products.tsx
   import { ProductForm } from '@wordrhyme/shop-core/components';
   import { trpc } from '@wordrhyme/trpc';
   import { useNavigate } from 'react-router-dom';

   export function ProductsPage() {
     const navigate = useNavigate();
     const createMutation = trpc.pluginApis.shop.products.create.useMutation({
       onSuccess: () => navigate('/p/com.wordrhyme.shop/products'),
     });

     return (
       <ProductForm
         onSubmit={createMutation.mutateAsync}  // ✅ 适配层
         onCancel={() => navigate(-1)}
       />
     );
   }
   ```

3. 创建订单管理页面

4. 集成 @wordrhyme/ui 组件库

**验收标准**:
- ✅ `pnpm build` 生成 remoteEntry.js
- ✅ wordrhyme 主应用可加载插件 UI
- ✅ 无 Next.js 依赖
- ✅ React Router 导航正常工作
- ✅ 无重复组件打包（shared 配置正确）

---

## Phase 3: 集成测试 (P2)

### Task 3.1: 编写插件集成测试

**优先级**: P2
**预计工时**: 2-3 天
**依赖**: Task 2.4

**目标**: 验证插件功能完整性

**子任务**:
1. 测试多租户隔离
   ```typescript
   describe('Multi-tenancy Isolation', () => {
     it('should only return products from current organization', async () => {
       const orgA = await createOrganization('A');
       const orgB = await createOrganization('B');

       await createProduct({ name: 'Product A', organization_id: orgA.id });
       await createProduct({ name: 'Product B', organization_id: orgB.id });

       const ctxA = { organizationId: orgA.id };
       const results = await productsRouter.createCaller(ctxA).list();

       expect(results).toHaveLength(1);
       expect(results[0].name).toBe('Product A');
     });
   });
   ```

2. 测试 CASL 权限
   ```typescript
   it('should reject unauthorized access', async () => {
     const ctx = createContextWithoutPermission();

     await expect(
       productsRouter.createCaller(ctx).create({ /* ... */ })
     ).rejects.toThrow('Permission denied');
   });
   ```

3. 测试 LBAC
   ```typescript
   it('should enforce LBAC tags', async () => {
     const product = await createProduct({
       name: 'Product',
       acl_tags: ['team:team-123'],  // 只有 team-123 可见
     });

     const ctxWithAccess = { userKeys: ['team:team-123'] };
     const ctxWithoutAccess = { userKeys: ['team:team-456'] };

     const resultsWithAccess = await productsRouter.createCaller(ctxWithAccess).list();
     const resultsWithoutAccess = await productsRouter.createCaller(ctxWithoutAccess).list();

     expect(resultsWithAccess).toHaveLength(1);
     expect(resultsWithoutAccess).toHaveLength(0);  // ✅ LBAC 生效
   });
   ```

**验收标准**:
- ✅ 所有集成测试通过
- ✅ 覆盖 proposal.md 中的 Success Criteria

---

### Task 3.2: E2E 测试

**优先级**: P2
**预计工时**: 2 天
**依赖**: Task 2.5

**目标**: 端到端功能验证

**子任务**:
1. 使用 Playwright 测试完整流程
   - 登录
   - 创建产品
   - 查看产品列表
   - 更新产品
   - 删除产品

2. 测试跨租户隔离（UI 层面）

**验收标准**:
- ✅ E2E 测试全部通过
- ✅ 无跨租户数据泄露

---

## Phase 4: 数据迁移 (P2)

### Task 4.1: 创建数据迁移脚本

**优先级**: P2
**预计工时**: 2-3 天
**依赖**: Task 2.3

**目标**: 从 dsuni 迁移数据到插件

**子任务**:
1. 实现字段映射适配器
   ```typescript
   // packages/shop-core/src/migrations/adapter.ts
   export function adaptDsuniProduct(dsuniProduct: any): WordrhymeProduct {
     return {
       ...dsuniProduct,
       // 字段重命名
       organization_id: dsuniProduct.teamId,

       // 添加 LBAC
       acl_tags: [`org:${dsuniProduct.teamId}`],
       deny_tags: [],

       // 保留业务字段
       spuId: dsuniProduct.spuId,
       name: dsuniProduct.name,
     };
   }
   ```

2. 批量迁移脚本
   ```typescript
   async function migrateProducts() {
     const dsuniProducts = await oldDb.query.product.findMany();

     for (const old of dsuniProducts) {
       const adapted = adaptDsuniProduct(old);
       await newDb.insert(products).values(adapted);
     }
   }
   ```

**验收标准**:
- ✅ 所有 dsuni 数据可迁移
- ✅ 字段映射正确
- ✅ LBAC 字段正确填充
- ✅ 可回滚

---

## Phase 5: 优化与增强 (P3)

### Task 5.1: 性能优化

**优先级**: P3
**预计工时**: 2-3 天
**依赖**: Phase 2 完成

**子任务**:
1. 添加缺失的数据库索引（从代码审查 #7）
2. 优化 JSON 字段查询
3. 实现查询结果缓存

**验收标准**:
- ✅ 列表查询 < 200ms
- ✅ 详情查询 < 100ms

---

### Task 5.2: 外部平台集成（Hook 事件）

**优先级**: P3
**预计工时**: 3-4 天
**依赖**: Task 2.4

**子任务**:
1. 实现 Hook 事件发射
   ```typescript
   // 产品创建后发射事件
   await ctx.hooks.emit('shop.product.created', {
     productId: product.id,
     spuId: product.spuId,
   });
   ```

2. 外部平台插件监听事件
   ```typescript
   // plugins/shopify/src/hooks/onShopProductCreated.ts
   export async function onProductCreated(event) {
     // 同步到 Shopify
   }
   ```

**验收标准**:
- ✅ 事件可被外部插件监听
- ✅ 失败不影响主流程

---

## 总览时间估算

| Phase | 任务数 | 预计工时 | 优先级 |
|-------|--------|---------|--------|
| Phase 0 | 3 | 5-7 天 | P0 |
| Phase 1 | 3 | 6-10 天 | P1 |
| Phase 2 | 5 | 12-17 天 | P1 |
| Phase 3 | 2 | 4-5 天 | P2 |
| Phase 4 | 1 | 2-3 天 | P2 |
| Phase 5 | 2 | 5-7 天 | P3 |
| **总计** | **16** | **34-49 天** | - |

**按优先级**:
- **P0 (阻塞)**: 5-7 天
- **P1 (核心)**: 18-27 天
- **P2 (重要)**: 6-8 天
- **P3 (增强)**: 5-7 天

---

## 依赖关系图

```
Phase 0 (基础设施)
├── Task 0.1 (definePlugin)
│   ├─> Task 0.3 (外部插件 stubs)
│   └─> Task 2.2 (插件脚手架)
└── Task 0.2 (auto-crud + LBAC)
    └─> Task 2.4 (tRPC routers)

Phase 1 (业务逻辑提取)
├── Task 1.1 (@wordrhyme/shop-core)
│   ├─> Task 1.2 (UI 组件)
│   ├─> Task 1.3 (测试迁移)
│   └─> Task 2.4 (tRPC routers)
└── Task 1.2 (UI 组件)
    └─> Task 2.5 (Admin UI)

Phase 2 (插件开发)
Task 2.2 → Task 2.3 → Task 2.4 → Task 2.5

Phase 3 (测试)
Task 2.4 → Task 3.1
Task 2.5 → Task 3.2

Phase 4 (迁移)
Task 2.3 → Task 4.1

Phase 5 (优化)
Phase 2 完成 → Task 5.1, Task 5.2
```

---

## 里程碑检查点

### Milestone 1: 基础设施就绪 (Day 7)
- ✅ SDK 可用
- ✅ auto-crud 支持 LBAC
- ✅ 外部插件 stubs 创建

### Milestone 2: 核心功能完成 (Day 24)
- ✅ 业务逻辑提取完成
- ✅ 插件后端 API 可用
- ✅ Admin UI 可访问

### Milestone 3: 质量验证通过 (Day 29)
- ✅ 集成测试通过
- ✅ E2E 测试通过

### Milestone 4: 生产就绪 (Day 35)
- ✅ 数据迁移完成
- ✅ 性能优化完成
- ✅ 外部平台集成完成

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| definePlugin API 设计复杂 | 中 | 高 | 先实现简化版本，后续迭代 |
| LBAC 集成破坏现有功能 | 低 | 高 | 完善集成测试，分阶段部署 |
| UI 组件提取工作量超预期 | 高 | 中 | 优先核心组件，次要组件后续补充 |
| 数据迁移脚本遗漏字段 | 中 | 高 | 详细映射文档 + dry-run 验证 |
| 外部平台集成不稳定 | 中 | 低 | 降级到 P3，可后续迭代 |

---

## 下一步行动

1. **Review 本文档** → 确认任务分解合理
2. **选择起点**:
   - 选项 A: 从 Phase 0 开始（推荐，先打基础）
   - 选项 B: 从 Phase 1 开始（并行提取业务逻辑）
   - 选项 C: 从 Task 2.1 开始（先修复 dsuni 原有问题）

3. **资源分配**:
   - 需要前端 + 后端开发者
   - 需要 QA 支持（Phase 3）

---

**状态**: 🟡 等待 Review & Approval
