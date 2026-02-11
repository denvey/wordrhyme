# auto-crud-server API 更新说明

## 📋 变更摘要

**日期**：2025-01-XX
**版本**：最新版本
**影响**：中间件工具函数简化

---

## 🔄 API 变化

### 移除的函数（已废弃）

以下专用中间件函数已被移除：

```typescript
// ❌ 已移除
afterDelete(...)    // delete 操作专用
afterCreate(...)    // create 操作专用
afterUpdate(...)    // update 操作专用
afterList(...)      // list 操作专用
beforeList(...)     // list 操作专用
beforeCreate(...)   // create 操作专用
```

### 保留的函数（当前可用）

只保留 3 个通用中间件函数：

```typescript
// ✅ 保留
afterMiddleware(...)    // 适用于所有操作（create/update/delete/list）
beforeMiddleware(...)   // 适用于所有操作
composeMiddleware(...)  // 组合多个中间件
```

---

## 🔧 迁移指南

### 1. afterDelete → afterMiddleware

**之前**：
```typescript
import { afterDelete } from '@wordrhyme/auto-crud-server';

middleware: {
  delete: afterDelete(async (ctx, deleted) => {
    await invalidateCache(deleted);
  }),
}
```

**现在**：
```typescript
import { afterMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  delete: afterMiddleware(async (ctx, deleted) => {
    await invalidateCache(deleted);
  }),
}
```

### 2. afterCreate → afterMiddleware

**之前**：
```typescript
import { afterCreate } from '@wordrhyme/auto-crud-server';

middleware: {
  create: afterCreate(async (ctx, created) => {
    await sendEmail(created);
  }),
}
```

**现在**：
```typescript
import { afterMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  create: afterMiddleware(async (ctx, created) => {
    await sendEmail(created);
  }),
}
```

### 3. afterUpdate → afterMiddleware

**之前**：
```typescript
import { afterUpdate } from '@wordrhyme/auto-crud-server';

middleware: {
  update: afterUpdate(async (ctx, updated) => {
    await logAudit(updated);
  }),
}
```

**现在**：
```typescript
import { afterMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  update: afterMiddleware(async (ctx, updated) => {
    await logAudit(updated);
  }),
}
```

### 4. beforeCreate → beforeMiddleware

**之前**：
```typescript
import { beforeCreate } from '@wordrhyme/auto-crud-server';

middleware: {
  create: beforeCreate(async (ctx, input) => {
    return { ...input, slug: slugify(input.title) };
  }),
}
```

**现在**：
```typescript
import { beforeMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  create: beforeMiddleware(async (ctx, input) => {
    return { ...input, slug: slugify(input.title) };
  }),
}
```

---

## 💡 设计理由

### 为什么简化？

1. **减少 API 表面积**：从 10+ 个函数简化为 3 个
2. **更通用**：`afterMiddleware` 适用于所有操作，不需要记住每个操作的专用函数
3. **更简单**：只需要记住 `before` 和 `after` 两个概念
4. **更灵活**：组合使用 `composeMiddleware` 处理复杂场景

### 完整 middleware 依然可用

当需要访问 `existing` 参数或复杂业务逻辑时，仍可使用完整 middleware：

```typescript
middleware: {
  delete: async ({ ctx, existing, next }) => {
    // 业务规则检查
    if (existing.isProtected) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot delete protected resource',
      });
    }

    const deleted = await next();

    // 副作用
    await invalidateCache(existing);

    return deleted;
  },
}
```

---

## 📊 影响范围

### 需要更新的文件

**已更新**：
- ✅ `/docs/auto-crud-server-best-practices.md`
- ✅ `/CLAUDE.md`
- ✅ `/apps/server/src/trpc/routers/i18n.ts`（参考实现）

**可能需要更新**：
- ⚠️ 其他使用 `afterDelete` 等函数的 router 文件

---

## 🎯 最佳实践（更新）

### 推荐模式

```typescript
import {
  createCrudRouter,
  afterMiddleware,
  beforeMiddleware,
  composeMiddleware,
} from '@wordrhyme/auto-crud-server';

const router = createCrudRouter({
  table: tasks,
  insertSchema,
  updateSchema,

  middleware: {
    // ✅ 简单副作用：使用 afterMiddleware
    create: afterMiddleware(async (ctx, created) => {
      await sendEmail(created);
    }),

    // ✅ 修改输入：使用 beforeMiddleware
    update: beforeMiddleware(async (ctx, data) => {
      return { ...data, updatedBy: ctx.user.id };
    }),

    // ✅ 复杂场景：使用 composeMiddleware
    delete: composeMiddleware(
      beforeMiddleware((ctx, input) => {
        console.log('before');
        return input;
      }),
      afterMiddleware((ctx, result) => {
        console.log('after');
      }),
    ),

    // ✅ 业务逻辑：使用完整 middleware
    delete: async ({ ctx, existing, next }) => {
      if (existing.isProtected) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Protected' });
      }

      const deleted = await next();
      await invalidateCache(existing);
      return deleted;
    },
  },
});
```

---

## 📚 参考资源

- **最佳实践文档**：`/docs/auto-crud-server-best-practices.md`
- **参考实现**：`/apps/server/src/trpc/routers/i18n.ts`
- **CLAUDE.md**：快速参考指南

---

**状态**：✅ 文档已更新
**更新日期**：2025-01-XX
**影响**：所有使用 auto-crud-server 的代码
