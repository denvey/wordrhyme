# currency.ts 优化报告

## 📊 优化成果

**优化前**：546 行（手动编写所有 CRUD）
**优化后**：463 行（使用 auto-crud-server）
**减少**：83 行（-15.2%）

---

## 🎯 优化内容

### 1. 引入 auto-crud-server

**优化前**：手动编写所有 CRUD 操作
```typescript
list: protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Organization context required',
    });
  }

  const service = getCurrencyService();
  return service.getAllByOrganization(ctx.organizationId);
}),

get: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization context required',
      });
    }

    const service = getCurrencyService();
    const currency = await service.getById(input.id);

    if (!currency) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Currency not found',
      });
    }

    return currency;
  }),

// ... create, update, delete 也是类似的手动编写
```

**优化后**：使用 auto-crud-server
```typescript
const currenciesCrud = createCrudRouter({
  table: currencies,
  selectSchema: selectCurrencySchema,
  insertSchema: createCurrencySchema.omit({
    // id, organizationId, createdBy 会自动处理
  }),
  updateSchema: updateCurrencySchema,
  procedureFactory: (op) => {
    const action = op === 'list' || op === 'getById' ? 'read' : op;
    return protectedProcedure.meta({
      permission: { action, subject: 'Currency' },
    });
  },
  middleware: {
    // 通过 middleware 调用 Service 层
    create: async ({ ctx, input, next }) => {
      const service = getCurrencyService();
      return await service.create({
        organizationId: ctx.organizationId!,
        ...input,
        createdBy: ctx.userId,
      });
    },
    // ... update, delete
  },
});

return router({
  ...currenciesCrud.procedures,  // ✅ 自动生成 list, getById, create, update, delete
  toggle: ...,  // ✅ 自定义操作
  setBase: ..., // ✅ 自定义操作
});
```

### 2. 移除重复的 organizationId 检查

**优化前**：每个操作都检查
```typescript
list: protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {  // ❌ 重复检查
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Organization context required',
    });
  }
  // ...
}),

get: protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {  // ❌ 重复检查
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Organization context required',
    });
  }
  // ...
}),

// ... 所有操作都重复检查
```

**优化后**：直接使用 `ctx.organizationId!`
```typescript
// auto-crud-server 会自动处理 organizationId
// rates.* 操作也简化
list: protectedProcedure
  .meta({ permission: { action: 'read', subject: 'ExchangeRate' } })
  .query(async ({ ctx }) => {
    const service = getExchangeRateService();
    return service.getAllCurrentRates(ctx.organizationId!);  // ✅ 直接使用
  }),
```

### 3. 添加权限检查元数据

**优化前**：没有权限元数据
```typescript
list: protectedProcedure.query(async ({ ctx }) => {
  // ❌ 没有权限检查元数据
  // ...
}),
```

**优化后**：所有操作都有权限元数据
```typescript
procedureFactory: (op) => {
  const action = op === 'list' || op === 'getById' ? 'read' : op;
  return protectedProcedure.meta({
    permission: { action, subject: 'Currency' },  // ✅ 权限检查
  });
},

// rates.* 操作也添加了权限元数据
list: protectedProcedure
  .meta({ permission: { action: 'read', subject: 'ExchangeRate' } })
  .query(async ({ ctx }) => {
    // ...
  }),
```

### 4. 保留 Service 层架构

**关键点**：
- ✅ auto-crud-server 的 middleware 调用 Service 层
- ✅ 保持业务逻辑在 Service 层
- ✅ tRPC Router 只是薄薄的一层

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    const service = getCurrencyService();

    // ✅ 业务逻辑在 Service 层
    return await service.create({
      organizationId: ctx.organizationId!,
      code: input.code,
      nameI18n: input.nameI18n,
      symbol: input.symbol,
      decimalDigits: input.decimalDigits,
      isEnabled: input.isEnabled,
      createdBy: ctx.userId,
    });
  },
}
```

---

## 📈 优化对比

| 指标 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **总行数** | 546 行 | 463 行 | **-15.2%** |
| **CRUD 自动化** | ❌ 手动编写 | ✅ auto-crud-server | **自动化** |
| **organizationId 检查** | 重复 10+ 次 | 0 次 | **简化** |
| **权限检查** | ❌ 无 | ✅ 所有操作 | **提升** |
| **架构** | 直接调用 Service | middleware 调用 Service | **更清晰** |

---

## 🎯 优化亮点

### 1. auto-crud-server + Service 层完美结合

**之前的误区**：认为 auto-crud-server 只能直接操作数据库

**正确做法**：通过 middleware 调用 Service 层
```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    const service = getCurrencyService();
    return await service.create({...});  // ✅ 调用 Service 层
  },
}
```

**收益**：
- ✅ 保持 Service 层的业务逻辑
- ✅ 享受 auto-crud-server 的便利（自动 CRUD、权限检查）
- ✅ 减少重复代码

### 2. 自定义操作与 CRUD 分离

**架构**：
```typescript
const currenciesCrud = createCrudRouter({...});

return router({
  ...currenciesCrud.procedures,  // ✅ 基础 CRUD（list, get, create, update, delete）
  toggle: ...,                   // ✅ 自定义操作
  setBase: ...,                  // ✅ 自定义操作
});
```

**收益**：
- ✅ 基础 CRUD 自动化
- ✅ 自定义操作保留灵活性
- ✅ 代码结构清晰

### 3. 统一权限检查

**所有操作都添加了权限元数据**：
```typescript
// currencies.*
procedureFactory: (op) => {
  const action = op === 'list' || op === 'getById' ? 'read' : op;
  return protectedProcedure.meta({
    permission: { action, subject: 'Currency' },
  });
},

// rates.*
list: protectedProcedure
  .meta({ permission: { action: 'read', subject: 'ExchangeRate' } })
  .query(...),
```

**收益**：
- ✅ 与权限系统集成
- ✅ 自动触发 RBAC 检查
- ✅ ABAC、LBAC、字段过滤自动生效

---

## 🔑 关键技术点

### 1. Service 层模式的 auto-crud-server 集成

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    const service = getCurrencyService();

    try {
      // ✅ 业务逻辑在 Service 层
      return await service.create({
        organizationId: ctx.organizationId!,
        ...input,
        createdBy: ctx.userId,
      });
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Failed to create currency',
      });
    }
  },
}
```

**关键点**：
- ✅ middleware 不调用 `next()`（因为直接调用 Service）
- ✅ Service 层处理所有业务逻辑
- ✅ Router 层只负责权限检查和错误转换

### 2. procedures 扩展模式

```typescript
const currenciesCrud = createCrudRouter({...});

return router({
  ...currenciesCrud.procedures,  // 基础 CRUD
  toggle: ...,                   // 自定义操作
  setBase: ...,                  // 自定义操作
});
```

**作用**：
- ✅ 基础 CRUD 自动生成
- ✅ 自定义操作手动编写
- ✅ 统一的路由结构

---

## 📋 后续建议

### 如果将来需要进一步优化

**可以考虑**：
1. 将 Service 层错误转换为数据库错误（使用全局错误处理器）
2. 移除 try-catch（依赖全局错误处理器）
3. 考虑是否需要 Service 层（如果业务逻辑简单）

**但目前的方案已经很好**：
- ✅ Service 层保留（业务逻辑复杂）
- ✅ auto-crud-server 简化 Router 层
- ✅ 权限系统集成
- ✅ 代码清晰易维护

---

**状态**：✅ 优化完成
**文件**：`/apps/server/src/trpc/routers/currency.ts`
**行数**：546 行 → 463 行（-15.2%）
**模式**：auto-crud-server + Service 层
