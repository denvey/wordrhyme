# 验证架构设计文档

> **版本**: v1.0
> **更新日期**: 2026-01-22
> **状态**: ✅ 已实施

---

## 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [技术栈](#技术栈)
- [数据流](#数据流)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [迁移指南](#迁移指南)

---

## 概述

### 核心原则

本项目采用 **单一数据源 (Single Source of Truth)** 的验证架构:

```
Database Schema (Drizzle)
    ↓ drizzle-zod (自动生成)
Zod Schema (验证规则)
    ↓ z.infer (类型推断)
TypeScript Types (类型定义)
    ↓ tRPC (API 验证)
Service Layer (业务逻辑)
```

### 设计目标

- ✅ **零冗余**: 避免在多个层级重复定义相同的数据结构
- ✅ **类型安全**: 从数据库到前端的端到端类型推断
- ✅ **自动同步**: 修改数据库 schema 自动同步到所有层级
- ✅ **开发效率**: 减少 66% 的维护成本(3 处修改 → 1 处修改)

---

## 架构设计

### 1. 技术选型

| 层级 | 技术 | 职责 |
|------|------|------|
| **HTTP 服务器** | Fastify | 高性能 HTTP 处理 |
| **DI 容器** | NestJS | 依赖注入 + 生命周期管理 |
| **API 层** | tRPC | 类型安全的 RPC + Zod 验证 |
| **ORM** | Drizzle | 数据库操作 + Schema 定义 |
| **验证** | Zod | Schema 验证 + 类型推断 |
| **Schema 生成** | drizzle-zod | Drizzle → Zod 自动转换 |

### 2. 为什么不用传统的 NestJS 验证?

#### ❌ 传统 NestJS REST API 架构

```typescript
// 需要安装: class-validator, class-transformer

// 1. 定义 DTO 类
export class CreateMenuDto {
    @IsString()
    @MinLength(1)
    code: string;

    @IsString()
    @MinLength(1)
    label: string;

    @IsString()
    @IsOptional()
    path?: string;
}

// 2. 定义 Controller
@Controller('menus')
export class MenuController {
    @Post()
    create(@Body() dto: CreateMenuDto) {
        return this.menuService.create(dto);
    }
}

// 3. 启用全局验证
app.useGlobalPipes(new ValidationPipe());
```

**问题**:
- 🔴 需要额外的装饰器 (`@IsString`, `@MinLength`)
- 🔴 DTO 类和数据库 schema 重复定义
- 🔴 类型和验证规则分离
- 🔴 需要安装额外的包 (`class-validator`, `class-transformer`)

#### ✅ 本项目架构 (NestJS + tRPC + Zod)

```typescript
// 只需要 Zod (已安装)

// 1. 数据库 Schema (唯一的数据源)
export const menus = pgTable('menus', {
    code: text('code').notNull(),
    label: text('label').notNull(),
    path: text('path'),
});

// 2. 自动生成 Zod Schema
export const createMenuSchema = createInsertSchema(menus, {
    code: z.string().min(1),
    label: z.string().min(1),
}).pick({ code: true, label: true, path: true });

// 3. 类型推断
export type CreateMenuDto = z.infer<typeof createMenuSchema>;

// 4. tRPC Router (自动验证)
export const menuRouter = router({
    create: protectedProcedure
        .input(createMenuSchema)  // ← 验证在这里自动完成
        .mutation(async ({ input }) => {
            // input 已验证 + 类型安全
            return menuService.createItem(input);
        }),
});
```

**优势**:
- ✅ 单一数据源(数据库 schema)
- ✅ 验证 + 类型推断一体化
- ✅ 不需要装饰器
- ✅ 不需要额外的 npm 包
- ✅ 前端自动获得类型推断

---

## 技术栈

### 已安装的包

```json
{
  "dependencies": {
    "@nestjs/core": "^11.1.10",           // DI 容器
    "@nestjs/platform-fastify": "^11.1.10", // Fastify 适配器
    "@trpc/server": "^11.0.0-rc.660",     // tRPC 服务端
    "drizzle-orm": "^0.45.1",             // ORM
    "drizzle-zod": "^0.5.1",              // Drizzle → Zod
    "zod": "^3.24.1"                      // 验证库
  }
}
```

### 不需要的包

| 包 | 用途 | 为什么不需要 |
|---|---|---|
| `class-validator` | 装饰器验证 | tRPC 已用 Zod 验证 |
| `class-transformer` | 类转换 | Zod 已处理类型转换 |
| `nestjs-zod` | NestJS + Zod 集成 | 不使用 NestJS Controller |
| `@nestjs/swagger` | API 文档 | tRPC 有自己的类型系统 |

---

## 数据流

### 完整的请求处理流程

```
┌─────────────────────────────────────────────────────────┐
│ 1. 客户端请求                                            │
│    trpc.menu.create.mutate({ code, label, path })      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 2. tRPC 接收请求                                         │
│    POST /trpc/menu.create                               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Zod 自动验证 (tRPC 层)                                │
│    createMenuSchema.parse(input)                        │
│    ✅ 通过: 继续执行                                      │
│    ❌ 失败: 抛出 ZodError                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 4. TypeScript 类型推断                                   │
│    input: CreateMenuDto                                 │
│    (编译时类型检查)                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Service 层处理                                        │
│    menuService.createItem(input)                        │
│    (input 已验证 + 类型安全)                             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 6. 数据库操作 (Drizzle)                                  │
│    db.insert(menus).values(input)                       │
│    (类型安全的数据库操作)                                 │
└─────────────────────────────────────────────────────────┘
```

### 关键点

1. **验证在 tRPC 层自动完成**
   - 不需要 NestJS 的 `@Body()` 装饰器
   - 不需要 `ValidationPipe`

2. **类型推断贯穿全流程**
   - 前端: tRPC 客户端自动推断参数类型
   - 后端: TypeScript 编译时检查
   - 数据库: Drizzle 类型安全

3. **错误处理统一**
   - Zod 验证失败 → `ZodError`
   - tRPC 自动转换为标准错误响应
   - 前端自动获得类型化的错误信息

---

## 最佳实践

### 1. Schema 定义规范

#### ✅ 推荐:使用 drizzle-zod 自动生成

```typescript
// apps/server/src/db/schema/menus.ts

import { pgTable, text } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// 1. 定义数据库 Schema (唯一的数据源)
export const menus = pgTable('menus', {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    path: text('path'),  // NULL for directory menus
    icon: text('icon'),
    order: integer('order').notNull().default(0),
    target: text('target').notNull().$type<'admin' | 'web'>(),
});

// 2. 自动生成基础 Zod Schema
export const insertMenuSchema = createInsertSchema(menus, {
    // 自定义验证规则
    code: z.string().min(1, 'Code is required'),
    label: z.string().min(1, 'Label is required'),
    path: z.string().nullable().optional(),
    order: z.number().int().min(0).default(0),
    target: z.enum(['admin', 'web']),
});

// 3. 派生特定用途的 Schema
export const createMenuSchema = insertMenuSchema.pick({
    code: true,
    label: true,
    path: true,
    icon: true,
    order: true,
    target: true,
});

export const updateMenuSchema = insertMenuSchema.pick({
    label: true,
    path: true,
    icon: true,
    order: true,
}).partial();

// 4. 导出类型
export type Menu = typeof menus.$inferSelect;
export type InsertMenu = typeof menus.$inferInsert;
export type CreateMenuDto = z.infer<typeof createMenuSchema>;
export type UpdateMenuDto = z.infer<typeof updateMenuSchema>;
```

#### ❌ 避免:手动重复定义

```typescript
// ❌ 不要这样做
export interface CreateMenuDto {
    code: string;
    label: string;
    path?: string | null;
    // ... 手动定义所有字段
}

export const createMenuSchema = z.object({
    code: z.string(),
    label: z.string(),
    path: z.string().nullable().optional(),
    // ... 再次定义所有字段 (重复!)
});
```

### 2. tRPC Router 规范

```typescript
// apps/server/src/trpc/routers/menu.ts

import { router, protectedProcedure } from '../trpc';
import { createMenuSchema, updateMenuSchema } from '../../db/schema/menus';
import { menuService } from '../../services/menu.service';

export const menuRouter = router({
    // 创建菜单
    create: protectedProcedure
        .input(createMenuSchema)  // ← 直接使用生成的 schema
        .mutation(async ({ input, ctx }) => {
            return menuService.createItem(ctx.tenantId, input);
        }),

    // 更新菜单
    update: protectedProcedure
        .input(updateMenuSchema.extend({
            code: z.string(),  // 添加标识字段
        }))
        .mutation(async ({ input, ctx }) => {
            const { code, ...data } = input;
            return menuService.updateItem(ctx.tenantId, code, data);
        }),
});
```

### 3. Service 层规范

```typescript
// apps/server/src/services/menu.service.ts

import { CreateMenuDto, UpdateMenuDto } from '../db/schema/menus';

export class MenuService {
    // 使用推断的类型
    async createItem(tenantId: string, dto: CreateMenuDto): Promise<Menu> {
        // dto 已经被 tRPC 验证,这里直接使用
        return db.insert(menus).values({
            ...dto,
            tenantId,
            type: 'custom',
        }).returning();
    }

    async updateItem(
        tenantId: string,
        code: string,
        dto: UpdateMenuDto
    ): Promise<Menu> {
        // dto 已验证,类型安全
        return db.update(menus)
            .set(dto)
            .where(eq(menus.code, code))
            .returning();
    }
}
```

### 4. 前端使用规范

```typescript
// apps/admin/src/pages/Menus.tsx

import { trpc } from '../lib/trpc';

export function MenusPage() {
    // tRPC 自动推断类型
    const createMenu = trpc.menu.create.useMutation();

    const handleCreate = () => {
        createMenu.mutate({
            code: 'my-menu',
            label: 'My Menu',
            path: '/my-menu',
            // ↑ TypeScript 自动补全 + 类型检查
        });
    };

    return <button onClick={handleCreate}>Create</button>;
}
```

---

## 常见问题

### Q1: 如何添加新字段?

**A**: 只需修改数据库 schema,其他层级自动同步。

```typescript
// 1. 修改数据库 schema
export const menus = pgTable('menus', {
    // ... 现有字段
    description: text('description'),  // ← 新增字段
});

// 2. 运行数据库迁移
// pnpm db:generate && pnpm db:migrate

// 3. 完成!
// - Zod schema 自动包含新字段
// - TypeScript 类型自动更新
// - tRPC 自动验证新字段
// - 前端自动获得类型提示
```

### Q2: 如何自定义验证规则?

**A**: 在 `createInsertSchema` 的第二个参数中定义。

```typescript
export const insertMenuSchema = createInsertSchema(menus, {
    // 自定义验证
    code: z.string()
        .min(1, '代码不能为空')
        .regex(/^[a-z-]+$/, '只能包含小写字母和连字符'),

    label: z.string()
        .min(1, '标签不能为空')
        .max(50, '标签不能超过50个字符'),

    path: z.string()
        .url('必须是有效的 URL')
        .or(z.string().startsWith('/'))
        .nullable()
        .optional(),
});
```

### Q3: 如何处理复杂的跨字段验证?

**A**: 使用 Zod 的 `refine` 或 `superRefine`。

```typescript
export const createMenuSchema = insertMenuSchema
    .pick({ code: true, label: true, path: true, parentCode: true })
    .refine(
        (data) => {
            // 目录菜单(无 path)必须有子菜单
            if (!data.path && !data.parentCode) {
                return false;
            }
            return true;
        },
        {
            message: '目录菜单必须指定父菜单',
            path: ['parentCode'],
        }
    );
```

### Q4: 如何处理可选字段的 undefined vs null?

**A**: 使用工具函数统一处理。

```typescript
// apps/server/src/utils/type-helpers.ts

/**
 * 过滤 undefined 值,保留 null
 * 用于处理 Zod optional 字段
 */
export function filterUndefined<T extends Record<string, any>>(
    obj: T
): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as Partial<T>;
}

// 使用
const { code, ...inputData } = input;
const updateData = filterUndefined(inputData);
await menuService.updateItem(tenantId, code, updateData);
```

### Q5: 如何生成 API 文档?

**A**: tRPC 有自己的类型系统,不需要 Swagger。

```typescript
// 前端自动获得完整的类型信息
const result = await trpc.menu.create.mutate({...});
//    ↑ TypeScript 知道返回类型

// 如果需要文档,可以使用 tRPC-OpenAPI
// https://github.com/jlalmes/trpc-openapi
```

### Q6: 如何处理文件上传?

**A**: tRPC 支持 FormData,或使用单独的 Fastify 路由。

```typescript
// 方案 1: tRPC (小文件)
export const uploadRouter = router({
    uploadImage: protectedProcedure
        .input(z.object({
            file: z.instanceof(File),
        }))
        .mutation(async ({ input }) => {
            // 处理文件
        }),
});

// 方案 2: Fastify 路由 (大文件)
fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    // 处理文件
});
```

### Q7: 如何处理国际化验证消息?

**A**: 使用 Zod 的 `errorMap`。

```typescript
import { z } from 'zod';
import { zodI18nMap } from 'zod-i18n-map';
import i18next from 'i18next';

// 配置国际化
z.setErrorMap(zodI18nMap);

// 使用
export const createMenuSchema = z.object({
    code: z.string().min(1),  // 自动使用翻译的错误消息
});
```

---

## 迁移指南

### 从传统 NestJS 迁移到本架构

#### 步骤 1: 安装依赖

```bash
# 安装必要的包
pnpm add drizzle-orm drizzle-zod zod @trpc/server

# 移除不需要的包
pnpm remove class-validator class-transformer @nestjs/swagger
```

#### 步骤 2: 定义数据库 Schema

```typescript
// 之前: DTO 类
export class CreateUserDto {
    @IsString()
    name: string;

    @IsEmail()
    email: string;
}

// 之后: Drizzle Schema
export const users = pgTable('users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
});

export const createUserSchema = createInsertSchema(users, {
    name: z.string().min(1),
    email: z.string().email(),
}).pick({ name: true, email: true });

export type CreateUserDto = z.infer<typeof createUserSchema>;
```

#### 步骤 3: 迁移 Controller 到 tRPC

```typescript
// 之前: NestJS Controller
@Controller('users')
export class UserController {
    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.userService.create(dto);
    }
}

// 之后: tRPC Router
export const userRouter = router({
    create: protectedProcedure
        .input(createUserSchema)
        .mutation(async ({ input }) => {
            return userService.create(input);
        }),
});
```

#### 步骤 4: 更新前端调用

```typescript
// 之前: REST API
const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
});
const user = await response.json();

// 之后: tRPC
const user = await trpc.user.create.mutate({ name, email });
//    ↑ 自动类型推断 + 验证
```

---

## 性能优化

### 1. Schema 缓存

```typescript
// 缓存生成的 schema,避免重复创建
let _createMenuSchema: z.ZodSchema | null = null;

export function getCreateMenuSchema() {
    if (!_createMenuSchema) {
        _createMenuSchema = createInsertSchema(menus, {
            // ...
        }).pick({ /* ... */ });
    }
    return _createMenuSchema;
}
```

### 2. 验证性能

Zod 的验证性能已经很好,但对于超大对象可以考虑:

```typescript
// 使用 z.lazy() 延迟验证
export const recursiveMenuSchema: z.ZodSchema = z.lazy(() =>
    z.object({
        code: z.string(),
        children: z.array(recursiveMenuSchema).optional(),
    })
);
```

### 3. 类型推断优化

```typescript
// 避免过深的类型嵌套
export type CreateMenuDto = z.infer<typeof createMenuSchema>;

// 而不是
export type CreateMenuDto = z.infer<
    ReturnType<typeof createInsertSchema>['pick']
>;
```

---

## 安全考虑

### 1. 输入验证

```typescript
// ✅ 始终验证用户输入
export const createMenuSchema = z.object({
    code: z.string()
        .min(1)
        .max(100)  // 限制长度
        .regex(/^[a-zA-Z0-9-_]+$/),  // 限制字符

    path: z.string()
        .max(500)  // 防止超长 URL
        .refine(
            (val) => !val.includes('javascript:'),  // 防止 XSS
            { message: 'Invalid URL' }
        )
        .nullable()
        .optional(),
});
```

### 2. SQL 注入防护

Drizzle ORM 自动处理参数化查询,无需担心 SQL 注入:

```typescript
// ✅ 安全: Drizzle 自动参数化
await db.insert(menus).values({ code: userInput });

// ❌ 危险: 原始 SQL (避免使用)
await db.execute(sql`INSERT INTO menus (code) VALUES (${userInput})`);
```

### 3. 权限检查

```typescript
export const menuRouter = router({
    create: protectedProcedure  // ← 需要认证
        .input(createMenuSchema)
        .mutation(async ({ input, ctx }) => {
            // 检查权限
            if (!ctx.user.hasPermission('menu:create')) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            return menuService.createItem(ctx.tenantId, input);
        }),
});
```

---

## 测试策略

### 1. Schema 测试

```typescript
import { describe, it, expect } from 'vitest';
import { createMenuSchema } from '../db/schema/menus';

describe('createMenuSchema', () => {
    it('should validate valid input', () => {
        const result = createMenuSchema.safeParse({
            code: 'test-menu',
            label: 'Test Menu',
            path: '/test',
        });

        expect(result.success).toBe(true);
    });

    it('should reject invalid code', () => {
        const result = createMenuSchema.safeParse({
            code: '',  // 空字符串
            label: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Code is required');
    });
});
```

### 2. tRPC Router 测试

```typescript
import { describe, it, expect } from 'vitest';
import { createCaller } from '../trpc/router';

describe('menuRouter', () => {
    it('should create menu', async () => {
        const caller = createCaller({
            userId: 'test-user',
            tenantId: 'test-tenant',
        });

        const menu = await caller.menu.create({
            code: 'test-menu',
            label: 'Test Menu',
            path: '/test',
        });

        expect(menu.code).toBe('custom:test-menu');
    });
});
```

---

## 附录

### A. 完整示例

参考实现:
- Database Schema: `apps/server/src/db/schema/menus.ts`
- tRPC Router: `apps/server/src/trpc/routers/menu.ts`
- Service: `apps/server/src/services/menu.service.ts`
- Frontend: `apps/admin/src/pages/Menus.tsx`

### B. 相关资源

- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [drizzle-zod 文档](https://orm.drizzle.team/docs/zod)
- [Zod 文档](https://zod.dev/)
- [tRPC 文档](https://trpc.io/)
- [NestJS 文档](https://nestjs.com/)

### C. 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-01-22 | 初始版本,建立验证架构规范 |

---

## 总结

### 核心优势

1. **单一数据源**: Database Schema → Zod → TypeScript
2. **零冗余**: 消除 Service DTO 和 tRPC Schema 的重复定义
3. **自动同步**: 修改数据库 schema 自动同步到所有层级
4. **类型安全**: 端到端的类型推断和验证
5. **开发效率**: 减少 66% 的维护成本

### 关键原则

- ✅ 使用 `drizzle-zod` 自动生成 Zod schema
- ✅ 使用 `z.infer` 推断 TypeScript 类型
- ✅ tRPC 负责 API 验证,不使用 NestJS Controller
- ✅ NestJS 只负责依赖注入和生命周期管理
- ❌ 不使用 `class-validator` 或 `class-transformer`
- ❌ 不手动定义重复的 DTO 类型

### 维护建议

1. 所有数据结构从数据库 schema 开始定义
2. 使用 `drizzle-zod` 自动生成验证规则
3. 在 schema 层添加自定义验证逻辑
4. 保持 Service 层的类型推断
5. 定期审查和优化 schema 定义

---

**文档维护者**: 开发团队
**最后更新**: 2026-01-22
**下次审查**: 2026-04-22
