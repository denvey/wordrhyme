---
description: WordRhyme前后端CRUD开发最佳实践，包括auto-crud-server零配置模式、前端权限hook
---

## CRUD 开发规范 (Mandatory)

**所有新增 CRUD 功能必须使用以下模式，除非有明确理由不使用。**

### 后端：@wordrhyme/auto-crud-server

#### 零配置模式（推荐）

```typescript
// apps/server/src/trpc/routers/tasks.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';

// 🚀 零配置！Schema 自动从 table 派生
export const tasksRouter = createCrudRouter({
  table: tasks,
  // 默认排除：id, createdAt, updatedAt
});
```

#### 排除额外字段（omitFields）

```typescript
// apps/server/src/trpc/routers/i18n.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { i18nLanguages } from '@/db/schema';

export const languagesRouter = createCrudRouter({
  table: i18nLanguages,
  // 排除额外字段（默认已排除 id, createdAt, updatedAt）
  omitFields: ['organizationId'],
});

// 排除更多字段示例
export const messagesRouter = createCrudRouter({
  table: i18nMessages,
  omitFields: ['organizationId', 'userModified', 'version'],
});
```

#### 集成权限系统（完整模式）

```typescript
// apps/server/src/trpc/routers/employees.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { protectedProcedure } from '../trpc';
import { employees } from '@/db/schema';

export const employeesRouter = createCrudRouter({
  table: employees,
  omitFields: ['organizationId'],  // Schema 自动派生

  // 关键：使用 wordrhyme 的 protectedProcedure + meta 触发权限检查
  mode: 'factory',
  procedureFactory: (op) => {
    const action = op === 'list' || op === 'get' ? 'read' : op;
    return protectedProcedure.meta({
      permission: { action, subject: 'Employee' },
    });
  },
});
```

#### 自定义 updateSchema（高级场景）

仅当需要限制可更新字段时使用：

```typescript
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';
import { z } from 'zod';

export const tasksRouter = createCrudRouter({
  table: tasks,
  omitFields: ['organizationId'],
  // 自定义 updateSchema（只允许更新特定字段）
  updateSchema: z.object({
    title: z.string().optional(),
    status: z.enum(['pending', 'done']).optional(),
  }),
});
```

**权限自动生效链路**：
1. `protectedProcedure.meta({ permission })` → 触发 `globalPermissionMiddleware`
2. `PermissionKernel.require(action, subject)` → 执行 RBAC 检查
3. `permissionMeta` 写入 `AsyncLocalStorage`
4. `ScopedDb` 自动应用：ABAC 条件、字段过滤、LBAC、租户隔离

### 前端：@wordrhyme/auto-crud + useCrudPermissions

```tsx
import { z } from 'zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { useCrudPermissions } from '@/hooks/use-crud-permissions';
import { trpc } from '@/lib/trpc';

// 1. 定义 Schema
const employeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  salary: z.number(),
});

export function EmployeesPage() {
  // 2. 获取 CRUD 资源
  const resource = useAutoCrudResource({
    router: trpc.employees,
    schema: employeeSchema,
  });

  // 3. 计算权限（从全局 AbilityProvider 获取）
  const permissions = useCrudPermissions('Employee', employeeSchema);

  // 4. 渲染 AutoCrudTable
  return (
    <AutoCrudTable
      title="员工管理"
      schema={employeeSchema}
      resource={resource}
      permissions={permissions}
    />
  );
}
```

### 权限结果结构

```typescript
interface CrudPermissions {
  can?: {
    create?: boolean;  // 新建按钮
    update?: boolean;  // 编辑按钮
    delete?: boolean;  // 删除按钮
    export?: boolean;  // 导出按钮
  };
  deny?: string[];     // 隐藏的字段列表
}
```

### 不使用此模式的合理理由

仅以下情况可以不使用：

1. **非 CRUD 页面**：纯展示页面、仪表盘等
2. **无权限系统**：公开访问的页面
3. **已有手写实现**：历史代码维护，但新功能应迁移
4. **复杂查询需求**：需要自定义 JOIN、聚合等 `createCrudRouter` 不支持的场景

**如果不使用，必须在代码注释中说明原因。**

### 行级权限控制

对于依赖行数据状态的权限（如 `row.status === 'draft'` 才能编辑），使用 `actions` 配置：

```tsx
<AutoCrudTable
  schema={employeeSchema}
  resource={resource}
  permissions={permissions}  // 全局权限：can.update = true
  actions={{
    edit: {
      // 行级权限：只有 draft 状态可编辑
      visible: (row) => row.status === 'draft',
    },
    delete: {
      visible: (row) => row.status !== 'published',
    },
  }}
/>
```

**权限叠加逻辑**：
- `permissions.can.update = false` → 所有行的编辑按钮都隐藏
- `permissions.can.update = true` + `actions.edit.visible` → 按行数据决定

### 安全边界

| 层级 | 职责 | 可信任度 |
|------|------|----------|
| **前端 useCrudPermissions** | UI 优化（按钮/列显隐） | ❌ 不可信任 |
| **后端 ScopedDb** | 强制执行字段过滤、ABAC、LBAC | ✅ 安全边界 |
| **PermissionKernel** | 权限裁决唯一中心 | ✅ Core 权威 |

> **重要**：前端隐藏可被绕过，真正的安全由后端 ScopedDb 和 PermissionKernel 保证。

### 相关文件

**前端**：
- Hook: `apps/admin/src/hooks/use-crud-permissions.ts`
- 测试: `apps/admin/src/__tests__/components/use-crud-permissions.test.tsx`
- 验证页面: `/test/permissions`

**后端**：
- protectedProcedure: `apps/server/src/trpc/trpc.ts`
- PermissionKernel: `apps/server/src/permission/permission-kernel.ts`
- ScopedDb: `apps/server/src/db/scoped-db.ts`

---

## auto-crud-server 最佳实践 (Critical)

**⚠️ 涉及 CRUD 相关代码时，必须先读取 `/docs/auto-crud-server-best-practices.md`**

### 核心原则（精简版）

1. **零配置优先**：Schema 自动从 table 派生，无需手动定义
2. **信任框架能力**：auto-crud-server 已处理查询和检查
3. **依赖数据库约束**：用唯一索引代替应用层检查
4. **全局错误处理**：统一转换数据库错误为友好消息
5. **只写业务逻辑**：middleware 只处理缓存失效、业务规则检查
6. **使用工具函数**：只有 3 个 - `afterMiddleware`、`beforeMiddleware`、`composeMiddleware`

### 快速示例

```typescript
import { createCrudRouter, afterMiddleware, beforeMiddleware } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';

// 🚀 零配置基础用法
export const tasksRouter = createCrudRouter({
  table: tasks,
});

// ✅ 排除额外字段 + middleware
export const tasksRouter = createCrudRouter({
  table: tasks,
  omitFields: ['organizationId'],  // 默认已排除 id, createdAt, updatedAt
  middleware: {
    create: afterMiddleware(async (ctx, created) => {
      await invalidateCache(created);
    }),
    update: beforeMiddleware(async (ctx, data) => {
      return { ...data, updatedBy: ctx.user.id };
    }),
  },
});
```

### 常见错误

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 手动定义 selectSchema/insertSchema/updateSchema | 零配置自动派生 |
| 手动查询检查重复 | 依赖数据库唯一索引 |
| 手动注入 `organizationId` | ScopedDb 自动注入 |
| delete 手动查询 existing | 使用 `existing` 参数 |
| `await next(input)` | `await next()` |
| 使用 `afterDelete` 等 | 只用 `afterMiddleware` |

**详细文档**：`/docs/auto-crud-server-best-practices.md`（使用时必读）
**参考实现**：`apps/server/src/trpc/routers/i18n.ts`（494 行 → 391 行，-20.9%）
