# i18n.ts v3 终极优化报告

## 🎉 核心发现

`@wordrhyme/auto-crud-server` 的 delete middleware **已经自动查询并提供 `existing` 参数**！

```typescript
// auto-crud-server 类型定义 (index.d.ts line 145-151)
delete?: (params: {
  ctx: TContext;
  id: string;
  existing: unknown;  // ✅ 删除前的完整记录！
  next: () => Promise<unknown>;
}) => Promise<unknown>;
```

这意味着：
- ❌ **不需要手动查询** `ctx.db.query.xxx.findFirst()`
- ❌ **不需要手动检查** `if (!existing) throw NOT_FOUND`
- ✅ **auto-crud-server 已经处理**：查询 + NOT_FOUND 检查

---

## 📊 v3 优化成果

### messages.delete: 18 行 → 3 行 (-83.3%)

**优化前** (18 行):
```typescript
delete: async ({ ctx, input, next }) => {
  // ❌ 手动查询
  const existing = await ctx.db.query.i18nMessages.findFirst({
    where: eq(i18nMessages.id, input),
  });

  // ❌ 手动检查 NOT_FOUND
  if (!existing) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Message not found',
    });
  }

  const deleted = await next(input);

  await getCacheService().invalidateNamespace(ctx.organizationId!, existing.namespace);

  return deleted;
},
```

**优化后** (3 行):
```typescript
delete: afterDelete(async (ctx, deleted) => {
  await getCacheService().invalidateNamespace(ctx.organizationId!, deleted.namespace);
}),
```

**关键点**：
- ✅ 使用 `afterDelete` 工具函数
- ✅ `deleted` 参数由 auto-crud-server 自动提供（已查询 + 已检查）
- ✅ 只写业务逻辑（缓存失效）

---

### languages.delete: 26 行 → 13 行 (-50%)

**优化前** (26 行):
```typescript
delete: async ({ ctx, input, next }) => {
  // ❌ 手动查询
  const existing = await ctx.db.query.i18nLanguages.findFirst({
    where: eq(i18nLanguages.id, input),
  });

  // ❌ 手动检查 NOT_FOUND
  if (!existing) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Language not found',
    });
  }

  // ✅ 业务规则检查（必需）
  if (existing.isDefault) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot delete default language. Set another language as default first.',
    });
  }

  const deleted = await next(input);

  await getCacheService().invalidateLocale(ctx.organizationId!, existing.locale);

  return deleted;
},
```

**优化后** (13 行):
```typescript
delete: async ({ ctx, existing, next }) => {
  // ✅ 业务规则检查（必需）
  if (existing.isDefault) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot delete default language. Set another language as default first.',
    });
  }

  const deleted = await next();

  await getCacheService().invalidateLocale(ctx.organizationId!, existing.locale);

  return deleted;
},
```

**关键点**：
- ✅ 直接使用 `existing` 参数（auto-crud-server 已查询）
- ✅ 移除手动 NOT_FOUND 检查
- ✅ 保留业务规则检查（不能删除默认语言）

---

## 📈 完整优化统计（v1 + v2 + v3）

| 文件部分 | 原始 | v1 优化后 | v2 优化后 | v3 优化后 | 总减少 |
|---------|-----|----------|----------|----------|--------|
| **languages.create** | 24 行 | 3 行 | 3 行 | 3 行 | **-87.5%** |
| **languages.delete** | 26 行 | 26 行 | 26 行 | 13 行 | **-50%** |
| **messages.create** | 26 行 | 10 行 | 10 行 | 10 行 | **-61.5%** |
| **messages.delete** | 18 行 | 18 行 | 18 行 | 3 行 | **-83.3%** |
| **setDefault** | 28 行 | 28 行 | 33 行 | 33 行 | +5 行 (事务) |
| **batchUpdate** | 30 行 | 30 行 | 38 行 | 38 行 | +8 行 (优化) |
| **总行数** | 494 行 | 404 行 | 417 行 | 391 行 | **-20.9%** |

**v3 收益**：
- ✅ 代码减少 26 行（417 → 391 行）
- ✅ delete 操作极简化
- ✅ 消除所有冗余查询

---

## 🔑 核心技术点

### 1. afterDelete 工具函数

```typescript
// @wordrhyme/auto-crud-server 提供
import { afterDelete } from '@wordrhyme/auto-crud-server';

delete: afterDelete(async (ctx, deleted) => {
  // deleted: 被删除的完整记录
  await doSomething(deleted);
}),
```

**作用**：
- ✅ auto-crud-server 自动查询 existing
- ✅ auto-crud-server 自动检查 NOT_FOUND
- ✅ auto-crud-server 执行删除操作
- ✅ afterDelete 回调接收 deleted（= existing）

---

### 2. existing 参数

```typescript
delete: async ({ ctx, existing, next }) => {
  // existing: auto-crud-server 已查询的记录
  if (existing.someCondition) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '...' });
  }

  const deleted = await next();
  return deleted;
},
```

**作用**：
- ✅ `existing` 由 auto-crud-server 自动提供
- ✅ 如果记录不存在，auto-crud-server 已抛出 NOT_FOUND
- ✅ 可以用于业务规则检查

---

## 🎯 最佳实践总结

### ✅ DO

1. **使用 afterDelete** - 如果只做缓存失效等副作用
   ```typescript
   delete: afterDelete(async (ctx, deleted) => {
     await invalidateCache(deleted);
   }),
   ```

2. **使用 existing 参数** - 如果需要检查业务规则
   ```typescript
   delete: async ({ ctx, existing, next }) => {
     if (existing.isProtected) throw new TRPCError({...});
     const deleted = await next();
     await invalidateCache(existing);
     return deleted;
   },
   ```

3. **信任 auto-crud-server** - 它已经处理了：
   - 查询 existing
   - NOT_FOUND 检查
   - 删除操作

### ❌ DON'T

1. ❌ 手动查询记录
   ```typescript
   const existing = await ctx.db.query.xxx.findFirst({...});
   ```

2. ❌ 手动检查 NOT_FOUND
   ```typescript
   if (!existing) {
     throw new TRPCError({ code: 'NOT_FOUND', ... });
   }
   ```

3. ❌ 传递 `input` 给 `next()`
   ```typescript
   await next(input);  // ❌ 错误！next() 不需要参数
   await next();       // ✅ 正确
   ```

---

## 📋 完整优化清单

### v1 优化（已应用）✅
- [x] languages.create: 移除重复性检查（24 行 → 3 行）
- [x] messages.create: 移除手动字段注入（26 行 → 10 行）
- [x] 修复 `ctx.getScopedDb()` 错误
- [x] 创建全局数据库错误处理器

### v2 优化（已应用）✅
- [x] setDefault: 添加事务（ACID 保证）
- [x] batchUpdate: 批量查询 + 事务（200 查询 → 101 查询）

### v3 优化（已应用）✅
- [x] messages.delete: 使用 afterDelete（18 行 → 3 行）
- [x] languages.delete: 使用 existing 参数（26 行 → 13 行）

---

## 🎉 最终结果

| 指标 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **总代码行数** | 494 行 | 391 行 | **-20.9%** |
| **查询次数 (create)** | 2 次 | 1 次 | **-50%** |
| **查询次数 (delete)** | 2 次 | 1 次 | **-50%** |
| **查询次数 (batchUpdate 100 条)** | 200 次 | 101 次 | **-49.5%** |
| **事务安全** | ❌ 部分缺失 | ✅ 完整 | **提升** |
| **错误消息** | ❌ 数据库原生 | ✅ 友好 | **提升** |

---

## 🚀 使用指南

### 1. 导入工具函数

```typescript
import {
  createCrudRouter,
  afterMiddleware,  // create/update 副作用
  afterDelete,      // delete 副作用
} from '@wordrhyme/auto-crud-server';
```

### 2. 简单副作用 - 使用工具函数

```typescript
middleware: {
  create: afterMiddleware(async (ctx, created) => {
    await invalidateCache(created);
  }),

  delete: afterDelete(async (ctx, deleted) => {
    await invalidateCache(deleted);
  }),
}
```

### 3. 复杂逻辑 - 使用 middleware

```typescript
middleware: {
  delete: async ({ ctx, existing, next }) => {
    // 1. 业务规则检查（使用 existing）
    if (existing.isProtected) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '...' });
    }

    // 2. 执行删除
    const deleted = await next();

    // 3. 副作用
    await invalidateCache(existing);

    return deleted;
  },
}
```

---

**状态**: ✅ v1 + v2 + v3 全部应用完成
**文件**: `/apps/server/src/trpc/routers/i18n.ts`
**行数**: 494 行 → 391 行 (-20.9%)
**核心发现**: auto-crud-server 的 delete middleware 提供 `existing` 参数 🎉
