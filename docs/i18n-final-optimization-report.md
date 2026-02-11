# i18n.ts 完整优化完成报告

## ✅ v1 优化（已应用）

### 1. **移除重复性检查**
- languages.create: 24 行 → 3 行 **(-87.5%)**
- messages.create: 26 行 → 10 行 **(-61.5%)**
- 依赖数据库约束 + 全局错误处理器

### 2. **修复错误**
- ❌ `ctx.getScopedDb()` → ✅ `ctx.db`

### 3. **移除手动注入**
- ❌ `organizationId: ctx.organizationId!` → ✅ ScopedDb 自动注入

---

## ✅ v2 优化（已应用）

### 优化 1: **setDefault 使用事务** ✅

**优化前** (无事务):
```typescript
setDefault: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    const language = await ctx.db.query.i18nLanguages.findFirst({...});

    if (!language) {
      throw new TRPCError({...});
    }

    // ❌ 两次 UPDATE 无事务保护
    await ctx.db
      .update(i18nLanguages)
      .set({ isDefault: false })
      .where(eq(i18nLanguages.organizationId, ctx.organizationId!));

    const [updated] = await ctx.db
      .update(i18nLanguages)
      .set({ isDefault: true })
      .where(eq(i18nLanguages.id, language.id))
      .returning();

    return updated;
  }),
```

**问题分析**:
1. **并发风险**: 两个请求同时调用 → 可能产生多个默认语言
   ```
   T1: Request A: 清除所有默认
   T2: Request B: 清除所有默认
   T3: Request A: 设置 en-US 为默认
   T4: Request B: 设置 zh-CN 为默认
   结果: en-US 和 zh-CN 都是默认! ❌
   ```

2. **数据不一致**: 第一次 UPDATE 成功，第二次失败 → 没有默认语言

**优化后** (使用事务):
```typescript
setDefault: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    // ✅ 使用事务保证原子性
    const [updated] = await ctx.db.transaction(async (tx) => {
      const language = await tx.query.i18nLanguages.findFirst({...});

      if (!language) {
        throw new TRPCError({...});
      }

      // ✅ 事务内两次 UPDATE 是原子操作
      await tx
        .update(i18nLanguages)
        .set({ isDefault: false })
        .where(eq(i18nLanguages.organizationId, ctx.organizationId!));

      return await tx
        .update(i18nLanguages)
        .set({ isDefault: true })
        .where(eq(i18nLanguages.id, language.id))
        .returning();
    });

    return updated;
  }),
```

**收益**:
- ✅ **并发安全**: 事务隔离，不会产生多个默认语言
- ✅ **数据一致性**: 全部成功或全部回滚
- ✅ **ACID 保证**: 数据库级别的原子性

**测试场景**:
```typescript
// 并发场景测试
await Promise.all([
  trpc.i18n.languages.setDefault({ locale: 'en-US' }),
  trpc.i18n.languages.setDefault({ locale: 'zh-CN' }),
]);

// ✅ 只有一个会成功，另一个会等待或失败
// ✅ 绝不会出现两个默认语言
```

---

### 优化 2: **batchUpdate 使用事务 + 批量查询** ✅

**优化前** (N+1 查询):
```typescript
batchUpdate: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    const affectedNamespaces = new Set<string>();

    // ❌ N+1 查询问题
    for (const update of input.updates) {
      // ❌ 每个 update 都查询一次（N 次 SELECT）
      const message = await ctx.db.query.i18nMessages.findFirst({
        where: eq(i18nMessages.id, update.id),
      });

      if (message) {
        // ❌ 每个 update 都执行一次（N 次 UPDATE）
        await ctx.db
          .update(i18nMessages)
          .set({
            translations: update.translations,
            userModified: true,
            version: message.version + 1,
          })
          .where(eq(i18nMessages.id, update.id));

        affectedNamespaces.add(message.namespace);
      }
    }

    // 缓存失效
    const cacheService = getCacheService();
    for (const namespace of affectedNamespaces) {
      await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
    }

    return { updated: input.updates.length };
  }),
```

**问题分析**:

**场景**: 批量更新 100 条翻译

1. **N+1 查询问题**:
   ```
   SELECT * FROM i18n_messages WHERE id = '1';  -- 1
   UPDATE i18n_messages SET ... WHERE id = '1'; -- 1
   SELECT * FROM i18n_messages WHERE id = '2';  -- 2
   UPDATE i18n_messages SET ... WHERE id = '2'; -- 2
   ...
   SELECT * FROM i18n_messages WHERE id = '100'; -- 100
   UPDATE i18n_messages SET ... WHERE id = '100'; -- 100

   总查询次数: 200 次! ❌
   ```

2. **无事务保护**:
   ```
   更新 1-50 成功
   更新 51 失败（网络中断）
   结果: 部分更新，数据不一致 ❌
   ```

3. **性能问题**:
   - 100 条翻译 → 200 次数据库查询
   - 网络延迟: 200 × 10ms = 2 秒
   - 数据库负载: 200 次连接

**优化后** (批量查询 + 事务):
```typescript
batchUpdate: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    const affectedNamespaces = new Set<string>();

    // ✅ 使用事务保证原子性
    await ctx.db.transaction(async (tx) => {
      // ✅ 批量查询（1 次 SELECT 代替 N 次）
      const ids = input.updates.map(u => u.id);
      const messages = await tx.query.i18nMessages.findMany({
        where: inArray(i18nMessages.id, ids),
      });

      // ✅ 构建映射，O(1) 查找
      const messageMap = new Map(messages.map(m => [m.id, m]));

      // ✅ 批量更新（仍然是 N 次，但在事务内）
      for (const update of input.updates) {
        const message = messageMap.get(update.id);

        if (message) {
          await tx
            .update(i18nMessages)
            .set({
              translations: update.translations,
              userModified: true,
              version: message.version + 1,
            })
            .where(eq(i18nMessages.id, update.id));

          affectedNamespaces.add(message.namespace);
        }
      }
    });

    // 缓存失效
    const cacheService = getCacheService();
    for (const namespace of affectedNamespaces) {
      await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
    }

    return { updated: input.updates.length };
  }),
```

**性能对比**:

| 指标 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **SELECT 查询** | 100 次 | 1 次 | **-99%** |
| **UPDATE 查询** | 100 次 | 100 次 | 0% |
| **总查询次数** | 200 次 | 101 次 | **-49.5%** |
| **网络延迟** | ~2000ms | ~1010ms | **-49.5%** |
| **事务安全** | ❌ 无 | ✅ 有 | **提升** |

**SQL 对比**:

优化前:
```sql
-- 200 次查询
SELECT * FROM i18n_messages WHERE id = '1';
UPDATE i18n_messages SET ... WHERE id = '1';
SELECT * FROM i18n_messages WHERE id = '2';
UPDATE i18n_messages SET ... WHERE id = '2';
...（重复 100 次）
```

优化后:
```sql
BEGIN TRANSACTION;

-- 1 次批量查询
SELECT * FROM i18n_messages WHERE id IN ('1', '2', '3', ..., '100');

-- 100 次更新（但在事务内，原子操作）
UPDATE i18n_messages SET ... WHERE id = '1';
UPDATE i18n_messages SET ... WHERE id = '2';
...
UPDATE i18n_messages SET ... WHERE id = '100';

COMMIT;
```

**收益**:
- ✅ **性能提升**: 查询次数减少 50%
- ✅ **事务安全**: 全部成功或全部回滚
- ✅ **数据一致性**: 避免部分更新
- ✅ **内存优化**: Map 查找 O(1) vs 数组查找 O(N)

**测试场景**:
```typescript
// 场景 1: 正常批量更新
const result = await trpc.i18n.messages.batchUpdate({
  updates: [
    { id: '1', translations: { 'en-US': 'Hello', 'zh-CN': '你好' } },
    { id: '2', translations: { 'en-US': 'World', 'zh-CN': '世界' } },
    // ... 100 条
  ]
});

// ✅ 查询: 1 SELECT + 100 UPDATE = 101 次（vs 200 次）
// ✅ 时间: ~1s（vs ~2s）

// 场景 2: 中间失败
// ✅ 事务回滚，所有更新都不生效（数据一致性）
```

---

## 📊 完整优化统计

### 代码量对比

| 文件部分 | 原始 | v1 优化后 | v2 优化后 | 总减少 |
|---------|-----|----------|----------|--------|
| **languages.create** | 24 行 | 3 行 | 3 行 | **-87.5%** |
| **messages.create** | 26 行 | 10 行 | 10 行 | **-61.5%** |
| **setDefault** | 28 行 | 28 行 | 33 行 | +5 行 (事务) |
| **batchUpdate** | 30 行 | 30 行 | 38 行 | +8 行 (优化) |
| **总行数** | 494 行 | 404 行 | 417 行 | **-15.6%** |

**说明**: v2 增加了 13 行代码，但换来了：
- ✅ 事务安全
- ✅ 性能提升 50%
- ✅ 数据一致性

### 性能对比

| 操作 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **languages.create** | 2 次查询 | 1 次查询 | **-50%** |
| **messages.create** | 2 次查询 | 1 次查询 | **-50%** |
| **batchUpdate (100 条)** | 200 次查询 | 101 次查询 | **-49.5%** |
| **setDefault** | 3 次查询 | 3 次查询 | 0%（但事务安全） |

### 安全性对比

| 操作 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **并发重复检查** | 应用层（可绕过） | 数据库约束 | ✅ 提升 |
| **setDefault 并发** | ❌ 可能多个默认 | ✅ 事务隔离 | ✅ 修复 |
| **batchUpdate 部分失败** | ❌ 数据不一致 | ✅ 事务回滚 | ✅ 修复 |
| **错误消息** | 数据库原生错误 | 友好错误消息 | ✅ 提升 |

---

## 🎯 关键技术点

### 1. **数据库约束**

```typescript
// schema/i18n.ts line 82
uniqueIndex('i18n_languages_org_locale_uidx').on(
  table.organizationId,
  table.locale
)

uniqueIndex('i18n_messages_org_ns_key_uidx').on(
  table.organizationId,
  table.namespace,
  table.key
)
```

**作用**:
- ✅ 并发安全（数据库级别）
- ✅ 数据完整性
- ✅ 自动抛出错误码 23505

---

### 2. **全局错误处理器**

```typescript
// utils/db-error-handler.ts
export function handleDatabaseError(error: unknown): never {
  if (error.code === '23505') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Language already exists',
    });
  }
  // ...
}

// trpc/trpc.ts
const t = initTRPC.create({
  errorFormatter({ error, shape }) {
    if (error.cause) {
      try {
        handleDatabaseError(error.cause);
      } catch (dbError) {
        if (dbError instanceof TRPCError) {
          return { ...shape, message: dbError.message };
        }
      }
    }
    return shape;
  },
});
```

**作用**:
- ✅ 统一错误处理
- ✅ 友好错误消息
- ✅ 自动转换 PostgreSQL 错误码

---

### 3. **ScopedDb 自动注入**

```typescript
// db/scoped-db.ts line 668
if (schema.hasOrganizationId && !data.organizationId) {
  data.organizationId = ctx.organizationId;  // 自动注入
}
```

**作用**:
- ✅ 租户隔离
- ✅ 减少手动代码
- ✅ 避免遗漏

---

### 4. **批量查询 + 事务**

```typescript
// 批量查询
const ids = input.updates.map(u => u.id);
const messages = await tx.query.i18nMessages.findMany({
  where: inArray(i18nMessages.id, ids),  // 1 次查询
});

// Map 优化查找
const messageMap = new Map(messages.map(m => [m.id, m]));
const message = messageMap.get(update.id);  // O(1) 查找
```

**作用**:
- ✅ N+1 → 1+N（性能提升 50%）
- ✅ O(1) 查找（vs O(N)）
- ✅ 减少网络延迟

---

## 📋 测试清单

### 功能测试

- [ ] **languages.create**
  - [ ] 创建新语言成功
  - [ ] 重复创建返回 409 Conflict
  - [ ] 错误消息友好（"Language already exists"）

- [ ] **setDefault**
  - [ ] 设置默认语言成功
  - [ ] 并发设置只有一个成功
  - [ ] 事务回滚测试（模拟失败）

- [ ] **batchUpdate**
  - [ ] 批量更新 100 条成功
  - [ ] 中间失败全部回滚
  - [ ] 性能测试（vs 优化前）

### 性能测试

```bash
# 测试 batchUpdate 性能
time curl -X POST /api/i18n/messages/batchUpdate \
  -d '{ "updates": [ ... 100 items ... ] }'

# 预期结果:
# 优化前: ~2000ms
# 优化后: ~1000ms (-50%)
```

### 并发测试

```bash
# 测试 setDefault 并发安全
for i in {1..10}; do
  curl -X POST /api/i18n/languages/setDefault \
    -d '{ "locale": "en-US" }' &
done
wait

# 验证: 只有一个 isDefault=true
```

---

## 🎉 总结

### v1 优化收益（已应用）
- ✅ 代码减少 18.2%（494 → 404 行）
- ✅ 查询减少 50%（create 操作）
- ✅ 修复运行时错误（getScopedDb）

### v2 优化收益（已应用）
- ✅ batchUpdate 性能提升 50%
- ✅ setDefault 并发安全
- ✅ 事务保证数据一致性

### 最终结果
- 📊 代码：494 行 → 417 行（-15.6%）
- ⚡ 性能：查询次数减少 50%
- 🔒 安全：事务 + 数据库约束双重保护
- 🎨 体验：友好错误消息

---

**状态**: ✅ v1 + v2 全部应用完成
**文件**: `/apps/server/src/trpc/routers/i18n.ts`
**测试**: 待执行测试清单
