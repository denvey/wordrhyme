# i18n Router 极简重构方案

## 🎯 核心理念

**既然用了 `@wordrhyme/auto-crud-server`，就应该充分利用它的能力，让代码更简洁！**

- ✅ 数据库约束处理重复数据（唯一索引）
- ✅ 全局错误处理器转换友好错误
- ✅ ScopedDb 自动注入 organizationId
- ✅ Middleware 只写业务逻辑（缓存失效）

---

## 📊 代码对比

### ❌ 重构前：languages.create (24 行)

```typescript
create: async ({ ctx, input, next }) => {
  const db = ctx.getScopedDb();  // ❌ 方法不存在

  // 查询数据库检查重复
  const existing = await db.query.i18nLanguages.findFirst({
    where: eq(i18nLanguages.locale, input.locale),
  });

  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Language ${input.locale} already exists`,
    });
  }

  // 手动注入 organizationId
  const data = {
    ...input,
    organizationId: ctx.organizationId!,  // ❌ ScopedDb 自动注入
  };

  const created = await next(data);

  const cacheService = getCacheService();
  await cacheService.invalidateOrganization(ctx.organizationId!);

  return created;
},
```

**问题**：
- 多查一次数据库（性能浪费）
- 手动注入 organizationId（多余）
- 代码冗长（24 行）

---

### ✅ 重构后：languages.create (3 行) 🎉

```typescript
create: afterMiddleware(async (ctx, created) => {
  await getCacheService().invalidateOrganization(ctx.organizationId!);
}),
```

**改进**：
- ✅ 零查询（依赖数据库约束）
- ✅ 自动注入（ScopedDb + schema.$defaultFn）
- ✅ 极简（3 行代码，-87.5%）
- ✅ 友好错误（全局错误处理器）

---

## 🔧 实现原理

### 1️⃣ 数据库约束（已存在）

```typescript
// apps/server/src/db/schema/i18n.ts line 82-85
uniqueIndex('i18n_languages_org_locale_uidx').on(
  table.organizationId,
  table.locale
)
```

**作用**：
- 防止同一租户创建重复 locale
- 并发安全（数据库级别保证）
- 自动抛出错误码 `23505` (unique_violation)

---

### 2️⃣ 全局错误处理器（新增）

```typescript
// apps/server/src/utils/db-error-handler.ts
export function handleDatabaseError(error: unknown): never {
  if (!isDatabaseError(error)) {
    throw error;
  }

  switch (error.code) {
    case '23505': // unique_violation
      const constraintName = error.constraint || '';
      let message = 'Resource already exists';

      if (constraintName.includes('i18n_languages')) {
        message = 'Language already exists';
      } else if (constraintName.includes('i18n_messages')) {
        message = 'Translation key already exists';
      }

      throw new TRPCError({
        code: 'CONFLICT',
        message,
      });

    case '23503': // foreign_key_violation
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Referenced resource does not exist',
      });

    // ... 其他错误码
  }
}
```

**集成到 tRPC**：

```typescript
// apps/server/src/trpc/trpc.ts
const t = initTRPC
  .context<Context>()
  .meta<Meta>()
  .create({
    errorFormatter({ error, shape }) {
      // 自动转换数据库错误
      if (error.cause) {
        try {
          handleDatabaseError(error.cause);
        } catch (dbError) {
          if (dbError instanceof TRPCError) {
            return {
              ...shape,
              data: { ...shape.data, code: dbError.code },
              message: dbError.message,
            };
          }
        }
      }
      return shape;
    },
  });
```

---

### 3️⃣ ScopedDb 自动注入（已存在）

```typescript
// apps/server/src/db/scoped-db.ts line 668-670
if (schema.hasOrganizationId && !data.organizationId && !data.organization_id) {
  data.organizationId = ctx.organizationId;  // 自动注入
}
```

**作用**：
- 从 AsyncLocalStorage 获取 `ctx.organizationId`
- 自动注入到 INSERT 数据中
- 无需手动处理

---

### 4️⃣ Middleware 只写业务逻辑

```typescript
create: afterMiddleware(async (ctx, created) => {
  // 只做缓存失效（业务逻辑）
  await getCacheService().invalidateOrganization(ctx.organizationId!);
}),
```

**职责分离**：
- ❌ 不做：重复性检查（数据库约束）
- ❌ 不做：字段注入（ScopedDb 自动）
- ✅ 只做：业务逻辑（缓存失效）

---

## 📋 完整的 middleware 对比

### Languages CRUD

| Middleware | 重构前 | 重构后 | 减少 |
|-----------|-------|-------|-----|
| **create** | 24 行 | 3 行 | -87.5% |
| **update** | 3 行 | 3 行 | 0% |
| **delete** | 26 行 | 26 行 | 0% (需检查默认语言) |

### Messages CRUD

| Middleware | 重构前 | 重构后 | 减少 |
|-----------|-------|-------|-----|
| **create** | 26 行 | 10 行 | -61.5% |
| **update** | 27 行 | 19 行 | -29.6% |
| **delete** | 18 行 | 14 行 | -22.2% |

**总代码量**：
- **重构前**: ~494 行
- **重构后**: ~380 行
- **减少**: -23%

---

## 🎬 工作流程

### 重构前（多查询）

```
用户提交: POST /api/i18n/languages/create
  ↓
1. Middleware: 查询数据库检查重复 (SELECT)
  ↓
2. 如果存在 → 返回 409 Conflict ✋
  ↓
3. 如果不存在 → 手动注入 organizationId
  ↓
4. auto-crud-server: 执行 INSERT
  ↓
5. Middleware: 缓存失效
```

**查询次数**: 2 次（1 SELECT + 1 INSERT）

---

### 重构后（零查询）

```
用户提交: POST /api/i18n/languages/create
  ↓
1. auto-crud-server: 执行 INSERT
   - ScopedDb 自动注入 organizationId
   - schema.$defaultFn 自动生成 id
  ↓
2. 数据库检查约束:
   - 如果重复 → 抛出 23505 错误 ✋
   - 如果成功 → 返回 created
  ↓
3. 全局错误处理器: 转换 23505 → CONFLICT
  ↓
4. Middleware (afterMiddleware): 缓存失效
```

**查询次数**: 1 次（1 INSERT）

**性能提升**: -50% 数据库查询

---

## 🔒 安全性对比

### 重构前

```
应用层检查 (SELECT)
  ↓
数据库约束 (INSERT)
```

**问题**: 并发情况下，两个请求都通过应用层检查，可能同时插入

---

### 重构后

```
数据库约束 (INSERT)
  ↓
全局错误处理器
```

**优势**: 数据库级别保证并发安全

---

## 🎨 错误消息对比

### 数据库原生错误 ❌

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "duplicate key value violates unique constraint \"i18n_languages_org_locale_uidx\"\nDETAIL: Key (organization_id, locale)=(org-123, en-US) already exists."
  }
}
```

**问题**:
- HTTP 500（应该是 409）
- 暴露数据库细节
- 不友好

---

### 全局错误处理器 ✅

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Language already exists"
  }
}
```

**优点**:
- HTTP 409 Conflict
- 友好的错误消息
- 隐藏实现细节

---

## 📚 完整示例代码

见 `/Users/denvey/Workspace/Coding/Personal/wordrhyme/docs/i18n-simplified-example.ts`

关键文件：
1. ✅ `/utils/db-error-handler.ts` - 数据库错误处理器（新增）
2. ✅ `/trpc/trpc.ts` - tRPC 全局错误处理（已修改）
3. ✅ `/db/schema/i18n.ts` - 数据库约束（已存在）
4. ✅ `/db/scoped-db.ts` - 自动注入（已存在）

---

## ✅ 迁移步骤

### 1. 创建错误处理器

```bash
# 已完成
apps/server/src/utils/db-error-handler.ts
```

### 2. 修改 tRPC 配置

```bash
# 已完成
apps/server/src/trpc/trpc.ts
```

### 3. 简化 i18n.ts middleware

```typescript
// languages.create: 24 行 → 3 行
create: afterMiddleware(async (ctx, created) => {
  await getCacheService().invalidateOrganization(ctx.organizationId!);
}),

// messages.create: 26 行 → 10 行
create: async ({ ctx, input, next }) => {
  const created = await next({
    ...input,
    userModified: false,
    version: 1,
  });

  await getCacheService().invalidateNamespace(ctx.organizationId!, created.namespace);

  return created;
},
```

### 4. 测试验证

```bash
# 测试创建重复语言
curl -X POST /api/i18n/languages/create \
  -d '{ "locale": "en-US", "displayName": "English" }'

# 第二次调用应该返回 409 Conflict:
# { "error": { "code": "CONFLICT", "message": "Language already exists" } }
```

---

## 🎯 收益总结

1. **代码简洁**: -23% 代码量
2. **性能提升**: -50% 数据库查询
3. **并发安全**: 数据库级别保证
4. **错误友好**: 自动转换友好消息
5. **维护性**: 职责分离，逻辑清晰

---

## 💡 最佳实践

### ✅ DO

1. **依赖数据库约束**（唯一索引、外键、非空）
2. **全局错误处理器**（统一转换数据库错误）
3. **ScopedDb 自动注入**（不手动注入 organizationId）
4. **Middleware 只写业务逻辑**（缓存失效、版本控制）
5. **afterMiddleware**（简化只有后置逻辑的场景）

### ❌ DON'T

1. ❌ 应用层重复性检查（数据库约束已足够）
2. ❌ 手动注入 organizationId（ScopedDb 自动）
3. ❌ 手动生成 id（schema.$defaultFn 自动）
4. ❌ 在 middleware 中处理所有错误（全局处理器）
5. ❌ 过度防御性编程（相信框架能力）

---

**状态**: ✅ 已完成
**文档**: `/docs/i18n-simplified-example.ts`
**工具**: `/utils/db-error-handler.ts`
